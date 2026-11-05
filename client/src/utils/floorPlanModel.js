// pure validation shared by feature 6 forms and tests. times are singapore local.
// eventwindow ({ start, end }, iso strings) keeps every programme item inside the event's own time

export function programmePayload(input, zones = [], eventWindow = null) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('Enter a programme title.');
  const parse = value => value ? new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}:00+08:00`) : null;
  const start = parse(input.starts_at);
  const end = parse(input.ends_at);
  if (!start || !Number.isFinite(+start)) throw new Error('Enter a valid start time.');
  if (end && (!Number.isFinite(+end) || end <= start)) throw new Error('End time must be after the start time.');
  const windowStart = eventWindow?.start ? new Date(eventWindow.start) : null;
  const windowEnd = eventWindow?.end ? new Date(eventWindow.end) : null;
  if (windowStart && Number.isFinite(+windowStart) && start < windowStart) throw new Error('A programme item can\'t start before the event does.');
  if (windowEnd && Number.isFinite(+windowEnd) && (start > windowEnd || end && end > windowEnd)) throw new Error('A programme item has to finish by the time the event ends.');
  if (input.zone_key && !zones.some(zone => zone.id === input.zone_key)) throw new Error('Choose an existing zone.');
  return {
    title,
    description: String(input.description || '').trim() || null,
    starts_at: start.toISOString(),
    ends_at: end?.toISOString() || null,
    location_label: String(input.location_label || '').trim() || null,
    zone_key: input.zone_key || null
  };
}

export function singaporeInput(value) {
  if (!value) return '';
  return new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 16);
}

export function clampPosition(item, x, y, width = 900, height = 560) {
  const radius = item.radius || 0;
  return {
    x: Math.min(Math.max(Number(x) || 0, 20 + radius), width - 20 - (item.width || radius)),
    y: Math.min(Math.max(Number(y) || 0, 20 + radius), height - 20 - (item.height || radius + 34))
  };
}

export function validateFloorImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.');
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Choose an image no larger than 10 MiB.');
}

// a plan background is stored by r2 key in the plan layout so participants can see it.
// only keys under this event's floor-plan folder become urls.

export function backgroundUrl(base, eventId, key) {
  if (!base || typeof key !== 'string' || !eventId) return '';
  if (!key.startsWith(`floorplans/${eventId}/`) || key.split('/').some(part => !part || part === '.' || part === '..') || /[?#\\]/.test(key)) return '';
  return `${String(base).replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
// largest centred rectangle of the image's proportions that fits inside the box.

export function fitContain(imageWidth, imageHeight, box) {
  if (!(imageWidth > 0) || !(imageHeight > 0)) return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height
  };
  const scale = Math.min(box.width / imageWidth, box.height / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height
  };
}
// like fitcontain, but for an image turned by `degrees` about its centre: the turned
// image's bounding box must fit the box, then `zoom` scales it about that centre
// (callers clip it to the box). returns the centre to rotate around.

export function fitRotated(imageWidth, imageHeight, box, degrees = 0, zoom = 1) {
  const angle = (Number(degrees) || 0) * Math.PI / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  if (!(imageWidth > 0) || !(imageHeight > 0)) return {
    cx: box.x + box.width / 2,
    cy: box.y + box.height / 2,
    width: box.width,
    height: box.height,
    rotation: 0
  };
  const boundsWidth = imageWidth * cos + imageHeight * sin;
  const boundsHeight = imageWidth * sin + imageHeight * cos;
  const scale = Math.min(box.width / boundsWidth, box.height / boundsHeight);
  const size = scale * clampScale(zoom);
  return {
    cx: box.x + box.width / 2,
    cy: box.y + box.height / 2,
    width: imageWidth * size,
    height: imageHeight * size,
    rotation: ((Number(degrees) || 0) % 360 + 360) % 360
  };
}
// size multiplier applied after fitting; 1 = fits the floor area exactly.

export const clampScale = value => Math.min(3, Math.max(0.5, Number(value) || 1));

export const clampRotation = value => ((Number(value) || 0) % 360 + 360) % 360;

export const clampOpacity = value => Math.min(1, Math.max(0.1, Number(value) || 1));

// where a new box or person goes: the first free spot, scanning left to right then
// top to bottom, that does not overlap anything already on the plan. null when the
// plan is too full, so callers can fall back to their old grid.

export const personFootprint = person => ({
  x: person.x - 50,
  y: person.y - (person.radius || 20),
  width: 100,
  height: (person.radius || 20) * 2 + 30
});

/** Searches the bounds, row by row, for a position that does not touch an occupied box. */
export function findFreeSpot(size, occupied, bounds, {
  step = 20,
  gap = 8
} = {}) {
  const overlaps = (a, b) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
  for (let y = bounds.y; y + size.height <= bounds.y + bounds.height; y += step) {
    for (let x = bounds.x; x + size.width <= bounds.x + bounds.width; x += step) {
      const candidate = {
        x,
        y,
        width: size.width,
        height: size.height
      };
      if (!occupied.some(item => overlaps(candidate, item))) return {
        x,
        y
      };
    }
  }
  return null;
}
