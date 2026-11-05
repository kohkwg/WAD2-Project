// Live hangouts, backed by supabase/migrations/20261103120000_hangouts.sql.
// mockApi.js has no hangout functions, so these functions have no demo version.
// reads use the session of the signed-in user, so rls decides what each person sees; every change is a security definer
// rpc that rechecks host/member rules. group-time ranking needs everyone's private
// free times, so it runs on the trusted express server (/api/hangouts).
// plan timings are computed here with pure modules.
import { supabase } from './supabase.js';
import { eventListing, placeListing, memberWeights, retime, generatePlan, swapAlternatives, MAX_STOPS } from './itinerary.js';
import { buildPlanView, planInputs, resolveRefs, planIssues } from './hangoutPlan.js';

function check({
  data,
  error
}) {
  if (error) throw new Error(error.message.replace(/^conflict: /, ''));
  return data;
}

const apiBase = () => import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000';

async function serverCall(path, options = {}) {
  const {
    data: {
      session
    }
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in to see this hangout’s times.');
  let response;
  try {
    response = await fetch(`${apiBase()}/api/hangouts${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...options.headers
      }
    });
  } catch {
    throw new Error('The Dino server couldn’t be reached for group times. Check it’s running and try again.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Couldn’t load this hangout’s times.');
  return body;
}

const hhmm = value => value ? String(value).slice(0, 5) : null;

// ---------- event shape ----------

export async function hangoutDetails(eventId, isHost) {
  const row = check(await supabase.from('hangouts').select('mode, visibility, stage, date_start, date_end, locked_start, locked_end, meeting_point, plan_method, plan_options, plan_changed_at, plan_finalized_at, plan_ever_final, revision').eq('event_id', eventId).maybeSingle());
  if (!row) return null;
  const token = isHost ? check(await supabase.rpc('hangout_invite_token', {
    p_event_id: eventId
  })) : null;
  return {
    mode: row.mode,
    visibility: row.visibility,
    stage: row.stage,
    dateRange: row.date_start ? {
      start: row.date_start,
      end: row.date_end
    } : null,
    lockedSlot: row.locked_start ? {
      startTime: row.locked_start,
      endTime: row.locked_end
    } : null,
    inviteToken: token,
    meetingPoint: row.meeting_point,
    revision: row.revision,
    plan: {
      method: row.plan_method,
      options: row.plan_options || {},
      changedAt: row.plan_changed_at,
      finalizedAt: row.plan_finalized_at,
      everFinal: row.plan_ever_final
    }
  };
}

export async function createHangout(eventData, getEvent) {
  const h = eventData.hangout;
  const id = check(await supabase.rpc('create_hangout', {
    p: {
      mode: h.mode,
      title: eventData.title,
      description: eventData.description,
      tags: eventData.tags,
      capacity: eventData.capacity,
      joinMode: eventData.joinMode,
      dateStart: h.dateRange?.start,
      dateEnd: h.dateRange?.end,
      startTime: h.lockedSlot?.startTime,
      endTime: h.lockedSlot?.endTime,
      venue: eventData.venue
    }
  }));
  return getEvent(id);
}

export async function getHangoutInvite(token) {
  const p = check(await supabase.rpc('preview_hangout_invite', {
    p_token: token
  }));
  if (!p) throw new Error('This invite link isn’t valid any more. Ask the host for a new one.');
  return {
    id: p.eventId,
    kind: 'hangout',
    title: p.title,
    description: p.description,
    tags: p.tags || [],
    startTime: p.startsAt,
    endTime: p.endsAt,
    capacity: p.capacity,
    joinMode: p.joinMode,
    confirmedCount: p.confirmed,
    spotsLeft: Math.max(0, (p.capacity ?? 0) - 1 - p.confirmed),
    isMine: p.isHost,
    myStatus: p.myStatus,
    inviteToken: token,
    venue: {
      name: p.startArea,
      address: p.startAddress || ''
    },
    hangout: {
      mode: p.mode,
      visibility: 'private',
      stage: p.stage,
      dateRange: p.dateStart ? {
        start: p.dateStart,
        end: p.dateEnd
      } : null,
      lockedSlot: p.lockedStart ? {
        startTime: p.lockedStart,
        endTime: p.lockedEnd
      } : null
    }
  };
}

// private hangouts are joined by invite token; open jios use the ordinary rsvp rules.

export async function joinHangout({
  eventId,
  token
}, createRsvp) {
  if (!token) return createRsvp({
    eventId,
    name: '',
    answers: {}
  });
  const row = check(await supabase.rpc('join_hangout_by_invite', {
    p_token: token
  }));
  return {
    id: row.id,
    eventId: row.event_id,
    status: row.status
  };
}

// ---------- time ----------

export const getHangoutTime = (eventId, options = {}) => serverCall(`/${eventId}/time${options.minMinutes ? '?minMinutes=60' : ''}`);

export const previewHangoutSlot = (eventId, slot) => serverCall(`/${eventId}/preview-slot`, {
  method: 'POST',
  body: JSON.stringify(slot)
});

export async function saveHangoutAvailability(eventId, intervals) {
  check(await supabase.rpc('save_hangout_availability', {
    p_event_id: eventId,
    p_blocks: intervals.map(i => ({
      start: new Date(i.start).toISOString(),
      end: new Date(i.end).toISOString()
    }))
  }));
  return intervals;
}

export async function clearHangoutAvailability(eventId) {
  check(await supabase.rpc('clear_hangout_availability', {
    p_event_id: eventId
  }));
}

export async function setHangoutRequired(eventId, userId, required) {
  check(await supabase.rpc('set_hangout_required', {
    p_event_id: eventId,
    p_user_id: userId,
    p_required: Boolean(required)
  }));
}

export async function lockHangoutSlot(eventId, slot, getEvent) {
  check(await supabase.rpc('lock_hangout_slot', {
    p_event_id: eventId,
    p_start: new Date(slot.start).toISOString(),
    p_end: new Date(slot.end).toISOString()
  }));
  return getEvent(eventId);
}

export async function unlockHangoutSlot(eventId, getEvent) {
  check(await supabase.rpc('unlock_hangout_slot', {
    p_event_id: eventId
  }));
  return getEvent(eventId);
}

// ---------- plan ----------

const EVENT_FIELDS = 'id, title, starts_at, ends_at, status, kind, venue:venues!events_venue_id_fkey(name, latitude, longitude), backup_venue:venues!events_backup_venue_id_fkey(name, latitude, longitude), using_backup, event_interests(interests(slug))';

async function officialListings(slot, extraIds) {
  const inWindow = check(await supabase.from('events').select(EVENT_FIELDS).eq('kind', 'official').eq('status', 'published').lt('starts_at', new Date(slot.end).toISOString()).gt('ends_at', new Date(slot.start).toISOString()));
  const known = new Set(inWindow.map(e => e.id));
  const missing = extraIds.filter(id => !known.has(id));
  const extra = missing.length ? check(await supabase.from('events').select(EVENT_FIELDS).in('id', missing)) : [];
  const rows = [...inWindow, ...extra];
  const counts = rows.length ? check(await supabase.rpc('event_availability', {
    p_event_ids: rows.map(r => r.id)
  })) : [];
  return rows.map(row => {
    const v = row.using_backup ? row.backup_venue : row.venue;
    return eventListing({
      id: row.id,
      title: row.title,
      startTime: row.starts_at,
      endTime: row.ends_at,
      status: row.status,
      kind: row.kind,
      tags: row.event_interests.map(link => link.interests.slug),
      lat: v?.latitude ?? null,
      lng: v?.longitude ?? null,
      venue: {
        name: v?.name || ''
      },
      spotsLeft: counts.find(c => c.event_id === row.id)?.spots_left ?? null
    });
  });
}

async function planContext(eventId) {
  const event = check(await supabase.from('events').select('id, organiser_id, venue:venues!events_venue_id_fkey(latitude, longitude), event_interests(interests(slug))').eq('id', eventId).maybeSingle());
  if (!event) throw new Error('Hangout not found.');
  const myId = (await supabase.auth.getSession()).data.session?.user?.id;
  const h = await hangoutDetails(eventId, false);
  if (!h) throw new Error('This isn’t a hangout.');
  if (!h.lockedSlot) throw new Error('Lock a time first; the plan is built inside it.');
  const [stopRows, placeRows, people, votes] = await Promise.all([supabase.from('hangout_stops').select('id, position, ref_event_id, ref_place_id, version').eq('event_id', eventId).order('position').then(check), supabase.from('hangout_places').select('*').eq('event_id', eventId).then(check), supabase.rpc('hangout_members', {
    p_event_id: eventId
  }).then(check), supabase.rpc('hangout_vote_counts', {
    p_event_id: eventId
  }).then(check)]);
  const slot = {
    start: Date.parse(h.lockedSlot.startTime),
    end: Date.parse(h.lockedSlot.endTime)
  };
  const stops = stopRows.map(s => ({
    id: s.id,
    version: s.version,
    ref: s.ref_event_id ? `event:${s.ref_event_id}` : s.ref_place_id ? `place:${s.ref_place_id}` : `missing:${s.id}`
  }));
  const events = await officialListings(slot, stopRows.map(s => s.ref_event_id).filter(Boolean));
  const places = placeRows.map(p => placeListing({
    id: p.id,
    name: p.name,
    address: p.address,
    lat: p.latitude,
    lng: p.longitude,
    minutes: p.minutes,
    kind: p.kind,
    hours: p.opens_at ? {
      open: hhmm(p.opens_at),
      close: hhmm(p.closes_at)
    } : null
  }));
  // members' own interests are private, so the plan weighs the hangout's chosen interests.
  const tags = event.event_interests.map(link => link.interests.slug);
  const members = people.map(p => ({
    id: p.user_id,
    weights: memberWeights([], tags)
  }));
  const input = {
    slot,
    origin: {
      lat: event.venue?.latitude,
      lng: event.venue?.longitude
    },
    members
  };
  return {
    h,
    stops,
    events,
    places,
    input,
    isHost: event.organiser_id === myId,
    votes,
    memberCount: people.length
  };
}

function viewFrom(ctx) {
  return {
    isHost: ctx.isHost,
    revision: ctx.h.revision,
    ...buildPlanView({
      stage: ctx.h.stage,
      plan: {
        ...ctx.h.plan,
        stops: ctx.stops
      },
      events: ctx.events,
      places: ctx.places,
      input: ctx.input,
      memberCount: ctx.memberCount,
      voteCounts: stop => {
        const v = ctx.votes.find(x => x.stop_id === stop.id);
        return {
          keep: v?.keep || 0,
          swap: v?.swap || 0,
          mine: v?.mine || 0
        };
      }
    })
  };
}

export async function getHangoutPlan(eventId) {
  return viewFrom(await planContext(eventId));
}

const toStopRefs = refs => refs.map(ref => ref.startsWith('event:') ? {
  event: ref.slice(6)
} : {
  place: ref.slice(6)
});

async function saveStops(eventId, refs, revision, method = 'manual', options = null) {
  if (refs.length > MAX_STOPS || new Set(refs).size !== refs.length) throw new Error(`A plan has up to ${MAX_STOPS} different stops.`);
  check(await supabase.rpc('set_hangout_stops', {
    p_event_id: eventId,
    p_stops: toStopRefs(refs),
    p_revision: revision,
    p_method: method,
    p_options: options
  }));
}

export async function generateHangoutPlan(eventId, options = {}) {
  const ctx = await planContext(eventId);
  const outcome = generatePlan(ctx.events, ctx.input, options);
  if (!outcome.ok) return {
    ok: false,
    reason: outcome.reason,
    suggestions: outcome.suggestions
  };
  const keepPlaces = ctx.stops.filter(s => s.ref.startsWith('place:')).map(s => s.ref);
  await saveStops(eventId, [...outcome.listings.map(l => l.id), ...keepPlaces].slice(0, MAX_STOPS), ctx.h.revision, 'beam', {
    flexibleStart: Boolean(options.flexibleStart)
  });
  return {
    ok: true,
    plan: await getHangoutPlan(eventId)
  };
}

export async function previewHangoutStops(eventId, refs) {
  const ctx = await planContext(eventId);
  const result = retime(resolveRefs(planInputs({
    events: ctx.events,
    places: ctx.places
  }), refs), ctx.input, ctx.h.plan.options);
  return {
    issues: result.issues,
    times: result.stops.map(s => ({
      start: s.start,
      end: s.end
    })),
    travelMinutes: result.travelMinutes
  };
}

export async function setHangoutStops(eventId, refs) {
  const ctx = await planContext(eventId);
  await saveStops(eventId, refs, ctx.h.revision);
  return getHangoutPlan(eventId);
}

export async function addHangoutPlace(eventId, place) {
  const ctx = await planContext(eventId);
  if (ctx.stops.length >= MAX_STOPS) throw new Error(`A plan has up to ${MAX_STOPS} stops.`);
  const id = check(await supabase.rpc('add_hangout_place', {
    p_event_id: eventId,
    p: place
  }));
  await saveStops(eventId, [...ctx.stops.map(s => s.ref), `place:${id}`], ctx.h.revision);
  return getHangoutPlan(eventId);
}

export async function getHangoutAlternatives(eventId, stopId) {
  const ctx = await planContext(eventId);
  const index = ctx.stops.findIndex(s => s.id === stopId);
  if (index < 0) throw new Error('That stop isn’t in the plan any more.');
  const sequence = resolveRefs(planInputs({
    events: ctx.events,
    places: ctx.places
  }), ctx.stops.map(s => s.ref));
  return swapAlternatives(ctx.events, index, sequence, ctx.input, ctx.h.plan.options).map(a => ({
    ref: a.listing.id,
    title: a.listing.title,
    venueName: a.listing.venueName,
    start: a.listing.fixed?.start,
    end: a.listing.fixed?.end,
    reasons: a.reasons,
    better: a.better
  }));
}

export async function voteHangoutStop(eventId, stopId, value) {
  check(await supabase.rpc('vote_hangout_stop', {
    p_stop_id: stopId,
    p_value: value
  }));
  return getHangoutPlan(eventId);
}

export async function finalizeHangoutPlan(eventId, {
  acceptSoft = false
} = {}) {
  const view = await getHangoutPlan(eventId);
  if (!view.stops.length) throw new Error('Add at least one stop before confirming.');
  const all = planIssues(view);
  const blocking = all.filter(i => i.blocking);
  if (blocking.length) throw new Error(`Fix these first: ${blocking.map(i => i.message).join(' ')}`);
  if (all.length && !acceptSoft) throw new Error('Accept the remaining concerns to confirm.');
  check(await supabase.rpc('finalize_hangout_plan', {
    p_event_id: eventId,
    p_revision: view.revision
  }));
  return getHangoutPlan(eventId);
}

export async function reopenHangoutPlan(eventId) {
  check(await supabase.rpc('reopen_hangout_plan', {
    p_event_id: eventId
  }));
  return getHangoutPlan(eventId);
}

export async function setHangoutMeetingPoint(eventId, text) {
  check(await supabase.rpc('set_hangout_meeting_point', {
    p_event_id: eventId,
    p_text: text
  }));
  return String(text || '').trim();
}
