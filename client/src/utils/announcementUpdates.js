// Keeps an event's public announcements current for everyone viewing the event (5 November).
//
// Live: Supabase Realtime only says "this event's announcements changed"; the feed then
// re-reads them through the normal RLS read, so nobody sees more than they could before.
// Realtime can't filter deletions by event (they carry only the row id), so a deletion
// triggers a re-read only when that post is on screen. A slow poll, refocusing the tab and
// coming back online cover a dropped connection.
// Demo: another tab saving the demo data fires the browser's storage event.
//
// Every browser dependency can be passed in, so the scheduling is checked offline
// (announcementUpdates.test.js). Returns a function that stops watching.
export function watchAnnouncements({
  eventId,
  onChange, // called (debounced) when the feed should be read again
  hasPost = () => false, // is this announcement id currently shown?
  client = null, // the shared browser Supabase client, live mode only
  storageKey = null, // the demo data's localStorage key, demo mode only
  intervalMs = 120_000, // a backup for a dropped live connection; live updates arrive straight away
  window: win = globalThis.window,
  document: doc = globalThis.document,
  setInterval: repeat = globalThis.setInterval,
  clearInterval: stopRepeat = globalThis.clearInterval,
  setTimeout: later = globalThis.setTimeout,
  clearTimeout: stopLater = globalThis.clearTimeout,
} = {}) {
  let stopped = false
  let timer = null
  let channel = null
  const visible = () => !stopped && doc?.visibilityState !== 'hidden'

  // Several signals close together (a post and its edit, focus + online) cause one re-read
  function notify() {
    if (!visible() || timer !== null) return
    timer = later(() => {
      timer = null
      if (visible()) onChange()
    }, 150)
  }

  if (client?.channel) {
    const filter = `event_id=eq.${eventId}`
    channel = client.channel(`announcements-${eventId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements', filter }, notify)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'announcements', filter }, notify)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'announcements' }, (payload) => {
        if (hasPost(payload?.old?.id)) notify()
      })
      // Catch up on anything posted while the connection was being made or was down
      .subscribe((status) => { if (status === 'SUBSCRIBED') notify() })
  }

  const onStorage = (event) => { if (storageKey && event.key === storageKey) notify() }
  const wake = () => notify()
  const interval = repeat(notify, intervalMs)
  win?.addEventListener('storage', onStorage)
  win?.addEventListener('focus', wake)
  win?.addEventListener('online', wake)
  doc?.addEventListener('visibilitychange', wake)

  return () => {
    stopped = true
    if (timer !== null) stopLater(timer)
    stopRepeat(interval)
    if (channel) Promise.resolve(client.removeChannel(channel)).catch(() => {})
    win?.removeEventListener('storage', onStorage)
    win?.removeEventListener('focus', wake)
    win?.removeEventListener('online', wake)
    doc?.removeEventListener('visibilitychange', wake)
  }
}
