// editing a published event: works out what changed, in words attendees understand,
// and builds the optional announcement posted to the event's public feed.
// `before` and `after` are both in the create event form shape (see createeventview.vue).

import { formatEventTime } from './helpers.js';
import { isStillHidden } from './venueReveal.js';

const sameText = (a, b) => (a || '').trim() === (b || '').trim();

const sameTime = (a, b) => new Date(a).getTime() === new Date(b).getTime();

const venueKey = venue => venue ? [venue.name, venue.address || '', venue.lat ?? '', venue.lng ?? ''].join('|') : '';

const venueName = venue => venue?.name || 'no venue';

const capacityText = capacity => capacity === '' || capacity == null ? 'no limit' : `${capacity} spots`;

const tagList = tags => [...(tags || [])].sort().join(', ') || 'none';

const sameRevealTime = (a, b) => (a || '') === (b || '') || Boolean(a) && Boolean(b) && sameTime(a, b);

const formatRevealTime = value => new Intl.DateTimeFormat('en-SG', {
  dateStyle: 'medium',
  timeStyle: 'short'
}).format(new Date(value));
// a chosen venue kept hidden until a time still to come; its name must not reach the public feed

const hiddenVenue = (form, now) => !form.isOnline && Boolean(form.venue) && isStillHidden(form.venueRevealAt, now);
// how the place reads in public: hidden, to be announced, or the venue's name

const placeText = (form, now) => hiddenVenue(form, now) ? `the venue will be revealed on ${formatRevealTime(form.venueRevealAt)}` : form.venue ? form.venue.name : 'venue to be announced';

// returns [{ field, text }] in the order attendees care about most (time and place first)

export function describeEventChanges(before, after, {
  now = Date.now()
} = {}) {
  const changes = [];
  const add = (field, text) => changes.push({
    field,
    text
  });
  if (!sameTime(before.startTime, after.startTime) || !sameTime(before.endTime, after.endTime)) {
    add('time', `Time: ${formatEventTime(before)} → ${formatEventTime(after)}`);
  }
  // announcements are public, so they never include the online link itself, and they leave
  // out capacity numbers once the organiser hides them.
  if (Boolean(before.isOnline) !== Boolean(after.isOnline)) {
    add('venue', after.isOnline ? 'Now an online event' : after.venue && !hiddenVenue(after, now) ? `Now in person at ${venueName(after.venue)}` : `Now in person; ${placeText(after, now)}`);
  } else if (after.isOnline) {
    const link = form => [(form.onlineLink?.url || '').trim(), (form.onlineLink?.url || '').trim() ? form.onlineLink.revealAt || '' : ''];
    const [beforeUrl, beforeReveal] = link(before);
    const [afterUrl, afterReveal] = link(after);
    if (beforeUrl !== afterUrl || !sameRevealTime(beforeReveal, afterReveal)) {
      add('link', afterUrl ? `Online link updated: confirmed attendees can open it from ${formatRevealTime(afterReveal)}` : 'Online link removed for now');
    }
  } else if (hiddenVenue(after, now)) {
    // never names a hidden venue: only that it changed or when it appears
    const beforeReveal = hiddenVenue(before, now) ? before.venueRevealAt : '';
    if (venueKey(before.venue) !== venueKey(after.venue) || !sameRevealTime(beforeReveal, after.venueRevealAt)) {
      add('venue', `${placeText(after, now)[0].toUpperCase()}${placeText(after, now).slice(1)}`);
    }
  } else if (hiddenVenue(before, now) && after.venue) {
    add('venue', `Venue revealed: ${venueName(after.venue)}`);
  } else if (!before.venue || !after.venue || hiddenVenue(before, now)) {
    if (venueKey(before.venue) !== venueKey(after.venue) || hiddenVenue(before, now)) {
      add('venue', after.venue ? `Venue announced: ${venueName(after.venue)}` : 'Venue to be announced');
    }
  } else if (venueKey(before.venue) !== venueKey(after.venue)) {
    const samePlace = before.venue?.name === after.venue?.name && (before.venue?.address || '') === (after.venue?.address || '');
    add('venue', samePlace ? `Venue location adjusted on the map (${venueName(after.venue)})` : `Venue: ${venueName(before.venue)} → ${venueName(after.venue)}`);
  }
  if (!after.isOnline && (Boolean(before.isOutdoor) !== Boolean(after.isOutdoor) || after.isOutdoor && venueKey(before.backupVenue) !== venueKey(after.backupVenue))) {
    add('backup', !after.isOutdoor ? 'No longer an outdoor event (no rain backup venue)' : hiddenVenue(after, now) ? 'Outdoor event; the rain plan is shared when the venue is revealed' : `Outdoor event; if it rains it moves to ${venueName(after.backupVenue)}`);
  }
  if (!sameText(before.title, after.title)) add('title', `New name: “${after.title.trim()}”`);
  if (String(before.capacity ?? '') !== String(after.capacity ?? '')) {
    const raised = before.capacity !== '' && (after.capacity === '' || Number(after.capacity) > Number(before.capacity));
    add('capacity', after.hideCapacity ? raised ? 'More spots are now available' : 'Fewer spots are now available' : `Capacity: ${capacityText(before.capacity)} → ${capacityText(after.capacity)}`);
  }
  if (Boolean(before.hideCapacity) !== Boolean(after.hideCapacity)) {
    add('capacity', after.hideCapacity ? 'The number of spots is no longer shown' : `Capacity is now shown: ${capacityText(after.capacity)}`);
  }
  if (Boolean(before.requiresApproval) !== Boolean(after.requiresApproval)) {
    add('approval', after.requiresApproval ? 'New RSVPs now need the organiser’s approval' : 'New RSVPs are now confirmed automatically while places last');
  }
  const beforeQuestions = new Map((before.questions || []).map(question => [question.id, question]));
  for (const question of after.questions || []) {
    const old = beforeQuestions.get(question.id);
    if (!old) add('questions', `New RSVP question: “${question.text.trim()}”`);else if (!sameText(old.text, question.text)) add('questions', `RSVP question reworded: “${old.text}” → “${question.text.trim()}”`);else if (old.required !== question.required || old.type !== question.type) add('questions', `RSVP question updated: “${question.text.trim()}”`);
  }
  const afterIds = new Set((after.questions || []).map(question => question.id));
  for (const old of before.questions || []) {
    if (!afterIds.has(old.id)) add('questions', `RSVP question removed: “${old.text}”`);
  }
  if (!sameText(before.description, after.description)) add('description', 'Description updated');
  if (tagList(before.tags) !== tagList(after.tags)) add('tags', `Tags: ${tagList(before.tags)} → ${tagList(after.tags)}`);
  if ((before.coverImageUrl || '') !== (after.coverImageUrl || '')) {
    add('cover', after.coverImageUrl ? 'New cover image' : 'Cover image removed');
  }
  return changes;
}

const FIELD_WORDS = {
  time: 'time',
  venue: 'venue',
  link: 'online link',
  backup: 'rain plan',
  title: 'name',
  capacity: 'capacity',
  approval: 'RSVP rules',
  questions: 'RSVP questions',
  description: 'details',
  tags: 'tags',
  cover: 'cover image'
};

// e.g. "update: time, venue and capacity"

export function defaultAnnouncementTitle(changes) {
  const words = [...new Set(changes.map(change => FIELD_WORDS[change.field]))];
  if (words.length === 0) return 'Event update';
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
  return `Update: ${list}`;
}

export function defaultAnnouncementMessage(changes) {
  return changes.map(change => `• ${change.text}`).join('\n');
}

// the feed shows announcements as plain text, so the title is the first line

export function formatAnnouncement(title, message) {
  return `${title.trim()}\n\n${message.trim()}`;
}
