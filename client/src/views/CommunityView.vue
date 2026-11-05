<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { getCurrentUser, getMyRsvps, getGroups, getGroupInvites, respondGroupInvite, getGroupNotices, dismissGroupNotice } from '../utils/api.js';
import { subscribeSocialUpdates } from '../utils/profileSocial.js';
import { requireCommunityAccount } from '../utils/communityAccount.js';
import FriendsPanel from '../components/community/FriendsPanel.vue';
import '../assets/design-baseline.css';
import EventGroupsCard from '../components/community/EventGroupsCard.vue';
import StartGroupDialog from '../components/community/StartGroupDialog.vue';
import SkeletonList from '../components/ui/SkeletonList.vue';
import BumpValue from '../components/ui/BumpValue.vue';
import { toast } from '../composables/useToast';
import { countdownLabel, isOfficialEvent } from '../utils/groups.js';
import { isVenueHiddenForGroups } from '../utils/venueReveal.js';
import { formatEventTime } from '../utils/helpers.js';

// community is go together: people start a group for an event ("who wants to come?"),
// others join, then rsvp to the event itself. private groups show here only for their
// members and the host's friends. official events stay in discover. friends sit in a side
// panel; invites from friends and "group deleted" notices show at the top.


const route = useRoute();

const router = useRouter();

const signedIn = ref(false);

const groups = ref([]);

const events = ref([]); // your upcoming rsvp'd events


const ACTIVE = ['confirmed', 'pending', 'waitlisted', 'offered'];

const loading = ref(true);

const error = ref('');

const filter = ref('all');

const query = ref('');

const composerFor = ref(null); // null closed; '' open with no event; an event id to preselect


const FILTERS = [{
  key: 'all',
  label: 'All groups'
}, {
  key: 'joined',
  label: 'I’m going'
}, {
  key: 'hosting',
  label: 'Hosting'
}, {
  key: 'mine',
  label: 'Your events & groups'
}];
// one filters panel at the right of the search bar (like discover) holds the views

const shownFilters = computed(() => FILTERS.filter(item => signedIn.value || ['all'].includes(item.key)));

const filterLabel = computed(() => FILTERS.find(item => item.key === filter.value)?.label);

const filtersOpen = ref(false);

const searchArea = ref(null);

const filterToggle = ref(null);

function chooseFilter(key) {
  filter.value = key;
  filtersOpen.value = false;
  filterToggle.value?.focus();
}
// the panel closes on a click outside it, or on escape (focus goes back to the filters button)


function closeFiltersOutside(event) {
  if (filtersOpen.value && !searchArea.value?.contains(event.target)) filtersOpen.value = false;
}

function closeFiltersOnEscape(event) {
  if (event.key !== 'Escape' || !filtersOpen.value) return;
  filtersOpen.value = false;
  filterToggle.value?.focus();
}
// phones and tablets (under 992px, bootstrap md and below): a groups | friends switch shows one
// side at a time, groups first; /community#friends opens on friends


const phoneMedia = window.matchMedia('(max-width: 991.98px)');

const phone = ref(phoneMedia.matches);

const pane = ref(route.hash === '#friends' ? 'friends' : 'groups');

const updatePhone = () => {
  phone.value = phoneMedia.matches;
};

const invites = ref([]);

const notices = ref([]);

const inviteBusy = ref('');

let lastLoad = 0; // when the page last fetched, for the focus refresh


async function load() {
  lastLoad = Date.now();
  error.value = '';
  try {
    signedIn.value = Boolean(await getCurrentUser());
    const [groupList, eventList, inviteList, noticeList] = await Promise.all([getGroups(), signedIn.value ? getMyRsvps().catch(() => []) : [], signedIn.value ? getGroupInvites().catch(() => []) : [], signedIn.value ? getGroupNotices().catch(() => []) : []]);
    groups.value = groupList;
    invites.value = inviteList;
    notices.value = noticeList;
    // upcoming events you've rsvp'd to: the "your events" strip, and the only events you can start a group for
    events.value = eventList.filter(r => ACTIVE.includes(r.status) && r.event && isOfficialEvent(r.event) && (!r.event.status || r.event.status === 'published') && new Date(r.event.startTime) > new Date()).map(r => ({
      ...r.event,
      myRsvpStatus: r.status
    }));
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
// groups meet at the venue: not for online events, or while the venue is still hidden


const groupableEvents = computed(() => events.value.filter(e => !e.isOnline && !isVenueHiddenForGroups(e)));

let refreshTimer;
// friend requests arrive in real time in live mode; the panel refreshes when this ticks


const socialUpdates = ref(0);

let stopSocial = () => {};

onMounted(async () => {
  phoneMedia.addEventListener('change', updatePhone);
  document.addEventListener('pointerdown', closeFiltersOutside);
  document.addEventListener('keydown', closeFiltersOnEscape);
  await load();
  if (signedIn.value) stopSocial = subscribeSocialUpdates(() => {
    socialUpdates.value++;
  }, () => true);
  // /community#friends (old profile → friends links) opens at the friends panel
  if (route.hash === '#friends') {
    await nextTick();
    // again once the cards above have settled, so the panel ends up at the top
    const toFriends = () => document.getElementById('friends')?.scrollIntoView({
      block: 'start',
      behavior: 'instant'
    });
    toFriends();
    setTimeout(toFriends, 400);
  }
  // ?start=<event id> opens start a group with that event chosen (linked from event pages)
  if (signedIn.value && typeof route.query.start === 'string') openComposer(route.query.start);else if (signedIn.value && route.query.compose === '1') openComposer();
  // keep the database load low: refresh only while the tab is visible, every 2 minutes,
  // and when you come back to the tab (not more than once a minute)
  refreshTimer = setInterval(() => {
    if (!document.hidden) load();
  }, 120000);
  window.addEventListener('focus', refreshOnFocus);
});

function refreshOnFocus() {
  if (Date.now() - lastLoad > 60000) load();
}

onBeforeUnmount(() => {
  clearInterval(refreshTimer);
  window.removeEventListener('focus', refreshOnFocus);
  phoneMedia.removeEventListener('change', updatePhone);
  document.removeEventListener('pointerdown', closeFiltersOutside);
  document.removeEventListener('keydown', closeFiltersOnEscape);
  stopSocial();
});

async function openComposer(eventId = '') {
  const destination = router.resolve({
    path: '/community',
    query: {
      ...route.query,
      ...(eventId ? {
        start: eventId
      } : {
        compose: '1'
      })
    }
  }).fullPath;
  if (!(await requireCommunityAccount(router, destination))) return;
  // groups are started by people going to the event; from an event page without an rsvp, say so
  if (eventId && !events.value.some(e => e.id === eventId)) {
    toast('RSVP to that event first, then you can start a group for it.', {
      tone: 'error'
    });
    if (route.query.start) router.replace({
      query: {
        ...route.query,
        start: undefined
      }
    });
    return;
  }
  composerFor.value = eventId;
}

function closeComposer() {
  composerFor.value = null;
  if (route.query.start || route.query.compose) router.replace({
    query: {
      ...route.query,
      start: undefined,
      compose: undefined
    }
  });
}

async function onCreated(group) {
  closeComposer();
  const invitedText = group.invitedCount ? ` ${group.invitedCount} ${group.invitedCount === 1 ? 'friend was' : 'friends were'} invited.` : '';
  toast((group.visibility === 'private' ? 'Your friends-only group is ready.' : 'Your group is live.') + invitedText);
  router.push(`/groups/${group.id}`);
}

const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  return groups.value.filter(group => {
    if (filter.value === 'joined' && !['confirmed', 'pending'].includes(group.myStatus)) return false;
    if (filter.value === 'hosting' && group.myStatus !== 'host') return false;
    if (!q) return true;
    return [group.note, group.host.name, group.event?.title, group.event?.venue?.name].some(text => text?.toLowerCase().includes(q));
  });
});

const counts = computed(() => ({
  all: groups.value.length,
  joined: groups.value.filter(g => ['confirmed', 'pending'].includes(g.myStatus)).length,
  hosting: groups.value.filter(g => g.myStatus === 'host').length,
  mine: yours.value.length
}));

async function answerInvite(invite, accept) {
  inviteBusy.value = invite.id;
  try {
    await respondGroupInvite(invite.id, accept);
    toast(accept ? `You joined ${invite.from.name}’s group` : 'Invite declined');
    if (accept) {
      router.push(`/groups/${invite.group.id}`);
      return;
    }
    await load();
  } catch (e) {
    toast(e.message, {
      tone: 'error'
    });
    await load();
  } finally {
    inviteBusy.value = '';
  }
}

async function dismissNotice(notice) {
  notices.value = notices.value.filter(n => n.id !== notice.id);
  try {
    await dismissGroupNotice(notice.id);
  } catch {/* it shows again next time */}
}
// "your groups": hosting, in, or asked to join; soonest first


const mine = computed(() => groups.value.filter(g => ['host', 'confirmed', 'pending'].includes(g.myStatus)).sort((a, b) => new Date(a.startTime) - new Date(b.startTime)));
// events you're going to, each with your group for it (one per event); groups whose event isn't listed stand alone


const yours = computed(() => {
  const groupFor = id => mine.value.find(g => (g.eventId || g.event?.id) === id);
  const rows = events.value.map(event => ({
    key: `e-${event.id}`,
    event,
    group: groupFor(event.id),
    start: new Date(event.startTime)
  }));
  const listed = new Set(events.value.map(event => event.id));
  for (const group of mine.value) if (!listed.has(group.eventId || group.event?.id)) rows.push({
    key: `g-${group.id}`,
    event: null,
    group,
    start: new Date(group.startTime)
  });
  return rows.sort((a, b) => a.start - b.start);
});
// the search box filters this view too: by event title or the group's host


const yoursShown = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return yours.value;
  return yours.value.filter(item => [item.event?.title, item.group?.event?.title, item.group?.host?.name].some(text => text?.toLowerCase().includes(q)));
});

const mineChip = g => g.myStatus === 'host' ? g.pendingCount ? `${g.pendingCount} ${g.pendingCount === 1 ? 'request' : 'requests'} to review` : 'Hosting' : g.myStatus === 'pending' ? 'Request sent' : g.myEventStatus ? 'You’re in' : 'RSVP to the event';
// the feed: one card per event with its groups inside, soonest event first


const byEvent = computed(() => {
  const map = new Map();
  for (const g of visible.value) {
    const key = g.eventId || g.event?.id || g.id;
    if (!map.has(key)) map.set(key, {
      key,
      event: g.event,
      groups: []
    });
    map.get(key).groups.push(g);
  }
  return [...map.values()].sort((a, b) => new Date(a.event?.startTime || a.groups[0].startTime) - new Date(b.event?.startTime || b.groups[0].startTime));
});

const rsvpLabel = {
  confirmed: 'Going',
  pending: 'Waiting for approval',
  waitlisted: 'On the waitlist',
  offered: 'Spot offered'
};

const groupCount = eventId => groups.value.filter(g => (g.eventId || g.event?.id) === eventId).length;

function showEventGroups(eventId) {
  filter.value = 'all';
  query.value = '';
  nextTick(() => document.getElementById(`event-row-${eventId}`)?.scrollIntoView({
    block: 'start',
    behavior: 'smooth'
  }));
}
</script>

<template>
  <div class="container community-page">
    <h1 v-if="phone" class="visually-hidden">Community</h1>
    <!-- phones and tablets: groups or friends, one at a time; start a group appears with groups -->
    <div v-if="phone" class="community-modebar">
      <div
          class="community-switch"
          :class="{ 'is-friends': pane === 'friends' }"
          role="group"
          aria-label="Show">
        <span class="community-switch-thumb" aria-hidden="true"></span>
        <button type="button" :aria-pressed="pane === 'groups'" @click="pane = 'groups'">
          <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5" />
              <circle cx="17" cy="9" r="3" />
              <path d="M16 14.6c3.2.3 5.5 2 5.5 5.4" /></svg>
          Groups
        </button>
        <button type="button" :aria-pressed="pane === 'friends'" @click="pane = 'friends'">
          <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" /></svg>
          Friends
        </button>
      </div>
      <Transition name="pop-in">
        <button
            v-if="pane === 'groups'"
            type="button"
            class="btn btn-primary community-start"
            :disabled="loading"
            @click="openComposer()">Start a group</button>
      </Transition>
    </div>
    <!-- two columns from the top: everything group-related on the left, friends as a full-height sidebar -->
    <div class="community-shell">
    <div v-show="!phone || pane === 'groups'" class="community-column">
    <!-- one slim header: title and start a group, with the explainer folded away after the first visit -->
    <header v-if="!phone" class="community-hero smart-head">
      <div class="smart-head-top">
        <div class="smart-head-title">
            <span class="smart-head-star" aria-hidden="true">★</span>
            <h1 class="page-title m-0">Community</h1></div>
        <div class="community-hero-actions">
          <button
              type="button"
              class="btn btn-primary"
              :disabled="loading"
              @click="openComposer()">Start a group</button>
        </div>
      </div>
      <p class="community-lede">Going to an event? Start a group for it, public or just for friends. Joining someone’s group RSVPs you to the event too.</p>
    </header>

    <!-- a group you were in was deleted -->
    <TransitionGroup v-if="notices.length" tag="div" name="list-fade" class="community-notices">
      <p v-for="notice in notices" :key="notice.id" class="community-notice" role="status">
        <span>
            <strong>{{ notice.hostName }}</strong> deleted their group for {{ notice.eventTitle }}. Your RSVP to the event itself hasn’t changed.</span>
        <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            :aria-label="`Dismiss notice about ${notice.eventTitle}`"
            @click="dismissNotice(notice)">OK</button>
      </p>
    </TransitionGroup>

    <!-- invites from friends -->
    <section v-if="invites.length" class="community-invites" aria-labelledby="invites-title">
      <h2 id="invites-title" class="community-section-title">You’re invited <span class="community-count">{{ invites.length }}</span></h2>
      <TransitionGroup tag="ul" name="list-fade" class="list-unstyled m-0 community-invite-list">
        <li v-for="invite in invites" :key="invite.id" class="community-invite">
          <div class="min-w-0">
            <p class="m-0">
                <strong>{{ invite.from.name }}</strong> invited you to go to <strong>{{ invite.group.event?.title || 'an event' }}</strong></p>
            <p class="text-caption text-secondary m-0">{{ invite.group.event ? formatEventTime(invite.group.event) : '' }}<template v-if="invite.group.note"> · “{{ invite.group.note }}”</template></p>
          </div>
          <div class="community-invite-actions">
            <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="Boolean(inviteBusy)"
                @click="answerInvite(invite, true)">{{ inviteBusy === invite.id ? 'Joining…' : 'Accept' }}</button>
            <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                :disabled="Boolean(inviteBusy)"
                @click="answerInvite(invite, false)">Decline</button>
            <RouterLink :to="`/groups/${invite.group.id}`" class="btn btn-link btn-sm">View</RouterLink>
          </div>
        </li>
      </TransitionGroup>
    </section>

    <div class="community-main">
      <!-- search, with every view in one filters panel at its right (like discover) -->
      <div ref="searchArea" class="community-search-area">
        <div class="community-search-bar">
          <label class="community-search-field">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4 4" /></svg>
            <span class="visually-hidden">Search groups</span>
            <input
                id="group-search"
                v-model="query"
                type="search"
                placeholder="Search events, hosts or notes…"
                autocomplete="off" />
          </label>
          <button
              ref="filterToggle"
              type="button"
              class="community-filter-toggle"
              :class="{ 'is-active': filter !== 'all' }"
              :aria-expanded="filtersOpen"
              aria-controls="community-filter-panel"
              @click="filtersOpen = !filtersOpen">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16M4 17h16" />
                <circle cx="9" cy="7" r="3" />
                <circle cx="15" cy="17" r="3" /></svg>
            Filters<span v-if="filter !== 'all'" class="community-filter-count">1<span class="visually-hidden"> active</span></span>
          </button>
        </div>
        <div
            v-if="filtersOpen"
            id="community-filter-panel"
            class="community-filter-panel"
            role="group"
            aria-label="Show groups">
          <button
              v-for="f in shownFilters"
              :key="f.key"
              type="button"
              class="community-filter-option"
              :aria-pressed="filter === f.key"
              @click="chooseFilter(f.key)">
            <span>{{ f.label }}</span><span class="community-filter-option-count tnum">
                <BumpValue :value="counts[f.key]" /></span>
          </button>
        </div>
        <p v-if="filter !== 'all'" class="community-filter-active">Showing <strong>{{ filterLabel }}</strong> <button type="button" class="btn btn-link btn-sm" @click="chooseFilter('all')">Show all groups</button></p>
      </div>

      <!-- your events and groups, merged into one view -->
      <div v-if="filter === 'mine'" class="community-yours">
      <!-- one card per event, with your group for it attached (you can be in one group per event) -->
      <ul v-if="yoursShown.length" class="list-unstyled m-0 community-yours-list">
        <li v-for="item in yoursShown" :key="item.key">
          <article class="community-tile community-event-tile" :class="{ 'is-alert': item.group?.myStatus === 'host' && item.group?.pendingCount }">
            <span class="community-tile-when">{{ countdownLabel(item.event?.startTime || item.group.startTime) }}</span>
            <RouterLink
                  v-if="item.event"
                  :to="`/events/${item.event.id}/rsvp`"
                  class="community-tile-title">{{ item.event.title }}</RouterLink>
            <strong v-else class="community-tile-title">{{ item.group.event?.title || 'Group' }}</strong>
            <span class="community-tile-meta">{{ formatEventTime(item.event || item.group.event || item.group) }}</span>
            <span v-if="item.event" class="community-tile-chip">{{ rsvpLabel[item.event.myRsvpStatus] }}</span>
            <div v-if="item.group" class="community-attached">
              <span class="community-attached-label">Your group</span>
              <RouterLink :to="`/groups/${item.group.id}`" class="community-attached-link">
                <strong>{{ item.group.myStatus === 'host' ? 'You’re hosting' : `${item.group.host.name}’s group` }}</strong>
                <span>{{ 1 + item.group.members.length }} going · {{ mineChip(item.group) }}</span>
              </RouterLink>
            </div>
            <span v-else class="community-event-actions">
              <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    @click="openComposer(item.event.id)">Start a group</button>
              <button
                    v-if="groupCount(item.event.id)"
                    type="button"
                    class="btn btn-outline-secondary btn-sm"
                    @click="showEventGroups(item.event.id)">See {{ groupCount(item.event.id) }} {{ groupCount(item.event.id) === 1 ? 'group' : 'groups' }}</button>
            </span>
          </article>
        </li>
      </ul>
        <div v-if="!yoursShown.length && !loading" class="community-empty" role="status">
          <h2 class="section-title">{{ query ? 'Nothing matches your search' : 'Nothing here yet' }}</h2>
          <p>RSVP to an event, then start a group for it or join someone else’s.</p>
          <button type="button" class="btn btn-primary" @click="openComposer()">Start a group</button>
        </div>
      </div>
      <template v-else>
      <SkeletonList v-if="loading" :count="3" label="Loading groups…" />
      <div v-dismissible v-else-if="error" class="community-empty" role="alert">
        <h2 class="section-title">Couldn’t load groups</h2>
        <p>{{ error }}</p>
        <button type="button" class="btn btn-outline-secondary" @click="load">Try again</button>
      </div>
      <TransitionGroup v-else-if="visible.length" tag="div" name="list-fade" class="community-feed stagger-in">
        <EventGroupsCard
              v-for="item in byEvent"
              :id="`event-row-${item.key}`"
              :key="item.key"
              :event="item.event"
              :groups="item.groups"
              :can-start="events.some((e) => e.id === item.key)"
              @changed="load"
              @start="openComposer" />
      </TransitionGroup>
      <div v-else class="community-empty" role="status">
        <h2 class="section-title">{{ query || filter !== 'all' ? 'No groups match' : 'No groups yet' }}</h2>
        <p>{{ filter === 'hosting' ? 'You aren’t hosting any groups.' : filter === 'joined' ? 'You haven’t joined any groups yet.' : 'Be the first: pick an event and ask who wants to come.' }}</p>
        <div class="d-flex flex-wrap gap-2 justify-content-center">
          <button
                type="button"
                class="btn btn-primary"
                :disabled="loading"
                @click="openComposer()">Start a group</button>
          <button
                v-if="query || filter !== 'all'"
                type="button"
                class="btn btn-outline-secondary"
                @click="query = ''; filter = 'all'">Show all groups</button>
        </div>
      </div>
      </template>
    </div>
    </div>

    <!-- friends sidebar: find people by username and handle friend requests -->
    <aside
        v-show="!phone || pane === 'friends'"
        id="friends"
        class="community-aside"
        aria-label="Friends">
      <FriendsPanel v-if="signedIn" compact :updates="socialUpdates" />
      <section v-else class="community-empty">
        <h2 class="section-title">Find your people</h2>
        <p>Sign in to add friends, start a group and join the conversation.</p>
        <RouterLink class="btn btn-primary" :to="{ path: '/', query: { redirect: '/community#friends' }, hash: '#join-dino' }">Log in / Sign up</RouterLink></section>
    </aside>
    </div>

    <StartGroupDialog
    v-if="composerFor !== null"
    :events="groupableEvents"
    :event-id="composerFor"
    @close="closeComposer"
    @created="onCreated" />
  </div>
</template>

<style scoped>
.community-page {
  width: 100%;
  max-width: none;
  padding-block: 1.5rem 3rem;
}

.community-shell {
  display: grid;
  gap: 24px;
  align-items: start;
}

.community-column, .community-main {
  min-width: 0;
}

.community-aside {
  min-width: 0;
  scroll-margin-top: 16px;
}

/* from 992px (lg): friends is a sidebar beside everything, from the top of the page, as tall as its
   content needs; a third of the width, at most 340px, so the groups keep room on smaller laptops */

@media (min-width: 992px) {
  .community-shell {
    grid-template-columns: minmax(0, 1fr) min(340px, 34%);
  }
  .community-aside {
    position: sticky;
    top: calc(env(safe-area-inset-top, 0px) + 16px);
    max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px));
    overflow-y: auto;
    overscroll-behavior: contain;
    border-radius: 24px;
  }
}

.community-eyebrow {
  margin: 0 0 6px;
  color: var(--bookedz-muted);
  font-weight: 600;
}

.community-hero {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 22px;
}

.smart-head > .community-lede {
  max-width: none;
  margin: 0;
}

.community-lede {
  margin: 8px 0 0;
  max-width: 46ch;
  color: var(--bookedz-muted);
}

.community-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.community-hero-actions .btn {
  min-height: 44px;
}

/* search bar with the filters button at its right, like discover */

.community-search-area {
  position: relative;
  margin-bottom: 18px;
}

.community-search-bar {
  display: flex;
  align-items: stretch;
  gap: 6px;
  padding: 5px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 999px;
  background: var(--bookedz-surface);
}

.community-search-bar:focus-within {
  border-color: var(--bookedz-fill);
  box-shadow: 0 0 0 .25rem color-mix(in srgb, var(--bookedz-fill) 28%, transparent);
}

.community-search-field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0 6px 0 12px;
}

.community-search-field svg {
  flex: none;
  width: 18px;
  height: 18px;
  fill: none;
  stroke: var(--bookedz-muted);
  stroke-width: 2;
  stroke-linecap: round;
}

.community-search-field input {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  border: 0;
  background: transparent;
  color: var(--bookedz-ink);
  font-size: var(--text-small);
  outline: none;
}

.community-filter-toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 16px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 999px;
  background: var(--bookedz-orange-soft);
  color: var(--bookedz-ink);
  font-weight: 700;
}

.community-filter-toggle svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.community-filter-toggle.is-active {
  background: var(--bookedz-fill);
  color: var(--bookedz-on-fill);
}

.community-filter-count {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 99px;
  background: var(--bookedz-ink);
  color: var(--bookedz-surface);
  font-size: .75rem;
}

.community-filter-panel {
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
  display: grid;
  gap: 6px;
  width: min(100%, 22rem);
  padding: 12px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 20px;
  background: var(--bookedz-surface);
  box-shadow: var(--bookedz-neutral-shadow-hover);
}

.community-filter-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  padding: 8px 14px;
  border: 2px solid var(--bookedz-control-border);
  border-radius: 99px;
  background: var(--bookedz-surface);
  color: var(--bookedz-ink);
  font-weight: 700;
  text-align: left;
}

.community-filter-option:hover {
  background: var(--bookedz-hover);
}

.community-filter-option[aria-pressed='true'] {
  background: var(--bookedz-fill);
  border-color: var(--bookedz-ink);
  color: var(--bookedz-on-fill);
}

.community-filter-option-count {
  padding: 0 8px;
  border-radius: 99px;
  background: color-mix(in srgb, currentColor 14%, transparent);
  font-size: .75rem;
}

.community-filter-active {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 8px 0 0 14px;
  color: var(--bookedz-muted);
  font-size: var(--text-small);
}

.community-filter-active .btn {
  padding: 0 4px;
}

/* dark mode: the same bright edge as the outline buttons */

:root[data-theme="dark"] .community-search-bar,
:root[data-theme="dark"] .community-filter-toggle,
:root[data-theme="dark"] .community-filter-panel,
:root[data-theme="dark"] .community-switch {
  border-color: color-mix(in srgb, var(--bookedz-ink) 75%, var(--bookedz-surface));
}

:root[data-theme="dark"] .community-filter-option[aria-pressed='true'] {
  border-color: var(--bookedz-fill);
}

/* phones and tablets: the groups | friends switch, and start a group popping in beside it in groups mode */

.community-modebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.community-switch {
  position: relative;
  display: inline-grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 99px;
  background: var(--bookedz-surface);
}

.community-switch button {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 88px;
  min-height: 40px;
  padding: 6px 12px;
  border: 0;
  border-radius: 99px;
  background: transparent;
  color: var(--bookedz-muted);
  font-size: var(--text-small);
  font-weight: 700;
  transition: color var(--bookedz-motion-fast) var(--bookedz-ease);
}

.community-switch button[aria-pressed='true'] {
  color: var(--bookedz-on-fill);
}

.community-switch svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.community-switch-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc(50% - 3px);
  border-radius: 99px;
  background: var(--bookedz-fill);
  transition: transform var(--bookedz-motion-normal) var(--bookedz-ease-stamp);
}

.community-switch.is-friends .community-switch-thumb {
  transform: translateX(100%);
}

.community-start {
  min-height: 44px;
  border-radius: 99px;
}

.pop-in-enter-active, .pop-in-leave-active {
  transition: opacity var(--bookedz-motion-fast) var(--bookedz-ease), transform var(--bookedz-motion-normal) var(--bookedz-ease-stamp);
}

.pop-in-enter-from, .pop-in-leave-to {
  opacity: 0;
  transform: scale(.85);
}

@media (prefers-reduced-motion: reduce) {
  .community-switch-thumb, .community-switch button, .pop-in-enter-active, .pop-in-leave-active {
    transition: none;
  }
}

.community-feed {
  display: grid;
  gap: 18px;
}

.community-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font: 900 1.15rem var(--bookedz-heading);
}

.community-count {
  padding: 0 8px;
  border-radius: 99px;
  background: var(--bookedz-fill);
  color: var(--bookedz-on-fill);
  font-size: .8rem;
}

.community-notices {
  display: grid;
  gap: 8px;
  margin-bottom: 18px;
}

.community-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
  padding: 10px 14px;
  border: 2px dashed var(--bookedz-control-border);
  border-radius: 16px;
  background: var(--bookedz-surface);
}

.community-invites {
  margin-bottom: 22px;
  padding: 16px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 24px;
  background: color-mix(in srgb, var(--bookedz-pink) 12%, var(--bookedz-surface));
  box-shadow: 6px 6px 0 var(--bookedz-pink);
}

:root[data-theme="dark"] .community-invites {
  border-color: var(--bookedz-border);
}

.community-invite-list {
  display: grid;
  gap: 8px;
}

.community-invite {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  background: var(--bookedz-surface);
}

.community-invite-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.community-invite-actions .btn {
  min-height: 40px;
}

.min-w-0 {
  min-width: 0;
  overflow-wrap: anywhere;
}

.community-mine {
  margin-bottom: 22px;
}

.community-yours-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  gap: 14px;
}

.community-attached {
  display: grid;
  gap: 2px;
  margin-top: 8px;
  padding: 8px 10px;
  border: 2px dashed var(--bookedz-control-border);
  border-radius: 14px;
  background: var(--bookedz-orange-soft, transparent);
}

.community-attached-label {
  color: var(--bookedz-muted);
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.community-attached-link {
  display: grid;
  gap: 1px;
  color: var(--bookedz-ink);
  text-decoration: none;
}

.community-attached-link span {
  color: var(--bookedz-muted);
  font-size: .82rem;
}

.community-attached-link:hover strong {
  text-decoration: underline;
}

.community-mine-list {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 4px 4px 10px;
  scroll-snap-type: x proximity;
}

.community-mine-list li {
  flex: 0 0 min(240px, 78vw);
  scroll-snap-align: start;
}

.community-tile {
  display: grid;
  gap: 4px;
  height: 100%;
  padding: 12px 14px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 20px;
  background: var(--bookedz-surface);
  color: var(--bookedz-ink);
  text-decoration: none;
  box-shadow: 4px 4px 0 var(--bookedz-mango);
  transition: transform var(--bookedz-motion-normal) var(--bookedz-ease);
}

/* tiles open something, so in dark mode they get a bright edge that turns orange on hover */

:root[data-theme="dark"] .community-tile {
  border-color: color-mix(in srgb, var(--bookedz-ink) 60%, var(--bookedz-surface));
}

:root[data-theme="dark"] .community-tile:hover {
  border-color: var(--bookedz-fill);
}

.community-tile:hover {
  color: var(--bookedz-ink);
  transform: translate(-1px, -2px);
}

.community-tile.is-alert {
  box-shadow: 4px 4px 0 var(--bookedz-fill);
}

.community-tile-when {
  justify-self: start;
  padding: 1px 8px;
  border-radius: 99px;
  background: var(--bookedz-mango-soft);
  font-size: .72rem;
  font-weight: 800;
}

.community-tile-title {
  font-family: var(--bookedz-heading);
  overflow-wrap: anywhere;
}

.community-tile-meta {
  color: var(--bookedz-muted);
  font-size: .82rem;
}

.community-event-tile {
  box-shadow: 4px 4px 0 var(--bookedz-teal);
}

.community-event-tile .community-tile-title {
  color: var(--bookedz-ink);
  text-decoration: none;
}

.community-event-tile .community-tile-title:hover {
  text-decoration: underline;
}

.community-event-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.community-event-actions .btn {
  min-height: 36px;
}

.community-tile-chip {
  justify-self: start;
  margin-top: 2px;
  padding: 2px 9px;
  border: 1.5px solid var(--bookedz-control-border);
  border-radius: 99px;
  font-size: .74rem;
  font-weight: 700;
}

.community-tile.is-alert .community-tile-chip {
  border-color: var(--bookedz-fill);
  background: var(--bookedz-orange-soft);
  color: var(--bookedz-primary-dark);
}

@media (prefers-reduced-motion: reduce) {
  .community-tile {
    transition: none;
  }
  .community-tile:hover {
    transform: none;
  }
}

.community-empty {
  padding: 32px 20px;
  border: 1px dashed var(--bookedz-border);
  border-radius: 20px;
  background: var(--bookedz-surface);
  text-align: center;
}

.community-empty p {
  color: var(--bookedz-muted);
}
</style>
