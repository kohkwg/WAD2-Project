// plan view for the live hangout adapter: timings, issues, vote counts and the
// official events a host can add. These functions are pure, so tests need no database.
import { retime } from './itinerary.js';

// plan: { stops: [{ id, ref, version }], options, method, changedat, finalizedat }
// events: eventlisting[] (official events); places: placelisting[]
// votecounts(stop) → { keep, swap, mine } for the stop's current version.

export function planInputs({
  events,
  places
}) {
  return new Map([...events, ...places].map(l => [l.id, l]));
}

export const resolveRefs = (byRef, refs) => refs.map(ref => byRef.get(ref) || {
  id: ref,
  title: 'Removed stop',
  available: false,
  tags: [],
  kind: 'activity'
});

export function buildPlanView({
  stage,
  plan,
  events,
  places,
  input,
  voteCounts,
  memberCount
}) {
  const byRef = planInputs({
    events,
    places
  });
  const listings = resolveRefs(byRef, plan.stops.map(s => s.ref));
  const result = retime(listings, input, plan.options);
  const stops = plan.stops.map((stop, index) => {
    const timed = result.stops[index];
    const l = listings[index];
    return {
      id: stop.id,
      ref: stop.ref,
      version: stop.version,
      type: l.type,
      refId: l.refId,
      title: l.title,
      venueName: l.venueName,
      tags: l.tags,
      kind: l.kind,
      hours: l.hours || null,
      lat: l.lat ?? null,
      lng: l.lng ?? null,
      start: timed?.start,
      end: timed?.end,
      wait: timed?.wait || 0,
      leg: timed?.leg || null,
      issues: result.issues.filter(i => i.index === index),
      votes: voteCounts(stop)
    };
  });
  return {
    stage,
    slot: input.slot,
    method: plan.method || null,
    options: plan.options || {},
    stops,
    planIssues: result.issues.filter(i => i.index === null),
    travelMinutes: result.travelMinutes,
    changedAt: plan.changedAt || null,
    finalizedAt: plan.finalizedAt || null,
    memberCount,
    // official events the host can add by hand: real, mapped and inside the slot.
    addable: events.filter(l => l.available && Number.isFinite(l.lat) && l.fixed.end > input.slot.start && l.fixed.start < input.slot.end && !plan.stops.some(s => s.ref === l.id)).map(l => ({
      ref: l.id,
      title: l.title,
      venueName: l.venueName,
      start: l.fixed.start,
      end: l.fixed.end,
      tags: l.tags
    }))
  };
}

// every issue across the plan, for confirmation.

export const planIssues = view => [...view.planIssues, ...view.stops.flatMap(s => s.issues)];
