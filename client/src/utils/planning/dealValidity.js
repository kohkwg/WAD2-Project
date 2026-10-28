// A5 · Deal validity (docs/IDEATION-PLAN.md §5). Owner: TBD.
import { NotImplementedError } from './notImplemented.js'

/**
 * Is a deal usable at a given moment (Asia/Singapore)?
 *
 * @param {{ dateFrom: string|null, dateTo: string|null, daysOfWeek: number[], timeWindows: Array<{ start: string, end: string }> }} deal
 *        daysOfWeek uses 0 = Sunday … 6 = Saturday; an empty list or empty timeWindows means no restriction.
 * @param {string|Date} at
 * @returns {boolean}
 */
export function isDealValidAt(deal, at) {
  throw new NotImplementedError('isDealValidAt')
}
