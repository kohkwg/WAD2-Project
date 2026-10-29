// Pure helpers for the automatic event planner (title suggestions and fitting a
// suggested programme to the new event's dates). No network, no Vue.

export const normalizeTitle = (title) => String(title ?? '').normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ')

// ilike pattern that matches the text literally (escapes %, _ and \)
export const likePattern = (query) => `%${String(query ?? '').trim().replace(/[\\%_]/g, (match) => `\\${match}`)}%`

// rows: [{ title, organiser_id, starts_at }] of published/completed events.
// Your own event names come first, then names starting with the query, then the
// names used most often and most recently.
export function rankTitleSuggestions(rows, query, userId, limit = 6) {
  const needle = normalizeTitle(query)
  if (needle.length < 2) return []
  const groups = new Map()
  for (const row of rows || []) {
    const key = normalizeTitle(row?.title)
    if (!key || !key.includes(needle)) continue
    const when = Date.parse(row.starts_at) || 0
    const group = groups.get(key) || { title: String(row.title).trim(), own: false, count: 0, latest: -Infinity }
    group.count++
    if (row.organiser_id && row.organiser_id === userId) group.own = true
    if (when >= group.latest) { group.latest = when; group.title = String(row.title).trim() }
    groups.set(key, group)
  }
  return [...groups.entries()]
    .sort(([keyA, a], [keyB, b]) => Number(b.own) - Number(a.own)
      || Number(keyB.startsWith(needle)) - Number(keyA.startsWith(needle))
      || b.count - a.count || b.latest - a.latest || keyA.localeCompare(keyB))
    .slice(0, limit)
    .map(([, group]) => ({ title: group.title, kind: group.own ? 'own' : 'community' }))
}

// Turns suggested programme items (times as fractions of the event's length) into
// real times for an event running startsAt..endsAt. Times snap to `step` minutes and
// stay inside the event.
export function resolveProgramme(items, startsAt, endsAt, step = 5) {
  const start = Date.parse(startsAt)
  const end = Date.parse(endsAt)
  const total = (end - start) / 60000
  if (!Number.isFinite(total) || total <= 0) return []
  const snap = (minutes) => Math.round(minutes / step) * step
  return (items || [])
    .map((item, index) => {
      const startMinute = Math.min(Math.max(snap(item.startFraction * total), 0), Math.max(0, total - step))
      const from = start + startMinute * 60000
      const wanted = Number.isFinite(item.durationFraction) && item.durationFraction > 0 ? Math.max(step, snap(item.durationFraction * total)) : null
      const to = wanted === null ? null : Math.min(from + wanted * 60000, end)
      return {
        title: item.title,
        description: item.description || null,
        starts_at: new Date(from).toISOString(),
        ends_at: to !== null && to > from ? new Date(to).toISOString() : null,
        position: index,
      }
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((item, index) => ({ ...item, position: index }))
}

// Adds an accepted plan to a freshly created event, one item at a time. `progress`
// ({ programme, tasks } counts already added) is updated as each item succeeds, so a
// retry after a failure carries on from where it stopped instead of repeating items.
export async function applyPlan(plan, { startsAt, endsAt }, progress, { addProgrammeItem, addTask }) {
  const programme = resolveProgramme(plan?.programme, startsAt, endsAt)
  const tasks = plan?.tasks || []
  for (let index = progress.programme; index < programme.length; index++) {
    await addProgrammeItem(programme[index])
    progress.programme = index + 1
  }
  for (let index = progress.tasks; index < tasks.length; index++) {
    await addTask(tasks[index])
    progress.tasks = index + 1
  }
  return { total: programme.length + tasks.length, done: progress.programme + progress.tasks }
}
