const test = require('node:test');

const {
  checkTrue,
  checkEqual,
  checkDeepEqual,
  checkThrows
} = require('./checks');

const {
  calculateEventEvidence
} = require('../services/eventEvidence');

function checkClose(actual, expected) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1e-10) {
    throw new Error(`Expected approximately ${expected}, received ${actual}`);
  }
}

const aged = (points, days) => points * 2 ** (-days / 45);

const NOW = Date.parse('2026-10-27T12:00:00Z');

const DAY = 86_400_000;

const ago = days => new Date(NOW - days * DAY).toISOString();

const active = days => ({
  active: true,
  timestamp: ago(days)
});

const attended = days => ({
  verified: true,
  timestamp: ago(days)
});

const evidence = fields => calculateEventEvidence({
  eventId: 'pottery-1',
  ...fields
}, {
  now: NOW
});
test('no history contributes zero', () => {
  checkDeepEqual(evidence({}), {
    eventId: 'pottery-1',
    effectiveAction: 'none',
    effectiveTimestamp: null,
    basePoints: 0,
    ageMultiplier: 0,
    contribution: 0
  });
});
test('save, RSVP and attendance use only the aged attendance contribution', () => {
  const result = evidence({
    save: active(5),
    rsvp: active(3),
    attendance: attended(1)
  });
  checkEqual(result.effectiveAction, 'attend');
  checkEqual(result.effectiveTimestamp, ago(1));
  checkClose(result.contribution, aged(15, 1));
});
test('recalculating an unchanged RSVP snapshot never accumulates points or refreshes time', () => {
  const recent = {
    rsvp: active(1)
  };
  checkClose(evidence(recent).contribution, aged(10, 1));
  checkDeepEqual(evidence(recent), evidence(recent));
  const snapshot = {
    rsvp: active(40)
  };
  checkDeepEqual(evidence(snapshot), evidence(snapshot));
  checkEqual(evidence(snapshot).basePoints, 10);
  checkClose(evidence(snapshot).contribution, aged(10, 40));
  checkEqual(evidence(snapshot).effectiveTimestamp, ago(40));
});
test('two distinct attendances contribute their separately aged evidence', () => {
  const results = ['pottery-1', 'pottery-2'].map((eventId, index) => evidence({
    eventId,
    attendance: attended(index * 14)
  }));
  checkEqual(new Set(results.map(result => result.eventId)).size, 2);
  checkClose(results.reduce((sum, result) => sum + result.contribution, 0), 15 + aged(15, 14));
});
test('cancelled RSVP falls back to original save; verified attendance remains strongest', () => {
  const snapshot = {
    save: active(20),
    rsvp: {
      ...active(10),
      active: false
    }
  };
  checkClose(evidence(snapshot).contribution, aged(5, 20));
  checkEqual(evidence(snapshot).effectiveTimestamp, ago(20));
  checkClose(evidence({
    ...snapshot,
    attendance: attended(1)
  }).contribution, aged(15, 1));
  checkEqual(evidence({
    save: {
      ...active(1),
      active: false
    }
  }).contribution, 0);
});
test('45-day half-life has exact anchors and decreases smoothly across old cutoffs', () => {
  for (const [days, expected] of [[0, 15], [45, 7.5], [90, 3.75], [135, 1.875]]) {
    checkClose(evidence({
      attendance: attended(days)
    }).contribution, expected);
  }
  let previous = Infinity;
  for (const days of [0, 1, 30, 45, 90, 91, 100]) {
    const current = evidence({
      attendance: attended(days)
    }).contribution;
    checkTrue(current > 0 && current < previous);
    previous = current;
  }
  for (const days of [30, 90]) {
    const at = evidence({
      attendance: attended(days)
    }).contribution;
    const after = evidence({
      attendance: {
        verified: true,
        timestamp: NOW - days * DAY - 1
      }
    }).contribution;
    checkTrue(after < at && at - after < 1e-6);
  }
});
test('recent attendance replaces old RSVP; old attendance does not fall back to a recent save', () => {
  checkClose(evidence({
    rsvp: active(40),
    attendance: attended(1)
  }).contribution, aged(15, 1));
  const result = evidence({
    save: active(1),
    attendance: attended(100)
  });
  checkEqual(result.effectiveAction, 'attend');
  checkClose(result.contribution, aged(15, 100));
});
test('dismissal suppresses saved and attended evidence without mutating history', () => {
  for (const positive of [{
    save: active(1)
  }, {
    attendance: attended(1)
  }]) {
    const snapshot = {
      ...positive,
      dismissed: true
    };
    const before = JSON.stringify(snapshot);
    const result = evidence(snapshot);
    checkEqual(result.effectiveAction, 'not_interested');
    checkEqual(result.contribution, 0);
    checkDeepEqual(evidence(snapshot), result);
    checkEqual(JSON.stringify(snapshot), before);
    checkTrue(evidence({
      ...snapshot,
      dismissed: false
    }).contribution > 0);
  }
});
test('undo dismissal uses original evidence age and affects only that event', () => {
  checkClose(evidence({
    save: active(40),
    dismissed: false
  }).contribution, aged(5, 40));
  checkClose(evidence({
    attendance: attended(100),
    dismissed: false
  }).contribution, aged(15, 100));
  checkEqual(evidence({
    eventId: 'pottery-1',
    save: active(1),
    dismissed: true
  }).contribution, 0);
  checkClose(evidence({
    eventId: 'pottery-2',
    save: active(1)
  }).contribution, aged(5, 1));
});
test('timezone offsets represent the same instant', () => {
  checkEqual(evidence({
    save: {
      active: true,
      timestamp: '2026-10-27T20:00:00+08:00'
    }
  }).contribution, 5);
});
test('unverified attendance is ignored and invalid selected timestamps are rejected', () => {
  checkClose(evidence({
    attendance: {
      verified: false,
      timestamp: ago(1)
    },
    save: active(1)
  }).contribution, aged(5, 1));
  for (const timestamp of [null, undefined, '', 'yesterday', '2026-10-27T12:00:00', NOW + 1, Infinity]) {
    checkThrows(() => evidence({
      rsvp: {
        active: true,
        timestamp
      }
    }));
  }
  checkThrows(() => evidence({
    eventId: ''
  }), TypeError);
  checkThrows(() => evidence({
    dismissed: 'false'
  }), TypeError);
  checkThrows(() => calculateEventEvidence({
    eventId: 'x'
  }, {
    now: NaN
  }), TypeError);
});
