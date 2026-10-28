// A1 · Group slot finder (docs/IDEATION-PLAN.md §5). Owner: TBD.
import { NotImplementedError } from './notImplemented.js'

/**
 * Rank the time windows when the most members are free.
 *
 * @param {object} input
 * @param {string} input.dateFrom              'YYYY-MM-DD', first day to search (Asia/Singapore)
 * @param {string} input.dateTo                'YYYY-MM-DD', last day to search
 * @param {number} input.minDurationMins       shortest window worth suggesting
 * @param {Array<{userId: string, required: boolean}>} input.members
 * @param {Array<{userId: string, kind: 'busy'|'free', startsAt: string, endsAt: string}>} input.availability
 *        Google Calendar gives 'busy' blocks; the manual grid gives 'free' blocks.
 * @param {{ earliestHour?: number, latestHour?: number }} [input.preferences]
 * @param {number} [input.limit=5]
 * @returns {Array<{ startsAt: string, endsAt: string, freeUserIds: string[], missingUserIds: string[], score: number }>}
 *          Best first. A window is only returned when every required member is free.
 */
export function findSlots(input) {
  throw new NotImplementedError('findSlots')
}
