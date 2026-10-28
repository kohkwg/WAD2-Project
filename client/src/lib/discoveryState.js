// Refresh discovery only when the signed-in identity changes. Supabase also emits
// SIGNED_IN on tab focus and TOKEN_REFRESHED; neither needs another ranking query.
export function observeDiscoverySession(client, onSession, onError) {
  let active = true
  let identity
  let authEventReceived = false
  const pending = new Set()
  function schedule(session) {
    const timer = setTimeout(() => {
      pending.delete(timer)
      const next = session?.user?.id ?? null
      if (!active || next === identity) return
      identity = next
      onSession(session)
    }, 0)
    pending.add(timer)
  }
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    authEventReceived = true
    schedule(session)
  })
  client.auth.getSession().then(({data, error}) => {
    if (!active) return
    if (error) throw error
    if (!authEventReceived) schedule(data.session)
  }).catch(error => { if (active) onError(error) })
  return () => {
    active = false
    for (const timer of pending) clearTimeout(timer)
    data.subscription.unsubscribe()
  }
}

export function demoDiscoveryEvents(events, filters = {}, now = new Date()) {
  const search = filters.search?.trim().toLowerCase()
  const categories = filters.categories?.length ? filters.categories : filters.category ? [filters.category] : []
  return events.map(event => ({
    ...event, start_time: event.startTime, end_time: event.endTime,
    category: event.tags?.[0], confirmed_count: event.confirmedCount,
    spots_left: event.spotsLeft, venue_name: event.venue?.name,
    venue_address: event.venue?.address, attendees: [],
  })).filter(event => new Date(event.start_time) > now)
    .filter(event => !search || [event.title, event.description, event.venue_name, event.venue_address].some(text => text?.toLowerCase().includes(search)))
    .filter(event => !categories.length || categories.some(tag => event.tags?.includes(tag)))
    .filter(event => !filters.tag || event.tags?.includes(filters.tag))
    .filter(event => !filters.dateFrom || new Date(event.start_time) >= new Date(`${filters.dateFrom}T00:00:00`))
    .filter(event => !filters.dateTo || new Date(event.start_time) <= new Date(`${filters.dateTo}T23:59:59.999`))
    .filter(event => !filters.availableOnly || event.capacity == null || event.spots_left > 0)
    .sort((a,b) => (filters.sort === 'popular' ? (b.confirmed_count || 0) - (a.confirmed_count || 0) : 0)
      || new Date(a.start_time) - new Date(b.start_time) || a.id.localeCompare(b.id))
}
