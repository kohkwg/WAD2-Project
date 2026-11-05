import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createNotificationTracker, registrationNotice, eventNotice } from '../userNotifications.js';
test('old announcements form a quiet baseline; new and edited posts notify once', () => {
  const notices = [];
  const tracker = createNotificationTracker({}, notice => notices.push(notice));
  const post = {
    id: 'p1',
    version: 'first',
    message: 'New post',
    changedMessage: 'Edited post'
  };
  tracker.update('posts', [post]);
  assert.equal(notices.length, 0);
  tracker.update('posts', [post, {
    id: 'p2',
    version: 'new',
    message: 'Second post'
  }]);
  tracker.update('posts', [post, {
    id: 'p2',
    version: 'new',
    message: 'Second post'
  }]);
  tracker.update('posts', [{
    ...post,
    version: 'edit'
  }]);
  assert.deepEqual(notices.map(notice => notice.message), ['Second post', 'Edited post']);
});
test('event and group decisions use the right message and emotion', () => {
  const notices = [];
  const tracker = createNotificationTracker({}, notice => notices.push(notice));
  const row = {
    id: 'r1',
    status: 'pending',
    event: {
      kind: 'group',
      title: '[TEST] group'
    }
  };
  tracker.update('registrations', [registrationNotice(row)]);
  tracker.update('registrations', [registrationNotice({
    ...row,
    status: 'confirmed'
  })]);
  tracker.update('registrations', [registrationNotice({
    ...row,
    status: 'rejected'
  })]);
  assert.equal(notices[0].tone, 'success');
  assert.match(notices[0].message, /group request/);
  assert.equal(notices[1].tone, 'sad');
  assert.match(notices[1].message, /declined or removed/);
});
test('offers and invitations show initially, then stay seen across a reload', () => {
  const notices = [];
  const tracker = createNotificationTracker({}, notice => notices.push(notice));
  const offer = registrationNotice({
    id: 'r1',
    status: 'offered',
    event: {
      title: '[TEST] event'
    }
  });
  tracker.update('registrations', [offer]);
  const restored = createNotificationTracker(JSON.parse(JSON.stringify(tracker.snapshot())), notice => notices.push(notice));
  restored.update('registrations', [offer]);
  assert.equal(notices.length, 1);
});
test('unavailable sources do not clear history and accounts have independent baselines', () => {
  const notices = [];
  const tracker = createNotificationTracker({}, notice => notices.push(notice));
  tracker.update('a', [{
    id: '1',
    version: 'pending'
  }]);
  tracker.update('b', []);
  tracker.update('a', [{
    id: '1',
    version: 'confirmed',
    message: 'Accepted'
  }]);
  const otherAccount = createNotificationTracker({}, notice => notices.push(notice));
  otherAccount.update('a', [{
    id: '1',
    version: 'confirmed',
    message: 'Accepted'
  }]);
  assert.equal(notices.length, 1);
});
test('hidden venue details and online links do not affect public change messages', () => {
  const event = {
    id: 'e1',
    title: '[TEST] event',
    venuePending: true,
    venue: {
      name: 'secret'
    },
    hiddenVenue: {
      venue: {
        name: 'secret'
      }
    },
    onlineLink: 'https://private.example'
  };
  const notice = eventNotice(event);
  assert(!notice.version.includes('secret'));
  assert(!notice.version.includes('private.example'));
  assert(!notice.message.includes('secret'));
});
test('comparison state hashes private text and ignores new generic snapshots', () => {
  const notices = [];
  const tracker = createNotificationTracker({}, notice => notices.push(notice));
  tracker.update('events', []);
  tracker.update('events', [{
    id: 'e1',
    version: 'private name and chat text',
    notifyOnAdded: false,
    message: 'Changed'
  }]);
  assert.equal(notices.length, 0);
  assert(!tracker.snapshot().events.e1.version.includes('private'));
});
test('private group rejection keeps its group identity when the event is no longer readable', () => {
  const previous = registrationNotice({
    id: 'r1',
    status: 'pending',
    event: {
      kind: 'group',
      title: '[TEST] private group'
    }
  });
  const next = registrationNotice({
    id: 'r1',
    status: 'rejected'
  }, previous);
  assert.equal(next.isGroup, true);
  assert.match(next.message, /group request/);
  assert.equal(next.to, '/community');
});
test('check-in and cancellation use their own messages', () => {
  const event = {
    id: 'e1',
    title: '[TEST] event'
  };
  assert.match(registrationNotice({
    id: 'r1',
    status: 'confirmed',
    event,
    checkedInAt: '2026-11-05T10:00:00Z'
  }).message, /checked in/);
  assert.equal(eventNotice({
    ...event,
    status: 'cancelled'
  }).tone, 'sad');
});
