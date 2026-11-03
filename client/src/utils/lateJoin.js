// Late join (OpenJio specification §7): for each stop, travel from the visitor's origin
// at their departure time and require arrival at least 20 minutes before the group
// leaves. The earliest feasible stop is suggested; later feasible stops are backups.
export const MIN_OVERLAP_MINUTES = 20
const MIN = 60000

// stops: [{ id, title, start, end }]; travels: [{ minutes, live }] aligned with stops.
export function lateJoinOptions(stops, travels, departMs, minOverlap = MIN_OVERLAP_MINUTES) {
  const rows = stops.map((stop, i) => {
    const travel = travels[i]
    if (!travel || !Number.isFinite(travel.minutes)) return { stop, feasible: false, reason: 'No travel time available.' }
    const arrival = departMs + travel.minutes * MIN
    const together = (stop.end - Math.max(arrival, stop.start)) / MIN
    return { stop, travel, arrival, leaves: stop.end, together: Math.max(0, Math.round(together)), feasible: arrival <= stop.end - minOverlap * MIN }
  })
  const feasible = rows.filter(r => r.feasible)
  if (feasible.length) return { best: feasible[0], alternatives: feasible.slice(1), rows, reason: '' }
  const lastEnd = Math.max(...stops.map(s => s.end))
  const reason = !stops.length ? 'The plan has no stops yet.'
    : departMs >= lastEnd ? 'The plan has already finished.'
      : `You’d arrive less than ${minOverlap} minutes before the group leaves every stop.`
  return { best: null, alternatives: [], rows, reason }
}

export function etaMessage(option, name = 'I') {
  const time = ms => new Date(ms).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' })
  return `${name === 'I' ? 'I’m' : `${name} is`} on the way to ${option.stop.title}, arriving about ${time(option.arrival)}${option.travel.live ? '' : ' (estimated)'}.`
}
