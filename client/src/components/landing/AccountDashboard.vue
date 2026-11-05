<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import '../../assets/design-baseline.css';
import EventArtwork from '../EventArtwork.vue';
import { getMyEventTeams } from '../../utils/eventTeam.js';
import { USING_SUPABASE, getEvents, getGroups, getGroupInvites, respondGroupInvite, respondToOffer, getOrganiserEvents } from '@/utils/api';
import { getFriends, respondToRequest } from '@/utils/profileFriends';
import { toast } from '@/composables/useToast';
import { formatTimeLeft } from '@/utils/helpers';
import { groupRsvps, directionsUrl, eventEnded } from '@/utils/rsvpOverview';
import { organiserEventState } from '@/utils/organiserEvents';
import { countdownLabel, isOfficialEvent } from '@/utils/groups';
import { useMyDino } from '@/lib/myDino';

// the signed-in home. LandingView owns the account and passes down what it already loaded;
// everything else (groups, invites, friends, events you run) loads here and fails on its own,
// so one slow or missing source never blanks the dashboard.

const props = defineProps({
  session: {
    type: Object,
    required: true
  },
  profile: {
    type: Object,
    default: null
  },
  rsvps: {
    type: Array,
    default: () => []
  },
  saved: {
    type: Array,
    default: () => []
  },
  loadError: {
    type: String,
    default: ''
  },
  justJoined: Boolean
});

const emit = defineEmits(['refresh']);

const {
  mySrc: myDinoSrc
} = useMyDino();

const now = ref(Date.now());

const groups = ref([]);

const invites = ref([]);

const friends = ref({
  friends: [],
  incoming: [],
  outgoing: []
});

const hosted = ref([]);

const extrasLoading = ref(true);

const extrasFailed = ref(false);

const teamInvites = ref([]);

const openEvents = ref([]);

let active = true,
  request = 0,
  timer;

/**
 * Load the data that the parent does not supply.
 * Each source can fail alone. A newer request replaces the result of an older request.
 */
async function loadExtras() {
  const ticket = ++request;
  extrasLoading.value = true;
  const results = await Promise.allSettled([getGroups(), getGroupInvites(), getFriends(), getOrganiserEvents(), getEvents(), USING_SUPABASE ? getMyEventTeams() : Promise.resolve({
    invitations: []
  })]);
  if (!active || ticket !== request) return;
  const [g, i, f, h, e, t] = results;
  if (g.status === 'fulfilled') groups.value = g.value;
  if (i.status === 'fulfilled') invites.value = i.value;
  if (f.status === 'fulfilled') friends.value = f.value;
  if (h.status === 'fulfilled') hosted.value = h.value.filter(isOfficialEvent);
  if (e.status === 'fulfilled') openEvents.value = e.value.filter(isOfficialEvent);
  if (t.status === 'fulfilled') teamInvites.value = t.value.invitations || [];
  extrasFailed.value = results.some(result => result.status === 'rejected');
  extrasLoading.value = false;
}

// Get new data when the window gets focus again. Do not start a second load.
function refreshDashboard() {
  if (!active || document.hidden || extrasLoading.value) return;
  now.value = Date.now();
  emit('refresh');
  loadExtras();
}

onMounted(() => {
  loadExtras();
  timer = setInterval(() => {
    now.value = Date.now();
  }, 60_000);
  window.addEventListener('focus', refreshDashboard);
});

onBeforeUnmount(() => {
  active = false;
  request++;
  clearInterval(timer);
  window.removeEventListener('focus', refreshDashboard);
});

const name = computed(() => props.profile?.name || props.session.email?.split('@')[0] || 'there');

const firstName = computed(() => name.value.split(/\s+/)[0]);

const initials = computed(() => name.value.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase());

const greeting = computed(() => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
});

const grouped = computed(() => groupRsvps(props.rsvps, now.value));

const upcoming = computed(() => grouped.value.upcoming);

const offers = computed(() => upcoming.value.filter(r => r.status === 'offered'));
// events you're going to (accepted rsvps), soonest first; each carries your group for it, if any

const plans = computed(() => upcoming.value.filter(r => r.status === 'confirmed').map(row => ({
  row,
  group: myGroups.value.find(g => (g.eventId || g.event?.id) === row.event.id) || null
})));

const liveEvent = event => !['cancelled', 'completed', 'draft'].includes(event.status) && !eventEnded(event, now.value);

const byStart = (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || String(a.id).localeCompare(String(b.id));
// discover: what you saved first, then open events you haven't joined yet

const discover = computed(() => {
  const saved = props.saved.filter(liveEvent).sort(byStart).map(event => ({
    event,
    pill: 'Saved'
  }));
  const taken = new Set([...saved.map(({
    event
  }) => event.id), ...props.rsvps.map(row => row.event?.id)]);
  const spots = event => event.capacity != null && Number.isFinite(Number(event.spotsLeft)) ? Number(event.spotsLeft) : null;
  const more = openEvents.value.filter(event => liveEvent(event) && !taken.has(event.id)).sort(byStart).map(event => ({
    event,
    pill: spots(event) === 0 ? 'Full · waitlist' : spots(event) != null ? `${spots(event)} ${spots(event) === 1 ? 'spot' : 'spots'} left` : ''
  }));
  return [...saved, ...more].slice(0, 3);
});
// "starts in 40 min" / "starts in 3 hr" for the next plan; further out it reads like the group cards

function startsIn(event) {
  const start = Date.parse(event.startTime);
  if (!Number.isFinite(start)) return '';
  const minutes = Math.round((start - now.value) / 60_000);
  if (minutes <= 0) return 'Happening now';
  if (minutes < 60) return `Starts in ${minutes} min`;
  if (minutes < 24 * 60) return `Starts in ${Math.round(minutes / 60)} hr`;
  return countdownLabel(event.startTime, new Date(now.value));
}
// "thu, 12 nov 2026 · 5:00 – 10:00 pm", short enough for a compact row

function shortTime(event) {
  const start = new Date(event.startTime),
    end = new Date(event.endTime);
  if (Number.isNaN(start.getTime())) return 'Date to be announced';
  const day = start.toLocaleDateString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  const clock = date => date.toLocaleTimeString('en-SG', {
    hour: 'numeric',
    minute: '2-digit'
  });
  return Number.isNaN(end.getTime()) ? `${day} · ${clock(start)}` : `${day} · ${clock(start)} – ${clock(end)}`;
}

const myGroups = computed(() => groups.value.filter(g => ['host', 'confirmed', 'pending'].includes(g.myStatus)).sort((a, b) => new Date(a.startTime) - new Date(b.startTime)));

const groupRequests = computed(() => myGroups.value.reduce((sum, g) => sum + (g.myStatus === 'host' ? g.pendingCount || 0 : 0), 0));

const hostedUpcoming = computed(() => hosted.value.filter(e => organiserEventState(e, now.value) === 'upcoming').sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime)));

const hostedPending = computed(() => hostedUpcoming.value.reduce((sum, e) => sum + (e.pendingCount || 0), 0));

// "needs you": the things waiting on a decision. friend requests and group invites are answered
// right here; the rest link to where they're settled.

const busy = ref('');

const personName = person => person.displayName || `@${person.username}`;

// An item with `respond` shows its answer buttons here. An item with `to` links to another page.
const attention = computed(() => {
  const items = [];
  for (const row of offers.value) {
    items.push({
      key: `offer-${row.id}`,
      tone: 'urgent',
      text: 'Accept your waitlist spot',
      hint: `${row.event.title} · ${formatTimeLeft(row.offerExpiresAt, now.value)} left`,
      respond: accept => respondToOffer(row.id, accept),
      accepted: `You’re in for ${row.event.title}.`,
      declined: 'Offer declined.',
      done: () => {},
      reload: true,
      name: row.event.title
    });
  }
  if (teamInvites.value.length) items.push({
    key: 'team',
    to: '/organiser/events',
    action: 'Review',
    text: `${teamInvites.value.length} co-organiser ${teamInvites.value.length === 1 ? 'invitation' : 'invitations'}`,
    hint: 'Review your event team invitations'
  });
  for (const invite of invites.value) {
    const title = invite.group.event?.title || 'an event';
    items.push({
      key: `invite-${invite.id}`,
      text: `${invite.from.name} invited you to go to ${title}`,
      hint: 'Accepting RSVPs you to the event too',
      respond: accept => respondGroupInvite(invite.id, accept),
      accepted: `You’re in for ${title}.`,
      declined: 'Invite declined.',
      done: () => {
        invites.value = invites.value.filter(i => i.id !== invite.id);
      },
      reload: true,
      name: title
    });
  }
  for (const person of friends.value.incoming) {
    items.push({
      key: `friend-${person.id}`,
      text: `${personName(person)} sent you a friend request`,
      hint: person.displayName ? `@${person.username}` : 'Friend request',
      respond: accept => respondToRequest(person.id, accept),
      accepted: `You and ${personName(person)} are now friends.`,
      declined: `Friend request from ${personName(person)} declined.`,
      done: accept => {
        friends.value = {
          ...friends.value,
          incoming: friends.value.incoming.filter(p => p.id !== person.id),
          friends: accept ? [...friends.value.friends, person] : friends.value.friends
        };
      },
      name: personName(person)
    });
  }
  if (groupRequests.value) items.push({
    key: 'requests',
    to: '/community',
    action: 'Review',
    text: `${groupRequests.value} ${groupRequests.value === 1 ? 'person wants' : 'people want'} to join your groups`,
    hint: 'Approve or decline'
  });
  if (hostedPending.value) items.push({
    key: 'approvals',
    to: '/organiser/events',
    action: 'Approve',
    text: `${hostedPending.value} ${hostedPending.value === 1 ? 'RSVP needs' : 'RSVPs need'} your approval`,
    hint: 'On the events you run'
  });
  return items;
});

/** Send the answer for one "to do" item. Only one answer can be in progress. */
async function answer(item, accept) {
  if (busy.value) return;
  busy.value = item.key;
  try {
    await item.respond(accept);
    item.done(accept);
    toast(accept ? item.accepted : item.declined);
    // joining a group rsvps you to its event, so the plans and groups need a fresh look
    if (item.reload) {
      emit('refresh');
      loadExtras();
    }
  } catch (error) {
    toast(error.message || 'That didn’t go through. Please try again.', {
      tone: 'error'
    });
  } finally {
    busy.value = '';
  }
}

// "to do" shows the first few items; the rest open with "+n more"

const showAllAttention = ref(false);

const shownAttention = computed(() => showAllAttention.value ? attention.value : attention.value.slice(0, 4));

// your soonest event, whether you're going to it or running it

const nextEvent = computed(() => {
  const going = plans.value[0] ? {
    kind: 'going',
    event: plans.value[0].row.event,
    group: plans.value[0].group
  } : null;
  const hosting = hostedUpcoming.value[0] ? {
    kind: 'hosting',
    event: hostedUpcoming.value[0],
    group: null
  } : null;
  if (!going || !hosting) return going || hosting;
  return Date.parse(going.event.startTime) < Date.parse(hosting.event.startTime) ? going : hosting;
});

// next 7 days (singapore days): what you're going to and what you run, side by side

// Singapore is UTC+8 and has no daylight saving, so a fixed offset gives the correct day.
const sgKey = ms => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);

const clock = iso => new Date(iso).toLocaleTimeString('en-SG', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Singapore'
});

const week = computed(() => {
  const days = Array.from({
    length: 7
  }, (_, i) => {
    const key = sgKey(now.value + i * 86400000);
    const date = new Date(`${key}T00:00:00Z`);
    return {
      key,
      today: i === 0,
      weekday: date.toLocaleDateString('en-GB', {
        weekday: 'short',
        timeZone: 'UTC'
      }),
      number: date.getUTCDate(),
      items: []
    };
  });
  const add = (event, kind, to) => {
    const start = Date.parse(event.startTime);
    const day = Number.isFinite(start) && days.find(d => d.key === sgKey(start));
    if (day) day.items.push({
      key: `${kind}-${event.id}`,
      kind,
      to,
      title: event.title,
      time: clock(event.startTime),
      start
    });
  };
  const hostedIds = new Set(hostedUpcoming.value.map(event => event.id));
  for (const {
    row
  } of plans.value) if (!hostedIds.has(row.event.id)) add(row.event, 'going', `/events/${row.event.id}/rsvp`);
  for (const event of hostedUpcoming.value) add(event, 'hosting', `/organiser/events/${event.id}/manage`);
  for (const day of days) day.items.sort((x, y) => x.start - y.start);
  return days;
});
// sections with nothing to show stay out of the page instead of sitting there empty

const weekBusy = computed(() => week.value.some(day => day.items.length));

const hasTop = computed(() => Boolean(nextEvent.value) || attention.value.length > 0);
</script>

<template>
  <section class="dash" aria-labelledby="dash-title">
    <header class="dash-hero">
      <span class="dash-avatar-wrap" :class="{ celebrate: justJoined }" aria-hidden="true">
        <span class="dash-avatar">
        <img v-if="myDinoSrc" class="dino-face" :src="myDinoSrc" alt="">{{ myDinoSrc ? '' : initials }}</span>
        <span v-if="justJoined" class="dash-burst">
        <span v-for="n in 8" :key="n" :style="{ '--burst-angle': `${n * 45}deg` }">✦</span></span>
      </span>
      <div class="dash-hero-copy">
        <p class="dash-greeting">{{ greeting }},</p>
        <h1 id="dash-title" class="page-title m-0">{{ firstName }}</h1>
      </div>
      <div class="dash-hero-actions">
        <RouterLink
        v-if="USING_SUPABASE"
        to="/organiser/events/new"
        class="btn btn-primary">Create an event</RouterLink>
        <RouterLink v-else to="/discover" class="btn btn-primary">Discover events</RouterLink>
      </div>
    </header>

    <p v-if="!USING_SUPABASE" class="dash-demo">
      <strong>Demo mode.</strong> You’re signed in as the sample account {{ name }}. Everything is stored in this browser only;
      use <em>Reset demo data</em> in the top bar to start over.
    </p>
    <p
    v-dismissible
    v-if="loadError"
    class="alert alert-warning m-0"
    role="alert">{{ loadError }} <button
      type="button"
      class="btn btn-outline-secondary btn-sm ms-2"
      @click="$emit('refresh')">Retry account data</button></p>
    <p
    v-dismissible
    v-if="extrasFailed"
    class="alert alert-warning m-0"
    role="alert">Some dashboard updates couldn’t load. <button
      type="button"
      class="btn btn-outline-secondary btn-sm ms-2"
      :disabled="extrasLoading"
      @click="refreshDashboard">Retry updates</button></p>

    <div v-if="hasTop" class="dash-top" :class="{ 'is-solo': !nextEvent || !attention.length }">
      <section v-if="nextEvent" class="dash-section" aria-labelledby="next-plan-title">
        <div class="dash-head">
          <span class="dash-dot" aria-hidden="true"></span>
          <h2 id="next-plan-title" class="dash-section-title">Your next event</h2>
          <span v-if="startsIn(nextEvent.event)" class="dash-eyebrow">{{ startsIn(nextEvent.event) }}</span>
          <span class="dash-line" aria-hidden="true"></span>
        </div>
        <div class="dash-card dash-next">
          <div class="dash-next-art" aria-hidden="true">
          <EventArtwork :category="nextEvent.event.tags?.[0] || ''" /></div>
          <div class="dash-next-copy">
            <p v-if="nextEvent.kind === 'hosting'" class="dash-hosting-tag">You’re hosting</p>
            <p class="dash-next-title">{{ nextEvent.event.title }}</p>
            <p class="dash-when m-0">
              <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" /></svg>
              {{ shortTime(nextEvent.event) }}
            </p>
            <p class="dash-where m-0">
              <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.5" /></svg>
              {{ nextEvent.event.venue?.name || 'Venue to be announced' }}
            </p>
            <p v-if="nextEvent.kind === 'hosting'" class="dash-where m-0">{{ nextEvent.event.confirmedCount || 0 }} going<template v-if="nextEvent.event.pendingCount"> · {{ nextEvent.event.pendingCount }} to review</template></p>
            <RouterLink v-if="nextEvent.group" :to="`/groups/${nextEvent.group.id}`" class="dash-slide-group">
              <span>
              <strong>{{ nextEvent.group.myStatus === 'host' ? 'Your group' : 'Going with a group' }}</strong> · {{ 1 + (nextEvent.group.members?.length || 0) }} going</span>
              <span aria-hidden="true">↗</span>
            </RouterLink>
            <div class="dash-actions">
              <template v-if="nextEvent.kind === 'hosting'">
                <RouterLink :to="`/organiser/events/${nextEvent.event.id}/manage`" class="btn btn-primary btn-sm">Manage event</RouterLink>
                <RouterLink
                v-if="USING_SUPABASE"
                :to="`/organiser/events/${nextEvent.event.id}/check-in`"
                class="btn btn-outline-secondary btn-sm">Check-in</RouterLink>
              </template>
              <template v-else>
                <RouterLink
                v-if="USING_SUPABASE"
                :to="`/events/${nextEvent.event.id}/ticket`"
                class="btn btn-primary btn-sm">View ticket</RouterLink>
                <RouterLink :to="`/events/${nextEvent.event.id}/rsvp`" class="btn btn-outline-secondary btn-sm">View event</RouterLink>
              </template>
              <a
              v-if="directionsUrl(nextEvent.event)"
              :href="directionsUrl(nextEvent.event)"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-outline-secondary btn-sm">Directions ↗</a>
            </div>
          </div>
        </div>
      </section>

      <section v-if="attention.length" class="dash-section" aria-labelledby="todo-title">
        <div class="dash-head">
          <span class="dash-dot" aria-hidden="true"></span>
          <h2 id="todo-title" class="dash-section-title">To do</h2>
          <span class="dash-line" aria-hidden="true"></span>
          <button
          v-if="attention.length > 4"
          type="button"
          class="dash-more"
          :aria-expanded="showAllAttention"
          @click="showAllAttention = !showAllAttention">{{ showAllAttention ? 'Show less' : `+${attention.length - 4} more` }}</button>
        </div>
        <div class="dash-card dash-todo">
          <ul class="list-unstyled m-0">
            <li v-for="item in shownAttention" :key="item.key" class="dash-todo-row">
              <span class="dash-todo-copy">
                <strong>{{ item.text }}</strong>
                <span :class="{ 'is-hot': item.tone === 'urgent' }">{{ item.hint }}</span>
              </span>
              <RouterLink v-if="item.to" :to="item.to" class="btn btn-primary btn-sm">{{ item.action }}</RouterLink>
              <span v-else class="dash-todo-actions">
                <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="!!busy"
                :aria-label="`Accept ${item.name}`"
                @click="answer(item, true)">{{ busy === item.key ? 'Saving…' : 'Accept' }}</button>
                <button
                type="button"
                class="dash-decline"
                :disabled="!!busy"
                :aria-label="`Decline ${item.name}`"
                @click="answer(item, false)">Decline</button>
              </span>
            </li>
          </ul>
        </div>
      </section>
    </div>

    <p v-else-if="extrasLoading" class="text-meta m-0" role="status">Loading your dashboard…</p>
    <section v-else class="dash-card dash-welcome" aria-labelledby="welcome-title">
      <h2 id="welcome-title" class="dash-welcome-title">Nothing planned yet</h2>
      <p class="text-meta m-0">Find an event to go to{{ USING_SUPABASE ? ', or run one of your own' : '' }}. What you sign up for shows up here.</p>
      <div class="dash-actions">
        <RouterLink to="/discover" class="btn btn-primary btn-sm">Explore events</RouterLink>
        <RouterLink
        v-if="USING_SUPABASE"
        to="/organiser/events/new"
        class="btn btn-outline-secondary btn-sm">Create an event</RouterLink>
      </div>
    </section>

    <section v-if="weekBusy" class="dash-section" aria-labelledby="week-title">
      <div class="dash-head">
        <span class="dash-dot" aria-hidden="true"></span>
        <h2 id="week-title" class="dash-section-title">Next 7 days</h2>
        <span class="dash-line" aria-hidden="true"></span>
        <span class="dash-key">
        <i class="is-going" aria-hidden="true"></i>Going</span>
        <span class="dash-key">
        <i class="is-hosting" aria-hidden="true"></i>Hosting</span>
      </div>
      <ol class="list-unstyled m-0 dash-week">
        <li v-for="day in week" :key="day.key" class="dash-day" :class="{ 'is-today': day.today }">
          <p class="dash-day-head">
          <span>{{ day.weekday }}</span> <strong>{{ day.number }}</strong></p>
          <p v-if="!day.items.length" class="dash-free">Free</p>
          <ul v-else class="list-unstyled m-0 dash-day-list">
            <li v-for="item in day.items" :key="item.key">
              <RouterLink :to="item.to" class="dash-day-item" :class="`is-${item.kind}`">
                <strong>{{ item.time }}</strong>
                <span>{{ item.title }}</span>
              </RouterLink>
            </li>
          </ul>
        </li>
      </ol>
    </section>

    <section v-if="discover.length" class="dash-section" aria-labelledby="picked-title">
      <div class="dash-head">
        <span class="dash-dot" aria-hidden="true"></span>
        <h2 id="picked-title" class="dash-section-title">Picked for you</h2>
        <span class="dash-line" aria-hidden="true"></span>
        <RouterLink to="/discover" class="dash-more">See more</RouterLink>
      </div>
      <ul class="list-unstyled m-0 dash-picks">
        <li v-for="{ event } in discover" :key="event.id">
          <RouterLink :to="`/events/${event.id}/rsvp`" class="dash-pick">
            <span class="dash-tile" aria-hidden="true">
            <EventArtwork :category="event.tags?.[0] || ''" /></span>
            <span class="dash-pick-main">
              <strong>{{ event.title }}</strong>
              <span class="text-meta">{{ shortTime(event).split(' – ')[0] }}</span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
/* section headings are a dot, a title and a rule, then a quiet note or link */

.dash {
  width: 100%;
  max-width: none;
  margin: 0 auto;
  display: grid;
  gap: 26px;
  --db-r: 24px;
}

.dash-hero {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: clamp(1rem, 3vw, 1.2rem) clamp(1.1rem, 3vw, 1.8rem);
  border: 2px solid var(--bookedz-ink);
  border-radius: var(--db-r);
  background: linear-gradient(120deg, var(--bookedz-orange-soft), var(--bookedz-mango-soft) 70%);
  box-shadow: 0 6px 0 var(--bookedz-mango);
}

.dash-hero::after {
  content: '★';
  position: absolute;
  left: 50%;
  top: 50%;
  translate: -50% -50%;
  font-size: clamp(3rem, 7vw, 4.5rem);
  line-height: 1;
  color: var(--bookedz-ink);
  opacity: .16;
  pointer-events: none;
}

.dash-hero > * {
  position: relative;
  z-index: 1;
}

.dash-hero-copy {
  flex: 1 1 200px;
  min-width: 0;
}

.dash-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dash-avatar {
  overflow: hidden;
  display: grid;
  place-items: center;
  flex: none;
  width: 56px;
  height: 56px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 50%;
  background: var(--bookedz-surface);
  color: var(--bookedz-primary-dark);
  font: 700 1.2rem var(--bookedz-heading);
  animation: pop-once var(--bookedz-motion-slip) var(--bookedz-ease-stamp);
}

.dino-face {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* a dino shows whole, not cropped to the circle */

.dash-avatar:has(.dino-face) {
  overflow: visible;
  border-color: transparent;
  background: none;
}

.dash-avatar-wrap {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
}

.celebrate .dash-avatar {
  animation: avatar-hop 900ms var(--bookedz-ease-stamp) both;
}

.dash-burst {
  position: absolute;
  inset: 50% auto auto 50%;
  pointer-events: none;
}

.dash-burst span {
  position: absolute;
  left: -.5em;
  top: -.5em;
  width: 1em;
  text-align: center;
  color: var(--bookedz-primary);
  font-size: .95rem;
  opacity: 0;
  animation: avatar-burst 900ms var(--bookedz-ease) 180ms both;
}

.dash-burst span:nth-child(even) {
  color: var(--bookedz-yellow);
  font-size: .75rem;
}

@keyframes avatar-hop {
  0% {
    transform: translateY(24px) scale(.4);
  }
  45% {
    transform: translateY(-14px) scale(1.12);
  }
  70% {
    transform: translateY(0) scale(.95);
  }
  100% {
    transform: none;
  }
}

@keyframes avatar-burst {
  0% {
    opacity: 1;
    transform: rotate(var(--burst-angle)) translateY(-18px) scale(.4);
  }
  100% {
    opacity: 0;
    transform: rotate(var(--burst-angle)) translateY(-56px) scale(1);
  }
}

.dash-greeting {
  margin: 0;
  color: var(--bookedz-muted);
  font-size: .9rem;
  font-weight: 500;
}

.dash-hero h1 {
  font-size: clamp(1.6rem, 4vw, 2.2rem);
  font-weight: 900;
  letter-spacing: -.02em;
  overflow-wrap: anywhere;
}

.dash-demo {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--bookedz-yellow) 60%, var(--bookedz-border));
  border-radius: 14px;
  background: color-mix(in srgb, var(--bookedz-yellow) 18%, var(--bookedz-surface));
  font-size: .95rem;
}

.dash-top {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 26px;
  align-items: start;
}

.dash-top.is-solo {
  grid-template-columns: minmax(0, 1fr);
}

.dash-hosting-tag {
  margin: 0;
  color: var(--bookedz-primary-dark);
  font-size: .7rem;
  font-weight: 800;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.dash-welcome {
  justify-items: start;
  gap: 10px;
}

.dash-welcome-title {
  margin: 0;
  font: 900 1.4rem var(--bookedz-heading);
}

.dash-section {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
}

.dash-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  font-size: .8rem;
  color: var(--bookedz-muted);
}

.dash-dot {
  flex: none;
  width: 14px;
  height: 14px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 50%;
  background: var(--bookedz-fill);
}

.dash-section-title {
  margin: 0;
  font: 900 1.25rem var(--bookedz-heading);
  color: var(--bookedz-ink);
  white-space: nowrap;
}

.dash-eyebrow {
  color: var(--bookedz-success);
  font-size: .7rem;
  font-weight: 800;
  letter-spacing: .05em;
  text-transform: uppercase;
  white-space: nowrap;
}

.dash-line {
  flex: 1;
  min-width: 12px;
  height: 2px;
  background: var(--bookedz-border);
}

.dash-more {
  padding: 0;
  border: 0;
  background: none;
  color: var(--bookedz-primary-dark);
  font: inherit;
  font-weight: 800;
  white-space: nowrap;
  text-decoration: none;
}

.dash-more:hover {
  text-decoration: underline;
}

.dash-key {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.dash-key i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.dash-key .is-going, .dash-day-item.is-going {
  --kind: var(--bookedz-success);
}

.dash-key .is-hosting, .dash-day-item.is-hosting {
  --kind: var(--bookedz-primary-dark);
}

.dash-key i {
  background: var(--kind);
}

.dash-card {
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 20px;
  border: 2px solid var(--bookedz-ink);
  border-radius: var(--db-r);
  background: var(--bookedz-surface);
  box-shadow: 0 6px 0 var(--bookedz-teal);
}

.dash-next {
  grid-template-columns: 112px minmax(0, 1fr);
  align-items: center;
  gap: 24px;
  padding: 24px;
}

.dash-next-art {
  border-radius: 18px;
  overflow: hidden;
  border: 2px solid var(--bookedz-ink);
}

.dash-next-art :deep(svg) {
  display: block;
  width: 100%;
  height: 112px;
}

.dash-next-copy {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.dash-next-title {
  margin: 0;
  font: 900 clamp(1.4rem, 2.6vw, 1.9rem) var(--bookedz-heading);
  overflow-wrap: anywhere;
}

.dash-when, .dash-where {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: .85rem;
}

.dash-when {
  color: var(--bookedz-primary-dark);
  font-weight: 700;
}

.dash-where {
  color: var(--bookedz-muted);
}

.dash-when svg, .dash-where svg {
  flex: none;
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dash-slide-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  padding: 8px 12px;
  border: 2px dashed var(--bookedz-control-border);
  border-radius: 14px;
  background: var(--bookedz-mango-soft);
  color: var(--bookedz-ink);
  text-decoration: none;
}

.dash-slide-group:hover {
  color: var(--bookedz-ink);
  background: var(--bookedz-hover);
}

.dash-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

/* each card's buttons sit at its bottom, so cards side by side line up */

.dash-card > .dash-actions {
  margin-top: auto;
  padding-top: 6px;
}

.dash-actions .btn, .dash-hero-actions .btn {
  min-height: 44px;
  border-width: 2px;
  border-radius: 99px;
}

.dash-actions .btn-sm {
  min-height: 40px;
}

.btn-primary {
  border-color: var(--bookedz-ink);
}

.dash-todo {
  gap: 0;
  padding: 6px 18px;
  border-color: var(--bookedz-border);
  box-shadow: 0 4px 0 var(--bookedz-border);
}

.dash-todo > p {
  padding: 14px 0;
}

.dash-todo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--bookedz-border);
}

.dash-todo-row:last-child {
  border-bottom: 0;
}

.dash-todo-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.dash-todo-copy strong {
  overflow-wrap: anywhere;
}

.dash-todo-copy > span {
  color: var(--bookedz-muted);
  font-size: var(--text-small);
  overflow-wrap: anywhere;
}

.dash-todo-copy > .is-hot {
  color: var(--bookedz-primary-dark);
}

.dash-todo-row .btn {
  flex: none;
  min-height: 40px;
  border-width: 2px;
  border-radius: 99px;
}

.dash-todo-actions {
  display: grid;
  justify-items: center;
  gap: 2px;
  flex: none;
}

.dash-decline {
  padding: 2px 6px;
  border: 0;
  background: none;
  color: var(--bookedz-muted);
  font-size: .8rem;
  font-weight: 700;
}

.dash-decline:hover:not(:disabled) {
  color: var(--bookedz-ink);
  text-decoration: underline;
}

.dash-week {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 12px;
}

.dash-day {
  min-height: 120px;
  padding: 10px 12px;
  border: 2px solid var(--bookedz-border);
  border-radius: 16px;
}

.dash-day.is-today {
  border-color: var(--bookedz-fill);
  background: var(--bookedz-surface);
}

.dash-day-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0 0 6px;
}

.dash-day-head span {
  color: var(--bookedz-muted);
  font-size: .68rem;
  font-weight: 800;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.dash-day-head strong {
  font-size: 1.1rem;
}

.is-today .dash-day-head span, .is-today .dash-day-head strong {
  color: var(--bookedz-primary-dark);
}

.dash-free {
  margin: 0;
  color: var(--bookedz-muted);
  font-size: .8rem;
}

.dash-day-list {
  display: grid;
  gap: 8px;
}

.dash-day-item {
  display: grid;
  gap: 1px;
  padding-left: 8px;
  border-left: 3px solid var(--kind);
  color: var(--bookedz-ink);
  font-size: .78rem;
  line-height: 1.25;
  text-decoration: none;
}

.dash-day-item strong {
  color: var(--kind);
}

.dash-day-item span {
  overflow-wrap: anywhere;
}

.dash-day-item:hover {
  color: var(--bookedz-ink);
  background: var(--bookedz-hover);
}

.dash-picks {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.dash-pick {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 2px solid var(--bookedz-border);
  border-radius: 16px;
  background: var(--bookedz-surface);
  color: var(--bookedz-ink);
  text-decoration: none;
  transition: background-color var(--bookedz-motion-fast) var(--bookedz-ease);
}

.dash-pick:hover {
  background: var(--bookedz-hover);
  color: var(--bookedz-ink);
}

.dash-tile {
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  overflow: hidden;
}

.dash-tile :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.dash-pick-main {
  display: grid;
  min-width: 0;
}

.dash-pick-main strong {
  overflow-wrap: anywhere;
}

:root[data-theme="dark"] .dash-hero {
  border-color: var(--bookedz-fill);
  box-shadow: 0 6px 0 color-mix(in srgb, var(--bookedz-mango) 60%, transparent);
}

:root[data-theme="dark"] .dash-hero::after {
  color: var(--bookedz-fill);
}

:root[data-theme="dark"] .dash-card:not(.dash-todo) {
  border-color: var(--bookedz-border);
  box-shadow: 0 6px 0 color-mix(in srgb, var(--bookedz-teal) 60%, transparent);
}

:root[data-theme="dark"] .btn-primary {
  border-color: var(--bookedz-fill);
}

:root[data-theme="dark"] .dash-hero .dash-greeting {
  color: var(--bookedz-ink);
}

@media (hover: hover) {
  .dash .btn:not(:disabled):hover {
    transform: translateY(-2px) rotate(-.6deg);
  }
}

@media (max-width: 991.98px) {
  .dash-top {
    grid-template-columns: 1fr;
  }
  .dash-week {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  }
  .dash-picks {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 575.98px) {
  .dash-hero::after {
    left: auto;
    right: 1rem;
    top: 1.4rem;
    translate: 0;
  }
  .dash-next {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .dash-next-art {
    max-width: 112px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dash-avatar, .celebrate .dash-avatar {
    animation: none;
  }
  .dash-burst {
    display: none;
  }
  .dash .btn:not(:disabled):hover {
    transform: none;
  }
}
</style>
