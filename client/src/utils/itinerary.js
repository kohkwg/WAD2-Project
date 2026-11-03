// Hangout itinerary rules (adapted from the OpenJio specification §5). Pure functions.
// Listings are real Official Bookedz events (fixed times) or host-entered OneMap places
// (a duration and optional opening hours). Times are epoch ms; days use Singapore time.
import { distanceKm, eventLatLng } from './discoveryMap.js'

const MIN = 60000
const SG_OFFSET = 8 * 60 * MIN
export const PLAN_DEFAULTS = { minStops: 2, maxStops: 4, beamWidth: 12, maxWaitMinutes: 40, mealWanted: true, radiusKm: 6, wideRadiusKm: 12, poolCap: 40, mealCap: 10 }
export const MAX_STOPS = 6
export const SOFT_ISSUES = ['no_meal', 'unknown_hours', 'full_event']
const MEAL_WINDOWS = [{ name: 'lunch', from: '11:30', to: '14:00' }, { name: 'dinner', from: '17:30', to: '20:30' }]

const sgDayStart = ms => Math.floor((ms + SG_OFFSET) / 86400000) * 86400000 - SG_OFFSET
const atClock = (dayStart, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return dayStart + (h * 60 + m) * MIN }
const roundUp5 = ms => Math.ceil(ms / (5 * MIN)) * 5 * MIN
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

// Labelled estimate until a routing provider is used: short hops walk, longer ones
// take public transport with a fixed boarding allowance.
export function travelEstimate(from, to) {
  if (!from || !to) return { minutes: 0, km: 0, mode: 'none', estimated: true }
  const km = distanceKm(from, to)
  if (km < .05) return { minutes: 0, km, mode: 'none', estimated: true }
  if (km <= 1.2) return { minutes: Math.max(3, Math.round(km * 1.25 / 4.5 * 60)), km, mode: 'walk', estimated: true }
  return { minutes: Math.round(12 + km * 2.4), km, mode: 'transit', estimated: true }
}

// Normalised listing shapes.
export function eventListing(event) {
  const position = eventLatLng(event)
  const tags = event.tags || []
  return {
    id: `event:${event.id}`, type: 'event', refId: event.id, title: event.title, tags,
    kind: tags.includes('food') ? 'meal' : 'activity',
    lat: position?.lat ?? null, lng: position?.lng ?? null, venueName: event.venue?.name || '',
    fixed: { start: Date.parse(event.startTime), end: Date.parse(event.endTime) },
    spotsLeft: event.spotsLeft, available: event.status === 'published' && event.kind !== 'hangout',
  }
}
export function placeListing(place) {
  return {
    id: `place:${place.id}`, type: 'place', refId: place.id, title: place.name, tags: [],
    kind: place.kind === 'meal' ? 'meal' : 'activity', lat: place.lat, lng: place.lng,
    venueName: place.address || place.name, minutes: place.minutes, hours: place.hours || null, available: true,
  }
}

// One member's interest in a listing: first tag full weight, later tags × 0.7.
function memberMatch(weights, listing) {
  let best = 0
  listing.tags.forEach((tag, i) => { best = Math.max(best, (weights[tag] || 0) * (i === 0 ? 1 : .7)) })
  return best
}
function satisfaction(stops, members) {
  if (!stops.length || !members.length) return 0
  const perMember = members.map(m => stops.reduce((sum, s) => sum + memberMatch(m.weights, s.listing), 0) / stops.length)
  return .6 * (perMember.reduce((a, b) => a + b, 0) / perMember.length) + .4 * Math.min(...perMember)
}
export const groupMatch = (listing, members) => members.length ? members.reduce((sum, m) => sum + memberMatch(m.weights, listing), 0) / members.length : 0

// Schedule a fixed order and report every issue, even when timings are best-effort.
export function retime(listings, input, overrides = {}) {
  const options = { ...PLAN_DEFAULTS, ...overrides }
  const { slot } = input
  let t = slot.start
  let pos = input.origin
  const stops = [], legs = [], issues = []
  let travel = 0, wait = 0
  listings.forEach((listing, index) => {
    const add = (type, message, blocking = !SOFT_ISSUES.includes(type)) => issues.push({ index, type, blocking, message })
    if (!listing || !listing.available) {
      add('missing', 'This stop is no longer available.')
      stops.push({ listing, start: t, end: t, wait: 0 })
      return
    }
    const leg = travelEstimate(pos, listing)
    legs.push(leg)
    travel += leg.minutes
    // Chosen relaxation: meet later, leaving just in time for a fixed first event.
    if (options.flexibleStart && index === 0 && listing.fixed) t = Math.max(t, Math.floor((listing.fixed.start - leg.minutes * MIN) / (5 * MIN)) * 5 * MIN)
    const arrival = roundUp5(t + leg.minutes * MIN)
    let start, end
    if (listing.fixed) {
      start = listing.fixed.start
      end = listing.fixed.end
      if (arrival > start) { add('missed_event', `You’d arrive after ${listing.title} starts.`); start = arrival; end = Math.max(end, start) }
      if (listing.spotsLeft === 0) add('full_event', `${listing.title} is full; members would need a waitlist place.`)
    } else {
      start = arrival
      if (listing.hours) {
        const day = sgDayStart(arrival)
        const open = atClock(day, listing.hours.open), close = atClock(day, listing.hours.close)
        if (start < open) start = open
        end = start + listing.minutes * MIN
        if (start >= close || end > close) add('closed', `${listing.title} would be closed for part of this stop.`)
      } else {
        end = start + listing.minutes * MIN
        add('unknown_hours', `Opening hours for ${listing.title} aren’t confirmed.`)
      }
    }
    const waited = Math.max(0, start - arrival) / MIN
    wait += waited
    if (waited > options.maxWaitMinutes) add('long_wait', `A ${Math.round(waited)}-minute wait before ${listing.title}.`)
    if (end > slot.end) add('over_time', `${listing.title} runs past the end of the hangout.`)
    if (stops.length && stops[stops.length - 1].listing?.kind === 'meal' && listing.kind === 'meal') add('consecutive_meals', 'Two meals in a row.')
    stops.push({ listing, start, end, wait: waited, leg })
    t = end
    pos = listing
  })
  let mealsRequired = 0, mealsCovered = 0
  for (let day = sgDayStart(slot.start); day < slot.end; day += 86400000) {
    for (const w of MEAL_WINDOWS) {
      const w0 = atClock(day, w.from), w1 = atClock(day, w.to)
      if (overlap(slot.start, slot.end, w0, w1) < 60 * MIN) continue
      mealsRequired++
      if (stops.some(s => s.listing?.kind === 'meal' && overlap(s.start, s.end, w0, w1) >= 30 * MIN)) mealsCovered++
      else if (options.mealWanted) issues.push({ index: null, type: 'no_meal', blocking: false, message: `No meal stop covers ${w.name}.` })
    }
  }
  return { stops, legs, issues, travelMinutes: travel, waitMinutes: wait, mealsRequired, mealsCovered }
}

export function planScore(result, input) {
  const stops = result.stops.filter(s => s.listing)
  if (!stops.length) return 0
  const slotMinutes = (input.slot.end - input.slot.start) / MIN
  const variety = new Set(stops.map(s => s.listing.tags[0] || s.listing.kind)).size / stops.length
  const coverage = Math.min(1, (stops[stops.length - 1].end - input.slot.start) / (input.slot.end - input.slot.start))
  const meal = result.mealsRequired ? result.mealsCovered / result.mealsRequired : 1
  return .6 * satisfaction(stops, input.members) + .06 * variety + .08 * 0 + .12 * coverage + .12 * meal
    - .35 * (result.travelMinutes / slotMinutes) - .25 * (result.waitMinutes / slotMinutes)
}
const hardIssues = result => result.issues.filter(i => i.blocking)

// Eligible generated stops: real events with coordinates that fit inside the slot.
export function candidatePool(listings, input, overrides = {}) {
  const options = { ...PLAN_DEFAULTS, ...overrides }
  const usable = listings.filter(l => l.type === 'event' && l.available && Number.isFinite(l.lat)
    && l.fixed.start >= input.slot.start && l.fixed.end <= input.slot.end && l.spotsLeft !== 0
    && !(input.exclude || []).includes(l.id))
  const within = radius => usable.map(l => ({ l, km: distanceKm(input.origin, l) })).filter(x => x.km <= radius)
  let radius = options.radiusKm
  let near = within(radius)
  if (near.length < 12) { radius = options.wideRadiusKm; near = within(radius) }
  const ranked = near.map(x => ({ ...x, pre: .7 * groupMatch(x.l, input.members) + .3 * (1 - x.km / radius) }))
    .sort((a, b) => b.pre - a.pre || a.l.id.localeCompare(b.l.id))
  const meals = ranked.filter(x => x.l.kind === 'meal')
  const activities = ranked.filter(x => x.l.kind !== 'meal')
  const pool = [...activities, ...meals.slice(0, options.mealCap)].slice(0, options.poolCap)
  return { pool: pool.map(x => x.l), radiusKm: radius }
}

// Beam search (default width 12, 2–4 stops). Returns a plan, or a diagnosis with
// explicit relaxations for the host to choose; nothing is relaxed silently.
export function generatePlan(listings, input, overrides = {}) {
  const options = { ...PLAN_DEFAULTS, ...overrides }
  const { pool, radiusKm } = candidatePool(listings, input, options)
  let states = [{ seq: [] }]
  const completed = []
  for (let depth = 1; depth <= options.maxStops; depth++) {
    const next = []
    for (const state of states) {
      for (const c of pool) {
        if (state.seq.includes(c)) continue
        const seq = [...state.seq, c]
        const result = retime(seq, input, options)
        if (hardIssues(result).length) continue
        next.push({ seq, result, score: planScore(result, input) })
      }
    }
    next.sort((a, b) => b.score - a.score || a.seq.map(l => l.id).join().localeCompare(b.seq.map(l => l.id).join()))
    states = next.slice(0, options.beamWidth)
    completed.push(...states)
    if (!states.length) break
  }
  const best = completed
    .filter(s => s.seq.length >= options.minStops && (!options.mealWanted || s.result.mealsCovered === s.result.mealsRequired))
    .sort((a, b) => b.score - a.score)[0]
  if (best) return { ok: true, listings: best.seq, result: best.result, score: best.score, radiusKm }
  const suggestions = []
  if (!options.flexibleStart && pool.length) suggestions.push({ kind: 'later-start', label: 'Meet later, just before the first event (the plan won’t start at the hangout’s start time).' })
  if (options.minStops > 1 && completed.some(s => s.seq.length >= 1)) suggestions.push({ kind: 'one-stop', label: 'Allow a one-stop plan.' })
  if (options.mealWanted && completed.some(s => s.seq.length >= options.minStops)) suggestions.push({ kind: 'no-meal', label: 'Skip the meal requirement.' })
  suggestions.push({ kind: 'add-place', label: 'Add your own places to the plan by hand.' })
  return {
    ok: false, radiusKm, candidates: pool.length, suggestions,
    reason: pool.length
      ? `${pool.length} Official ${pool.length === 1 ? 'event fits' : 'events fit'} this time within ${radiusKm} km, but no ${options.minStops}-stop plan works without long waits, overruns or a missing meal.`
      : `No Official Bookedz events fit inside this time within ${radiusKm} km of the start area.`,
  }
}

// Same-kind replacements that keep the whole plan free of blocking issues; top three.
export function swapAlternatives(listings, index, sequence, input, overrides = {}) {
  const current = sequence[index]
  if (!current) return []
  const base = retime(sequence, input, overrides)
  const baseScore = planScore(base, input)
  const { pool } = candidatePool(listings, { ...input, exclude: sequence.map(l => l.id) })
  return pool.filter(c => c.kind === current.kind).map(c => {
    const seq = sequence.map((l, i) => (i === index ? c : l))
    const result = retime(seq, input, overrides)
    if (hardIssues(result).length) return null
    const reasons = []
    if (groupMatch(c, input.members) > groupMatch(current, input.members)) reasons.push('Better interest match')
    if (result.travelMinutes < base.travelMinutes) reasons.push('Less travel')
    if (current.fixed && c.fixed && Math.abs(c.fixed.start - current.fixed.start) <= 30 * MIN) reasons.push('Same-time fit')
    return { listing: c, score: planScore(result, input), better: planScore(result, input) > baseScore, reasons }
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 3)
}

export function memberWeights(interests, fallback) {
  const list = interests?.length ? interests : fallback || []
  return Object.fromEntries(list.map(tag => [tag, 1]))
}
