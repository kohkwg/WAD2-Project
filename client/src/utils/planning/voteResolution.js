// A3 · Block vote resolution (docs/IDEATION-PLAN.md §5). Owner: TBD.
import { NotImplementedError } from './notImplemented.js'

/**
 * Apply members' votes to an itinerary.
 *
 * @param {{ stops: Array<{ id: string, votes: Array<{ userId: string, value: 1|-1 }>, alternatives: Array }> }} itinerary
 * @returns {{ stops: Array, replacedStopIds: string[] }}
 *          A stop with more rejections than approvals is replaced by its best-scoring
 *          alternative; timings after it must still fit the slot.
 */
export function resolveVotes(itinerary) {
  throw new NotImplementedError('resolveVotes')
}
