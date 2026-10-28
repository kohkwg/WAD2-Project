import { CATEGORIES } from './constants.js'

function validDate(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
}

export const WHEN_VALUES = ['today', 'weekend', 'week', 'pick_dates']

export function normalizeDiscoveryFilters(value = {}) {
  const categories = Array.isArray(value.categories)
    ? value.categories
    : typeof value.categories === 'string'
      ? [value.categories]
      : typeof value.category === 'string'
        ? [value.category]
        : []

  return {
    when: WHEN_VALUES.includes(value.when) ? value.when : '',
    extras: Array.isArray(value.extras) &&
      value.extras.includes('spots_left') ? ['spots_left'] : [],
    categories: [
      ...new Set(categories.filter(category => CATEGORIES.includes(category))),
    ],
    dateFrom: validDate(value.dateFrom) ? value.dateFrom : '',
    dateTo: validDate(value.dateTo) ? value.dateTo : '',
  }
}

// Singapore calendar days, independent of the visitor's device timezone.
export function discoveryDateRange(when, now = Date.now()) {
  if (!['today', 'weekend', 'week'].includes(when)) return {}
  const day = new Date(new Date(now).getTime() + 8 * 3600000)
  day.setUTCHours(0, 0, 0, 0)
  const weekday = day.getUTCDay()
  let first = 0, last = 0
  if (when === 'week') {
    first = -((weekday + 6) % 7)
    last = first + 6
  } else if (when === 'weekend') {
    first = weekday === 0 ? -1 : 6 - weekday
    last = first + 1
  }
  const date = offset => new Date(day.getTime() + offset * 86400000).toISOString().slice(0, 10)
  return { dateFrom: date(first), dateTo: date(last) }
}

// Query fields are derived, never a second editable filter state.
export function discoveryEventQuery(
  filters,
  { search = '', sort = 'soonest', page = 1, now = Date.now() } = {}
) {
  const selected = normalizeDiscoveryFilters(filters)
  let range = discoveryDateRange(selected.when, now)

  if (
    selected.when === 'pick_dates' &&
    selected.dateFrom &&
    selected.dateTo &&
    selected.dateFrom <= selected.dateTo
  ) {
    range = {
      dateFrom: selected.dateFrom,
      dateTo: selected.dateTo,
    }
  }

  return {
    search,
    categories: selected.categories,
    ...range,
    availableOnly: selected.extras.includes('spots_left'),
    sort,
    page,
  }
}

export function discoveryUrlQuery(
  filters, search = '', view = 'list', sort = 'soonest'
) {
  const selected = normalizeDiscoveryFilters(filters)

  return {
    view,
    search,
    when: selected.when || undefined,
    extras: selected.extras.length ? selected.extras : undefined,
    categories: selected.categories.length
      ? selected.categories : undefined,
    sort: sort === 'popular' ? sort : undefined,
    dateFrom: selected.when === 'pick_dates'
      ? selected.dateFrom || undefined : undefined,
    dateTo: selected.when === 'pick_dates'
      ? selected.dateTo || undefined : undefined,
  }
}

export function discoveryFiltersFromQuery(query) {
  const extras = Array.isArray(query.extras) ? query.extras : typeof query.extras === 'string' ? [query.extras] : []
  return normalizeDiscoveryFilters({ ...query, extras })
}
