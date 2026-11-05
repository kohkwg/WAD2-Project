export function organiserEventState(event, now) {
  if (event.status === 'draft') return 'drafts'
  if (event.status === 'cancelled') return 'cancelled'
  const end = Date.parse(event.endTime || event.startTime)
  if (event.status === 'completed' || (Number.isFinite(end) && end <= now)) return 'past'
  return 'upcoming'
}

export function organiserEventCounts(events, now) {
  const counts = { upcoming: 0, drafts: 0, past: 0, all: events.length }
  for (const event of events) {
    const state = organiserEventState(event, now)
    if (Object.hasOwn(counts, state)) counts[state]++
  }
  return counts
}

export function filterOrganiserEvents(events, { tab = 'upcoming', search = '', sort = 'soonest', pendingOnly = false, now }) {
  const query = search.trim().toLowerCase()
  return events.filter(event => {
    if (tab !== 'all' && organiserEventState(event, now) !== tab) return false
    if (pendingOnly && !(event.pendingCount > 0 && organiserEventState(event, now) === 'upcoming')) return false
    return !query || [event.title, event.venue?.name, event.venue?.address, ...(event.tags || [])]
      .some(value => String(value || '').toLowerCase().includes(query))
  }).sort((a, b) => {
    const firstState = organiserEventState(a, now)
    const secondState = organiserEventState(b, now)
    if (tab === 'all') {
      const groupOrder = { upcoming: 0, past: 1, drafts: 2, cancelled: 3 }
      const groupDifference = groupOrder[firstState] - groupOrder[secondState]
      if (groupDifference) return groupDifference
    }
    const descending = tab === 'all' ? firstState === 'past' : sort === 'newest'
    const first = Date.parse(a.startTime), second = Date.parse(b.startTime)
    if (!Number.isFinite(first) && Number.isFinite(second)) return 1
    if (Number.isFinite(first) && !Number.isFinite(second)) return -1
    const difference = first - second
    return (Number.isFinite(difference) ? difference * (descending ? -1 : 1) : 0)
      || String(a.id).localeCompare(String(b.id))
  })
}
