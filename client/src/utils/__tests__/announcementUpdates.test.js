import test from 'node:test';
import { expect } from './expect.js';
import { watchAnnouncements } from '../announcementUpdates.js';

// offline checks of the announcement watcher: fake timers, window, document and realtime channel.

function harness({
  withClient = true,
  storageKey = null,
  shown = []
} = {}) {
  const timers = new Map();
  let nextTimer = 1;
  const listeners = {
    window: {},
    document: {}
  };
  const target = name => ({
    addEventListener: (type, fn) => {
      listeners[name][type] = fn;
    },
    removeEventListener: type => {
      delete listeners[name][type];
    }
  });
  const doc = {
    ...target('document'),
    visibilityState: 'visible'
  };
  const handlers = {};
  let removed = false;
  let subscribed;
  const channel = {
    on(_type, options, fn) {
      handlers[options.event] = {
        options,
        fn
      };
      return channel;
    },
    subscribe(fn) {
      subscribed = fn;
      return channel;
    }
  };
  const client = {
    channel: name => {
      channel.name = name;
      return channel;
    },
    removeChannel: () => {
      removed = true;
    }
  };
  let calls = 0;
  const stop = watchAnnouncements({
    eventId: 'e1',
    onChange: () => {
      calls++;
    },
    hasPost: id => shown.includes(id),
    client: withClient ? client : null,
    storageKey,
    window: target('window'),
    document: doc,
    setInterval: fn => {
      const id = nextTimer++;
      timers.set(id, {
        fn,
        repeat: true
      });
      return id;
    },
    clearInterval: id => timers.delete(id),
    setTimeout: fn => {
      const id = nextTimer++;
      timers.set(id, {
        fn
      });
      return id;
    },
    clearTimeout: id => timers.delete(id)
  });
  const flush = () => {
    for (const [id, timer] of [...timers]) if (!timer.repeat) {
      timers.delete(id);
      timer.fn();
    }
  };
  const tick = () => {
    for (const timer of [...timers.values()]) if (timer.repeat) timer.fn();
  };
  return {
    stop,
    flush,
    tick,
    handlers,
    listeners,
    doc,
    channel,
    get calls() {
      return calls;
    },
    get removed() {
      return removed;
    },
    get subscribed() {
      return subscribed;
    },
    timers
  };
}
test('Realtime inserts and edits for this event trigger one re-read', () => {
  const h = harness();
  expect(h.channel.name).toBe('announcements-e1');
  expect(h.handlers.INSERT.options.filter).toBe('event_id=eq.e1');
  expect(h.handlers.UPDATE.options.filter).toBe('event_id=eq.e1');
  h.handlers.INSERT.fn();
  h.handlers.UPDATE.fn();
  h.flush();
  expect(h.calls).toBe(1);
});
test('a deletion re-reads only when that post is on screen', () => {
  const h = harness({
    shown: ['p1']
  });
  h.handlers.DELETE.fn({
    old: {
      id: 'p9'
    }
  });
  h.flush();
  expect(h.calls).toBe(0);
  h.handlers.DELETE.fn({
    old: {
      id: 'p1'
    }
  });
  h.flush();
  expect(h.calls).toBe(1);
});
test('connecting, the slow poll, focus and coming online all catch up', () => {
  const h = harness();
  h.subscribed('SUBSCRIBED');
  h.flush();
  h.tick();
  h.flush();
  h.listeners.window.focus();
  h.flush();
  h.listeners.window.online();
  h.flush();
  expect(h.calls).toBe(4);
});
test('a hidden tab waits, then catches up when shown again', () => {
  const h = harness();
  h.doc.visibilityState = 'hidden';
  h.handlers.INSERT.fn();
  h.tick();
  h.flush();
  expect(h.calls).toBe(0);
  h.doc.visibilityState = 'visible';
  h.listeners.document.visibilitychange();
  h.flush();
  expect(h.calls).toBe(1);
});
test('demo mode listens for the demo data changing in another tab', () => {
  const h = harness({
    withClient: false,
    storageKey: 'bookedz-feature2-demo'
  });
  h.listeners.window.storage({
    key: 'something-else'
  });
  h.flush();
  expect(h.calls).toBe(0);
  h.listeners.window.storage({
    key: 'bookedz-feature2-demo'
  });
  h.flush();
  expect(h.calls).toBe(1);
});
test('stopping removes the channel, listeners and timers', () => {
  const h = harness();
  h.handlers.INSERT.fn();
  h.stop();
  h.flush();
  h.tick();
  expect(h.calls).toBe(0);
  expect(h.removed).toBe(true);
  expect(Object.keys(h.listeners.window)).toEqual([]);
  expect(Object.keys(h.listeners.document)).toEqual([]);
  expect(h.timers.size).toBe(0);
});
