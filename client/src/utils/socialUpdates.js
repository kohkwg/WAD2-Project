// small lifecycle-owned scheduler. dependencies are injectable for offline checks.

export function watchSocialUpdates(client, onChange, isActive, {
  window: win = globalThis.window,
  document: doc = globalThis.document,
  setInterval: repeat = globalThis.setInterval,
  clearInterval: stopRepeat = globalThis.clearInterval,
  setTimeout: later = globalThis.setTimeout,
  clearTimeout: stopLater = globalThis.clearTimeout
} = {}) {
  let stopped = false;
  let channel = null;
  let userId = null;
  let timer = null;
  let authVersion = 0;
  const visible = () => !stopped && doc?.visibilityState !== 'hidden' && isActive();
  function notify() {
    if (!visible() || timer !== null) return;
    timer = later(() => {
      timer = null;
      if (visible()) onChange();
    }, 150);
  }
  function removeChannel() {
    if (channel) Promise.resolve(client.removeChannel(channel)).catch(() => {});
    channel = null;
  }
  function setSession(session) {
    if (stopped) return;
    const nextId = session?.user?.id || null;
    if (nextId === userId) return;
    removeChannel();
    userId = nextId;
    if (!userId) return;
    const changed = () => notify();
    channel = client.channel(`profile-social-${userId}`).on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'profile_social_updates',
      filter: `user_id=eq.${userId}`
    }, changed).on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'profile_social_updates',
      filter: `user_id=eq.${userId}`
    }, changed).subscribe(status => {
      if (status === 'SUBSCRIBED') notify();
    });
    notify();
  }
  const {
    data: {
      subscription
    }
  } = client.auth.onAuthStateChange((_event, session) => {
    authVersion++;
    setSession(session);
  });
  const initialVersion = authVersion;
  Promise.resolve(client.auth.getSession()).then(({
    data,
    error
  }) => {
    if (!error && authVersion === initialVersion) setSession(data?.session);
  }).catch(() => {});
  // also works before the optional realtime signal migration is installed. once a minute keeps
  // database load low; focus and coming back online still refresh straight away.
  const interval = repeat(() => {
    if (userId) notify();
  }, 60_000);
  const wake = () => {
    if (userId) notify();
  };
  win?.addEventListener('focus', wake);
  win?.addEventListener('online', wake);
  doc?.addEventListener('visibilitychange', wake);
  return () => {
    stopped = true;
    if (timer !== null) stopLater(timer);
    stopRepeat(interval);
    subscription.unsubscribe();
    removeChannel();
    win?.removeEventListener('focus', wake);
    win?.removeEventListener('online', wake);
    doc?.removeEventListener('visibilitychange', wake);
  };
}
