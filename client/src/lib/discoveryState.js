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

// Shared display filters; recommendation scores and their server order stay intact.
export function matchesDiscoveryFilters(event, filters = {}) {
  const search = filters.search?.trim().toLowerCase()
  const categories = filters.categories?.length ? filters.categories : filters.category ? [filters.category] : []
  const tags = event.tags || event.interests || (event.category ? [event.category] : [])
  return (!search || [event.title, event.description, event.venue_name, event.venue_address].some(text => text?.toLowerCase().includes(search)))
    && (!categories.length || categories.some(tag => tags.includes(tag)))
    && (!filters.tag || tags.includes(filters.tag))
    && (!filters.dateFrom || new Date(event.start_time) >= new Date(`${filters.dateFrom}T00:00:00+08:00`))
    && (!filters.dateTo || new Date(event.start_time) <= new Date(`${filters.dateTo}T23:59:59.999+08:00`))
    && (!filters.availableOnly || event.capacity == null || event.spots_left > 0)
}

export function demoDiscoveryEvents(events, filters = {}, now = new Date()) {
  return events.map(event => ({
    ...event, start_time: event.startTime, end_time: event.endTime,
    category: event.tags?.[0], confirmed_count: event.confirmedCount,
    spots_left: event.spotsLeft, venue_name: event.venue?.name,
    venue_address: event.venue?.address, attendees: [],
  })).filter(event => new Date(event.start_time) > now)
    .filter(event => matchesDiscoveryFilters(event, filters))
    .sort((a,b) => (filters.sort === 'popular' ? (b.confirmed_count || 0) - (a.confirmed_count || 0) : 0)
      || new Date(a.start_time) - new Date(b.start_time) || a.id.localeCompare(b.id))
}

// Public event facts only: no fill-time predictions or preference score changes.
export function closingSoonEvents(events, now = Date.now()) {
  const nowMs = new Date(now).getTime()
  if (!Number.isFinite(nowMs)) return []
  const seen = new Set()
  const picks = []
  for (const event of events) {
    if (seen.has(event.id)) continue
    seen.add(event.id)
    const starts = new Date(event.start_time).getTime()
    if (!Number.isFinite(starts) || starts <= nowMs) continue
    if (event.status && event.status !== 'published') continue
    if (['confirmed', 'pending', 'waitlisted', 'offered', 'rejected'].includes(event.registration_status)) continue
    const hasDeadline = event.registration_closes_at != null && event.registration_closes_at !== ''
    const deadline = hasDeadline ? new Date(event.registration_closes_at).getTime() : null
    if (hasDeadline && (!Number.isFinite(deadline) || deadline <= nowMs)) continue
    const remaining = event.spots_left
    if (event.is_full || (typeof remaining === 'number' && remaining <= 0)) continue
    const deadlineSoon = hasDeadline && deadline - nowMs <= 48 * 60 * 60 * 1000
    const limitedPlaces = Number.isInteger(event.capacity) && event.capacity > 0
      && Number.isInteger(remaining) && remaining > 0 && remaining <= Math.min(5, event.capacity)
    if (!deadlineSoon && !limitedPlaces) continue
    const facts = []
    if (deadlineSoon) facts.push(`Registration closes ${new Date(deadline).toLocaleString('en-SG', {
      timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    })} (SGT)`)
    if (limitedPlaces) facts.push(`Only ${remaining} ${remaining === 1 ? 'place' : 'places'} left`)
    picks.push({ event: { ...event, reason: facts.join(' · ') }, deadline: deadlineSoon ? deadline : Infinity, starts })
  }
  return picks.sort((a, b) => a.deadline - b.deadline || a.starts - b.starts || a.event.id.localeCompare(b.event.id))
    .slice(0, 3).map(pick => pick.event)
}
