// A4 · Late-joiner lookup (docs/IDEATION-PLAN.md §5). Owner: TBD.
import { NotImplementedError } from './notImplemented.js'

/**
 * Where will the group be when someone arrives?
 *
 * @param {Array<{ id: string, seq: number, kind: string, title: string, startsAt: string, endsAt: string }>} stops
 * @param {string} arrivalAt   ISO time the member expects to arrive
 * @returns {{ status: 'before_start'|'at_stop'|'in_transit'|'after_end', stop: object|null, nextStop: object|null }}
 *          The route from the member's location to `stop` comes from OneMap and is not part of this function.
 */
export function whereIsGroup(stops, arrivalAt) {
  throw new NotImplementedError('whereIsGroup')
}
