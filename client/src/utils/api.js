// all data calls go through this one file. pages import from here and nowhere else.
//
// the event/rsvp/auth calls select one of two backends:
//   mockapi.js      placeholder data in localstorage (works with no setup at all)
//   supabaseapi.js  the real supabase database
// if client/.env has the supabase keys we use supabase; otherwise the mock
// (or set vite_use_mock=true to use the mock anyway).
// feature 4 uses its own live adapter; venue switching is authorized by the
// deployed server-side nea verifier and fails closed when eligibility is unknown.

import * as mockApi from './mockApi.js';
import * as supabaseApi from './supabaseApi.js';
import * as supabaseFeature4Api from './supabaseFeature4Api.js';
import * as supabaseGroupsApi from './supabaseGroupsApi.js';
import * as supabaseFeature4Weather from './supabaseFeature4Weather.js';
import { isSupabaseConfigured, supabase } from './supabase.js';
import { watchAnnouncements } from './announcementUpdates.js';

// vite_use_mock=true in client/.env forces the mock even when the keys are there (handy for demos)

export const USING_SUPABASE = isSupabaseConfigured && import.meta.env?.VITE_USE_MOCK !== 'true';

export const CURRENT_USER_ID = 'u1';

export const CURRENT_ORGANISER_ID = 'org1';

const backend = USING_SUPABASE ? supabaseApi : mockApi;

const operationsBackend = USING_SUPABASE ? supabaseFeature4Api : mockApi;

const weatherBackend = USING_SUPABASE ? supabaseFeature4Weather : mockApi;

// the rsvp rules live in helpers.js; re-exported so pages can keep importing them from here
export { OFFER_HOURS, ACTIVE_STATUSES, JOINED_STATUSES, CLOSED_STATUSES } from './helpers.js';

// ---------- sign-in ----------

export const getCurrentUser = () => backend.getCurrentUser(); // { id, email } or null

export const signIn = (email, password) => backend.signIn(email, password);

export const signUp = (name, email, password, username) => backend.signUp(name, email, password, username); // { mustconfirmemail, usernametaken }

export const requestPasswordReset = email => backend.requestPasswordReset(email);

export const updatePassword = password => backend.updatePassword(password);

export const changeUsername = handle => backend.changeUsername(handle); // { taken }

export const changeEmail = email => backend.changeEmail(email);

export const changePassword = (current, next) => backend.changePassword(current, next);

export const deleteAccount = password => backend.deleteAccount(password);

export const signOut = () => backend.signOut();

export const onAuthChange = callback => backend.onAuthChange(callback); // returns "stop listening"

// ---------- events ----------

export const getEvents = () => backend.getEvents();

export const getEvent = eventId => backend.getEvent(eventId);

export const getOrganiserEvents = () => backend.getOrganiserEvents(); // the signed-in organiser's

export const createEvent = eventData => backend.createEvent(eventData);

export const updateEvent = (eventId, changes) => backend.updateEvent(eventId, changes); // organiser edits a published event

export const setEventPublished = (eventId, published) => backend.setEventPublished(eventId, published); // organiser: hide (draft) or show (published)

export const deleteEvent = eventId => backend.deleteEvent(eventId);
// online events: { haslink, revealat, url } (url only for the organiser, or confirmed attendees
// once revealat has passed); null for physical events. the link is saved with createevent/updateevent.

export const getEventOnlineAccess = eventId => backend.getEventOnlineAccess(eventId);
// the organiser and co-organisers shown in the event page's "hosted by" card (public profile fields)

export const getEventHosts = eventId => backend.getEventHosts(eventId);
// physical events may have no venue yet (venuepending, shown as "venue to be announced"), or keep
// a chosen venue hidden until venuerevealat; the event's organisers get it as hiddenvenue. saved
// with createevent/updateevent (form.venuerevealat). the event page calls this at the reveal time
// so the venue appears without waiting for the once-a-minute job. returns how many were released.

export const releaseDueEventVenues = () => backend.releaseDueEventVenues();

// ---------- go together groups (community) ----------
// live mode uses migrations 20261104142732 and 20261104142907 (see docs/decisions.md); a database
// without them makes the live calls say go together isn't set up yet.

const groupsBackend = USING_SUPABASE ? supabaseGroupsApi : mockApi;

export const getGroups = () => groupsBackend.getGroups(); // public upcoming groups, plus private ones you're in

export const getGroup = target => groupsBackend.getGroup(target); // { id } or { token } from an invite link; includes the plan for members

export const createGroup = form => groupsBackend.createGroup(form); // { eventid, note, capacity, joinmode, visibility, inviteids }

export const joinGroup = target => groupsBackend.joinGroup(target); // { id, token?, message? }; friends-only groups need the link, an invite or friendship

export const getGroupComments = groupId => groupsBackend.getGroupComments(groupId);

export const addGroupComment = (groupId, text) => groupsBackend.addGroupComment(groupId, text);

export const deleteGroupComment = commentId => groupsBackend.deleteGroupComment(commentId);

export const suggestGroupStop = (groupId, slot, item) => groupsBackend.suggestGroupStop(groupId, slot, item); // slot is 'before' or 'after'; a nearby place, a searched place or { name }

export const setGroupAvailability = (groupId, slot, cells) => groupsBackend.setGroupAvailability(groupId, slot, cells); // [cell start iso]; when2meet-style

export const voteGroupStop = (groupId, slot, suggestionId, keen) => groupsBackend.voteGroupStop(groupId, slot, suggestionId, keen);

export const chooseGroupStop = (groupId, slot, suggestionId) => groupsBackend.chooseGroupStop(groupId, slot, suggestionId); // host; suggestionid or null

export const removeGroupStop = (groupId, slot, suggestionId) => groupsBackend.removeGroupStop(groupId, slot, suggestionId);

export const getGroupInvites = () => groupsBackend.getGroupInvites(); // invites from friends waiting for you

export const respondGroupInvite = (inviteId, accept) => groupsBackend.respondGroupInvite(inviteId, accept); // accept joins straight away

export const updateGroupSettings = (groupId, settings) => groupsBackend.updateGroupSettings(groupId, settings); // host; { visibility, joinmode, capacity, note }

export const deleteGroup = groupId => groupsBackend.deleteGroup(groupId); // host; members get a notice

export const getGroupNotices = () => groupsBackend.getGroupNotices(); // "a group you were in was deleted"

export const dismissGroupNotice = noticeId => groupsBackend.dismissGroupNotice(noticeId);

export const getEventGroupMembers = eventId => groupsBackend.getEventGroupMembers(eventId); // organiser: who's coming with a group

// food places near a point that are open at a time, from the express server (/api/food/nearby).
// works in both modes; needs the server running.

const SERVER = import.meta.env?.VITE_API_URL || 'http://127.0.0.1:3000';

export async function getFoodNearby({
  lat,
  lng,
  at,
  radius = 800
}) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(radius)
  });
  if (at) params.set('at', at);
  let response;
  try {
    response = await fetch(`${SERVER}/api/food/nearby?${params}`);
  } catch {
    throw new Error('Food suggestions need the Dino server. Start it with pnpm --dir server dev.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Food suggestions are unavailable right now.');
  return body;
}

// ---------- users ----------

export const getUser = () => backend.getUser(); // the signed-in user's profile

// ---------- rsvps: participant ----------

export const getMyRsvps = () => backend.getMyRsvps();

export const getSavedEvents = () => backend.getSavedEvents();

export const unsaveEvent = eventId => backend.unsaveEvent(eventId);

export const createRsvp = rsvpData => backend.createRsvp(rsvpData); // { eventid, name, email, answers }

export const cancelRsvp = rsvpId => backend.cancelRsvp(rsvpId);

export const respondToOffer = (rsvpId, accept) => backend.respondToOffer(rsvpId, accept);

// ---------- rsvps: organiser ----------

export const getRsvpsForEvent = eventId => backend.getRsvpsForEvent(eventId);

export const approveRsvp = rsvpId => backend.approveRsvp(rsvpId);

export const rejectRsvp = rsvpId => backend.rejectRsvp(rsvpId);

export const removeRsvp = rsvpId => backend.removeRsvp(rsvpId); // take an accepted person off

export const setMember = (organiserId, userId, makeMember) => backend.setMember(organiserId, userId, makeMember);

export const expireOffersNow = eventId => backend.expireOffersNow(eventId); // demo button

// ---------- mock only ----------

export const resetDemoData = () => backend.resetDemoData();

export const getEventOperations = eventId => operationsBackend.getEventOperations(eventId);

export const createTask = (eventId, input) => operationsBackend.createTask(eventId, input);

export const updateTask = (eventId, id, input) => operationsBackend.updateTask(eventId, id, input);

export const deleteTask = (eventId, id) => operationsBackend.deleteTask(eventId, id);

export const saveTaskBoard = (eventId, columns) => operationsBackend.saveTaskBoard(eventId, columns);

export const getAnnouncements = eventId => operationsBackend.getAnnouncements(eventId);
// calls onchange whenever the event's public announcements may have changed (a new, edited or
// deleted post), so every viewer's feed can re-read them. returns "stop watching".
// live: realtime signal + slow poll. demo: changes saved from another tab.

export const watchEventAnnouncements = (eventId, onChange, hasPost) => watchAnnouncements({
  eventId,
  onChange,
  hasPost,
  client: USING_SUPABASE ? supabase : null,
  storageKey: USING_SUPABASE ? null : mockApi.STORAGE_KEY
});

export const createAnnouncement = (eventId, body, requestId) => operationsBackend.createAnnouncement(eventId, body, requestId);

export const updateAnnouncement = (eventId, id, body) => operationsBackend.updateAnnouncement(eventId, id, body);

export const deleteAnnouncement = (eventId, id) => operationsBackend.deleteAnnouncement(eventId, id);

export const saveBudgetLimit = (eventId, cents) => operationsBackend.saveBudgetLimit(eventId, cents);

export const saveBudgetItem = (eventId, input) => operationsBackend.saveBudgetItem(eventId, input);

export const deleteBudgetItem = (eventId, id) => operationsBackend.deleteBudgetItem(eventId, id);

export const createBudgetCategory = (eventId, name) => operationsBackend.createBudgetCategory(eventId, name);

export const deleteBudgetCategory = (eventId, name) => operationsBackend.deleteBudgetCategory(eventId, name); // → { categories, items }

export const getForecastAreas = () => weatherBackend.getForecastAreas();

export const getEventWeather = eventId => weatherBackend.getEventWeather(eventId);

export const setForecastArea = (eventId, name) => operationsBackend.setForecastArea(eventId, name);

export const getEventForecast = eventId => weatherBackend.getEventForecast(eventId);

export const confirmBackupVenueSwitch = eventId => weatherBackend.confirmBackupVenueSwitch(eventId);
