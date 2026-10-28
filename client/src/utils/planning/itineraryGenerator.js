// A2 · Itinerary generator (docs/IDEATION-PLAN.md §5). Owner: TBD.
import { NotImplementedError } from './notImplemented.js'

/**
 * Build an itinerary that fits a locked slot.
 *
 * @param {object} input
 * @param {string} input.startsAt                 slot start (ISO)
 * @param {string} input.endsAt                   slot end (ISO)
 * @param {{ lat: number, lng: number }} input.area   starting area
 * @param {Record<string, number>} input.interests    interest slug → weight, combined for the group
 * @param {object} input.candidates
 * @param {Array} input.candidates.events          hosted events (api.getEvents shape)
 * @param {Array} input.candidates.externalEvents  planningSeed externalEvents shape
 * @param {Array} input.candidates.deals           planningSeed deals shape (with outlets)
 * @param {Array} input.candidates.places          planningSeed places shape
 * @param {{ includeMeal?: boolean, budgetCents?: number|null }} [input.options]
 * @returns {{ stops: Array<{
 *   seq: number, kind: 'activity'|'meal'|'transit', refType: string, refId: string|null,
 *   title: string, startsAt: string, endsAt: string, latitude: number|null, longitude: number|null,
 *   travelMinsFromPrev: number|null,
 *   alternatives: Array<{ refType: string, refId: string, title: string, score: number }>
 * }> }}
 */
export function generateItinerary(input) {
  throw new NotImplementedError('generateItinerary')
}
