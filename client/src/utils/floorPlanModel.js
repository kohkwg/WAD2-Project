// Pure validation shared by Feature 6 forms and tests. Times are Singapore local.
export function programmePayload(input, zones = []) {
  const title = String(input.title || '').trim()
  if (!title) throw new Error('Enter a programme title.')
  const parse = (value) => value ? new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}:00+08:00`) : null
  const start = parse(input.starts_at)
  const end = parse(input.ends_at)
  if (!start || !Number.isFinite(+start)) throw new Error('Enter a valid start time.')
  if (end && (!Number.isFinite(+end) || end <= start)) throw new Error('End time must be after the start time.')
  if (input.zone_key && !zones.some((zone) => zone.id === input.zone_key)) throw new Error('Choose an existing zone.')
  return { title, description: String(input.description || '').trim() || null, starts_at: start.toISOString(), ends_at: end?.toISOString() || null, location_label: String(input.location_label || '').trim() || null, zone_key: input.zone_key || null }
}
export function singaporeInput(value) {
  if (!value) return ''
  return new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 16)
}
export function clampPosition(item, x, y, width = 900, height = 560) {
  const radius = item.radius || 0
  return { x: Math.min(Math.max(Number(x) || 0, 20 + radius), width - 20 - (item.width || radius)), y: Math.min(Math.max(Number(y) || 0, 20 + radius), height - 20 - (item.height || radius + 34)) }
}
export function validateFloorImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.')
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Choose an image no larger than 10 MiB.')
}
