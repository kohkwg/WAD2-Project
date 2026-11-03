// Group availability and time ranking for group hangouts (OpenJio specification §4).
// Times are epoch milliseconds; days and the preferred band use Singapore time.
// Members: [{ id, name, required, responded, intervals: [{ start, end }] }].
// "No reply" is unknown: never counted as free or as unavailable.
import { sgDateTime } from './hangouts.js'

export const CELL_MS = 30 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const SG_OFFSET_MS = 8 * HOUR_MS
export const SLOT_DEFAULTS = { minMinutes: 120, targetMinutes: 300, bandStart: 11, bandEnd: 22, topN: 5 }

export function rangeBounds(dateRange) {
  const start = sgDateTime(dateRange.start, '00:00').getTime()
  const end = sgDateTime(dateRange.end, '00:00').getTime() + 24 * HOUR_MS
  return { start, end }
}
export function rangeDays(dateRange) {
  const { start, end } = rangeBounds(dateRange)
  const days = []
  for (let t = start; t < end; t += 24 * HOUR_MS) days.push(t)
  return days
}
const sgDayStart = ms => Math.floor((ms + SG_OFFSET_MS) / (24 * HOUR_MS)) * 24 * HOUR_MS - SG_OFFSET_MS
const sgHour = ms => ((ms + SG_OFFSET_MS) % (24 * HOUR_MS)) / HOUR_MS
const isWeekend = ms => [0, 6].includes(new Date(ms + SG_OFFSET_MS).getUTCDay())

// Clip to the date range, then merge overlapping or touching intervals.
export function normaliseIntervals(intervals, bounds) {
  const clipped = (intervals || [])
    .map(i => ({ start: Math.max(i.start, bounds.start), end: Math.min(i.end, bounds.end) }))
    .filter(i => i.end > i.start)
    .sort((a, b) => a.start - b.start)
  const merged = []
  for (const i of clipped) {
    const last = merged[merged.length - 1]
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end)
    else merged.push({ ...i })
  }
  return merged
}
const covers = (intervals, start, end) => intervals.some(i => i.start <= start && i.end >= end)

// Aggregate counts per 30-minute cell; free time is rounded inward, so a partly
// free cell does not count. No individual schedule is exposed.
export function heatmap(members, dateRange) {
  const bounds = rangeBounds(dateRange)
  const responders = members.filter(m => m.responded).map(m => normaliseIntervals(m.intervals, bounds))
  const cells = []
  for (let t = bounds.start; t < bounds.end; t += CELL_MS) {
    cells.push({ start: t, count: responders.filter(iv => covers(iv, t, t + CELL_MS)).length })
  }
  return { cells, responders: responders.length }
}

function bandFraction(start, end, { bandStart, bandEnd }) {
  let inside = 0
  for (let t = start; t < end; t += CELL_MS) {
    const hour = sgHour(t)
    if (hour >= bandStart && hour + .5 <= bandEnd) inside += Math.min(CELL_MS, end - t)
  }
  return inside / (end - start)
}

// Within a qualifying window, take a target-length subslot that sits best in the
// preferred band (on-the-hour starts win ties); shorter windows are used whole.
function chooseSubslot(window, options) {
  const target = options.targetMinutes * 60000
  if (window.end - window.start <= target) return { start: window.start, end: window.end }
  let best = null
  for (let s = window.start; s + target <= window.end; s += CELL_MS) {
    const score = bandFraction(s, s + target, options) + (s % HOUR_MS === 0 ? .01 : 0)
    if (!best || score > best.score) best = { start: s, end: s + target, score }
  }
  return { start: best.start, end: best.end }
}

function splitAtDays(window) {
  const parts = []
  let start = window.start
  while (start < window.end) {
    const dayEnd = sgDayStart(start) + 24 * HOUR_MS
    const end = Math.min(dayEnd, window.end)
    parts.push({ ...window, start, end })
    start = end
  }
  return parts
}

function candidateWindows(responders, bounds, requiredIds) {
  const points = [...new Set(responders.flatMap(m => m.free.flatMap(i => [i.start, i.end])))].sort((a, b) => a - b)
  const segments = []
  for (let k = 0; k + 1 < points.length; k++) {
    const start = points[k], end = points[k + 1]
    const ids = responders.filter(m => covers(m.free, start, end)).map(m => m.id)
    if (ids.length) segments.push({ start, end, ids })
  }
  const byGroup = new Map()
  for (let i = 0; i < segments.length; i++) {
    let set = new Set(segments[i].ids)
    for (let j = i; j < segments.length; j++) {
      if (j > i) {
        if (segments[j].start !== segments[j - 1].end) break
        set = new Set([...set].filter(id => segments[j].ids.includes(id)))
        if (!set.size) break
      }
      if (![...requiredIds].every(id => set.has(id))) continue
      const key = [...set].sort().join('|')
      if (!byGroup.has(key)) byGroup.set(key, [])
      byGroup.get(key).push({ start: segments[i].start, end: segments[j].end })
    }
  }
  const windows = []
  for (const [key, list] of byGroup) {
    for (const w of normaliseIntervals(list, bounds)) windows.push({ ...w, ids: key.split('|') })
  }
  return windows
}

export function rankSlots(members, dateRange, overrides = {}) {
  const options = { ...SLOT_DEFAULTS, ...overrides }
  const bounds = rangeBounds(dateRange)
  const responders = members.filter(m => m.responded).map(m => ({ ...m, free: normaliseIntervals(m.intervals, bounds) }))
  const noReply = members.filter(m => !m.responded)
  const pendingRequired = members.filter(m => m.required && !m.responded)
  const base = { options: [], noReply, pendingRequired, responders: responders.length, total: members.length }
  if (!responders.length || pendingRequired.length) return base

  const requiredIds = new Set(members.filter(m => m.required).map(m => m.id))
  const minMs = options.minMinutes * 60000
  let windows = candidateWindows(responders, bounds, requiredIds)
    .flatMap(splitAtDays)
    .filter(w => w.end - w.start >= minMs)
  // A smaller group's window is dropped when a larger group covers that interval.
  windows = windows.filter(w => !windows.some(o => o !== w && o.ids.length > w.ids.length
    && w.ids.every(id => o.ids.includes(id)) && o.start <= w.start && o.end >= w.end))

  const target = options.targetMinutes * 60000
  const scored = windows.map(w => {
    const slot = chooseSubslot(w, options)
    const band = bandFraction(slot.start, slot.end, options)
    const attendance = w.ids.length / members.length
    const score = .6 * attendance + .2 * Math.min(1, (slot.end - slot.start) / target) + .15 * band + .05 * (isWeekend(slot.start) ? 1 : 0)
    return { ...slot, ids: w.ids, window: { start: w.start, end: w.end }, band, score, id: `${slot.start}-${slot.end}-${w.ids.join('.')}` }
  }).sort((a, b) => b.score - a.score || a.start - b.start || a.id.localeCompare(b.id))

  const seen = new Set()
  const ranked = []
  for (const s of scored) {
    const key = `${s.start}-${s.end}`
    if (seen.has(key)) continue
    seen.add(key)
    ranked.push(explain(s, members))
    if (ranked.length >= options.topN) break
  }
  return { ...base, options: ranked }
}

function explain(slot, members) {
  const available = members.filter(m => slot.ids.includes(m.id))
  return {
    start: slot.start, end: slot.end, score: slot.score, window: slot.window,
    available,
    cannot: members.filter(m => m.responded && !slot.ids.includes(m.id)),
    noReply: members.filter(m => !m.responded),
    bandFraction: slot.band,
    minutes: (slot.end - slot.start) / 60000,
  }
}

// Checks a host-chosen interval without saving anything. Required responders must be
// free for the whole interval; unknown is never converted into available.
export function previewSlot(members, dateRange, slot) {
  const bounds = rangeBounds(dateRange)
  const blockers = []
  const minutes = (slot.end - slot.start) / 60000
  if (!(slot.start >= bounds.start && slot.end <= bounds.end)) blockers.push('The time must fall inside the hangout’s dates.')
  if (!(minutes >= 60 && minutes <= 720)) blockers.push('Choose between 1 and 12 hours.')
  const available = [], cannot = [], noReply = []
  for (const m of members) {
    if (!m.responded) { noReply.push(m); continue }
    if (covers(normaliseIntervals(m.intervals, bounds), slot.start, slot.end)) available.push(m)
    else cannot.push(m)
  }
  for (const m of members.filter(x => x.required)) {
    if (!m.responded) blockers.push(`${m.name} is required and hasn’t replied yet.`)
    else if (cannot.includes(m)) blockers.push(`${m.name} is required but isn’t free for all of this time.`)
  }
  return { ok: blockers.length === 0, blockers, available, cannot, noReply }
}

// Explicit alternatives when no strict option exists. None is applied automatically.
export function rescueSuggestions(members, dateRange, hostId) {
  const result = rankSlots(members, dateRange)
  if (result.options.length || !result.responders) return []
  const suggestions = []
  if (result.pendingRequired.length) suggestions.push({ kind: 'wait', label: `Wait for ${result.pendingRequired.map(m => m.name).join(', ')} to reply (required).` })
  for (const m of members.filter(x => x.required && x.responded && x.id !== hostId)) {
    const relaxed = members.map(x => x.id === m.id ? { ...x, required: false } : x)
    if (rankSlots(relaxed, dateRange).options.length) suggestions.push({ kind: 'optional', memberId: m.id, label: `Make ${m.name} optional (times without them exist).` })
  }
  if (!result.pendingRequired.length && rankSlots(members, dateRange, { minMinutes: 60 }).options.length) {
    suggestions.push({ kind: 'shorter', label: 'Look at shorter times, down to 1 hour.' })
  }
  if (rangeDays(dateRange).length < 7) suggestions.push({ kind: 'extend', label: 'Add more days to the date range (up to 7).' })
  return suggestions
}

// Grid conversions. Cells are 30-minute starts; free time rounds inward so a partly
// free cell is never shown (or saved) as free.
export function cellsFromIntervals(intervals) {
  const cells = new Set()
  for (const i of intervals || []) {
    for (let t = Math.ceil(i.start / CELL_MS) * CELL_MS; t + CELL_MS <= i.end; t += CELL_MS) cells.add(t)
  }
  return cells
}
export function intervalsFromCells(cells) {
  const sorted = [...cells].sort((a, b) => a - b)
  const intervals = []
  for (const t of sorted) {
    const last = intervals[intervals.length - 1]
    if (last && last.end === t) last.end = t + CELL_MS
    else intervals.push({ start: t, end: t + CELL_MS })
  }
  return intervals
}
