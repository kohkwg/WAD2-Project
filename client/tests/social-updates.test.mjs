import test from 'node:test';
import assert from 'node:assert/strict';
import { watchSocialUpdates } from '../src/utils/socialUpdates.js';

function fixture(session = {
  user: {
    id: 'test2'
  }
}) {
  const win = new EventTarget(),
    doc = new EventTarget();
  doc.visibilityState = 'visible';
  let authCallback,
    intervalCallback,
    authStopped = false,
    updates = 0,
    enabled = true;
  const timers = new Map(),
    channels = [],
    removed = [];
  let nextTimer = 1;
  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session
        }
      }),
      onAuthStateChange(callback) {
        authCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe() {
                authStopped = true;
              }
            }
          }
        };
      }
    },
    channel(name) {
      const channel = {
        name,
        handlers: [],
        on(type, config, callback) {
          this.handlers.push({
            type,
            config,
            callback
          });
          return this;
        },
        subscribe(callback) {
          this.status = callback;
          return this;
        }
      };
      channels.push(channel);
      return channel;
    },
    removeChannel(channel) {
      removed.push(channel);
    }
  };
  const stop = watchSocialUpdates(client, () => updates++, () => enabled, {
    window: win,
    document: doc,
    setInterval(callback, delay) {
      assert.equal(delay, 60_000);
      intervalCallback = callback;
      return 1;
    },
    clearInterval() {
      intervalCallback = null;
    },
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    }
  });
  return {
    stop,
    win,
    doc,
    channels,
    removed,
    get updates() {
      return updates;
    },
    get authStopped() {
      return authStopped;
    },
    auth(session) {
      authCallback('SIGNED_IN', session);
    },
    setEnabled(value) {
      enabled = value;
    },
    poll() {
      intervalCallback?.();
    },
    flush() {
      for (const [id, callback] of [...timers]) {
        timers.delete(id);
        callback();
      }
    }
  };
}

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
test('subscribes only to caller INSERT/UPDATE signals and coalesces events', async () => {
  const f = fixture();
  await settle();
  f.flush();
  assert.equal(f.channels.length, 1);
  assert.deepEqual(f.channels[0].handlers.map(h => h.config.event), ['INSERT', 'UPDATE']);
  assert.ok(f.channels[0].handlers.every(h => h.config.table === 'profile_social_updates' && h.config.filter === 'user_id=eq.test2'));
  const baseline = f.updates;
  f.channels[0].handlers[0].callback();
  f.channels[0].handlers[1].callback();
  f.channels[0].status('SUBSCRIBED');
  f.flush();
  assert.equal(f.updates, baseline + 1);
  f.stop();
});
test('poll/focus/reconnect refresh only visible social tools', async () => {
  const f = fixture();
  await settle();
  f.flush();
  const baseline = f.updates;
  f.doc.visibilityState = 'hidden';
  f.poll();
  f.flush();
  assert.equal(f.updates, baseline);
  f.doc.visibilityState = 'visible';
  f.setEnabled(false);
  f.win.dispatchEvent(new Event('focus'));
  f.poll();
  f.flush();
  assert.equal(f.updates, baseline);
  f.setEnabled(true);
  f.win.dispatchEvent(new Event('online'));
  f.win.dispatchEvent(new Event('focus'));
  f.flush();
  assert.equal(f.updates, baseline + 1);
  f.poll();
  f.flush();
  assert.equal(f.updates, baseline + 2);
  f.stop();
});
test('cleanup removes channel/auth listeners/timers and late callbacks do nothing', async () => {
  const f = fixture();
  await settle();
  f.stop();
  f.flush();
  f.win.dispatchEvent(new Event('focus'));
  f.channels[0].handlers[0].callback();
  f.poll();
  f.flush();
  assert.equal(f.updates, 0);
  assert.equal(f.removed.length, 1);
  assert.equal(f.authStopped, true);
});
test('account changes remove old subscription and install a new caller filter', async () => {
  const f = fixture();
  await settle();
  f.auth({
    user: {
      id: 'test3'
    }
  });
  assert.equal(f.removed.length, 1);
  assert.equal(f.channels.length, 2);
  assert.equal(f.channels[1].handlers[0].config.filter, 'user_id=eq.test3');
  f.auth(null);
  assert.equal(f.removed.length, 2);
  f.stop();
});
test('new auth event wins over an older initial session lookup', async () => {
  const f = fixture();
  f.auth({
    user: {
      id: 'new'
    }
  });
  await settle();
  assert.equal(f.channels.length, 1);
  assert.equal(f.channels[0].handlers[0].config.filter, 'user_id=eq.new');
  f.stop();
});
