<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { getMyRsvps, getGroups, getGroupInvites, respondGroupInvite, getGroupNotices, dismissGroupNotice } from '../utils/api.js'
import { subscribeSocialUpdates } from '../utils/profileSocial.js'
import FriendsPanel from '../components/community/FriendsPanel.vue'
import '../assets/design-baseline.css'
import EventGroupsCard from '../components/community/EventGroupsCard.vue'
import StartGroupDialog from '../components/community/StartGroupDialog.vue'
import SkeletonList from '../components/ui/SkeletonList.vue'
import BumpValue from '../components/ui/BumpValue.vue'
import { toast } from '../composables/useToast'
import { countdownLabel, isOfficialEvent } from '../utils/groups.js'
import { formatEventTime } from '../utils/helpers.js'

// Community is Go together: people start a group for an event ("who wants to come?"),
// others join, then RSVP to the event itself. Private groups show here only for their
// members and the host's friends. Official events stay in Discover. Friends sit in a side
// panel; invites from friends and "group deleted" notices show at the top.
const route = useRoute()
const router = useRouter()
const groups = ref([])
const events = ref([]) // your upcoming RSVP'd events
const ACTIVE = ['confirmed', 'pending', 'waitlisted', 'offered']
const loading = ref(true)
const error = ref('')
const filter = ref('all')
const query = ref('')
const composerFor = ref(null) // null closed; '' open with no event; an event id to preselect

const FILTERS = [
  { key: 'all', label: 'All groups' },
  { key: 'week', label: 'This week' },
  { key: 'joined', label: 'I’m going' },
  { key: 'hosting', label: 'Hosting' },
]

const invites = ref([])
const notices = ref([])
const inviteBusy = ref('')
async function load() {
  error.value = ''
  try {
    const [groupList, eventList, inviteList, noticeList] = await Promise.all([
      getGroups(), getMyRsvps().catch(() => []), getGroupInvites().catch(() => []), getGroupNotices().catch(() => []),
    ])
    groups.value = groupList
    invites.value = inviteList
    notices.value = noticeList
    // Upcoming events you've RSVP'd to: the "Your events" strip, and the only events you can start a group for
    events.value = eventList
      .filter((r) => ACTIVE.includes(r.status) && r.event && isOfficialEvent(r.event) && (!r.event.status || r.event.status === 'published') && new Date(r.event.startTime) > new Date())
      .map((r) => ({ ...r.event, myRsvpStatus: r.status }))
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

let refreshTimer
// Friend requests arrive in real time in live mode; the panel refreshes when this ticks
const socialUpdates = ref(0)
let stopSocial = () => {}
onMounted(async () => {
  stopSocial = subscribeSocialUpdates(() => { socialUpdates.value++ }, () => true)
  await load()
  // /community#friends (old Profile → Friends links) opens at the Friends panel
  if (route.hash === '#friends') {
    await nextTick()
    // Again once the cards above have settled, so the panel ends up at the top
    const toFriends = () => document.getElementById('friends')?.scrollIntoView({ block: 'start', behavior: 'instant' })
    toFriends(); setTimeout(toFriends, 400)
  }
  // ?start=<event id> opens Start a group with that event chosen (linked from event pages)
  if (typeof route.query.start === 'string') openComposer(route.query.start)
  refreshTimer = setInterval(load, 30000)
  window.addEventListener('focus', load)
})
onBeforeUnmount(() => { clearInterval(refreshTimer); window.removeEventListener('focus', load); stopSocial() })

function openComposer(eventId = '') {
  // Groups are started by people going to the event; from an event page without an RSVP, say so
  if (eventId && !events.value.some((e) => e.id === eventId)) {
    toast('RSVP to that event first, then you can start a group for it.', { tone: 'error' })
    if (route.query.start) router.replace({ query: { ...route.query, start: undefined } })
    return
  }
  composerFor.value = eventId
}
function closeComposer() {
  composerFor.value = null
  if (route.query.start) router.replace({ query: { ...route.query, start: undefined } })
}
async function onCreated(group) {
  closeComposer()
  const invitedText = group.invitedCount ? ` ${group.invitedCount} ${group.invitedCount === 1 ? 'friend was' : 'friends were'} invited.` : ''
  toast((group.visibility === 'private' ? 'Your friends-only group is ready.' : 'Your group is live.') + invitedText)
  router.push(`/groups/${group.id}`)
}
const weekEnd = () => Date.now() + 7 * 86400000
const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return groups.value.filter((group) => {
    if (filter.value === 'week' && new Date(group.startTime) > weekEnd()) return false
    if (filter.value === 'joined' && !['confirmed', 'pending'].includes(group.myStatus)) return false
    if (filter.value === 'hosting' && group.myStatus !== 'host') return false
    if (!q) return true
    return [group.note, group.host.name, group.event?.title, group.event?.venue?.name].some((text) => text?.toLowerCase().includes(q))
  })
})
const counts = computed(() => ({
  all: groups.value.length,
  week: groups.value.filter((g) => new Date(g.startTime) <= weekEnd()).length,
  joined: groups.value.filter((g) => ['confirmed', 'pending'].includes(g.myStatus)).length,
  hosting: groups.value.filter((g) => g.myStatus === 'host').length,
}))

async function answerInvite(invite, accept) {
  inviteBusy.value = invite.id
  try {
    await respondGroupInvite(invite.id, accept)
    toast(accept ? `You joined ${invite.from.name}’s group` : 'Invite declined')
    if (accept) { router.push(`/groups/${invite.group.id}`); return }
    await load()
  } catch (e) {
    toast(e.message, { tone: 'error' })
    await load()
  } finally {
    inviteBusy.value = ''
  }
}
async function dismissNotice(notice) {
  notices.value = notices.value.filter((n) => n.id !== notice.id)
  try { await dismissGroupNotice(notice.id) } catch { /* it shows again next time */ }
}
// "Your groups": hosting, in, or asked to join; soonest first
const mine = computed(() => groups.value
  .filter((g) => ['host', 'confirmed', 'pending'].includes(g.myStatus))
  .sort((a, b) => new Date(a.startTime) - new Date(b.startTime)))
const mineChip = (g) => g.myStatus === 'host'
  ? (g.pendingCount ? `${g.pendingCount} ${g.pendingCount === 1 ? 'request' : 'requests'} to review` : 'Hosting')
  : g.myStatus === 'pending' ? 'Request sent' : g.myEventStatus ? 'You’re in' : 'RSVP to the event'
// The feed: one card per event with its groups inside, soonest event first
const byEvent = computed(() => {
  const map = new Map()
  for (const g of visible.value) {
    const key = g.eventId || g.event?.id || g.id
    if (!map.has(key)) map.set(key, { key, event: g.event, groups: [] })
    map.get(key).groups.push(g)
  }
  return [...map.values()].sort((a, b) => new Date(a.event?.startTime || a.groups[0].startTime) - new Date(b.event?.startTime || b.groups[0].startTime))
})
const rsvpLabel = { confirmed: 'Going', pending: 'Waiting for approval', waitlisted: 'On the waitlist', offered: 'Spot offered' }
const groupCount = (eventId) => groups.value.filter((g) => (g.eventId || g.event?.id) === eventId).length
function showEventGroups(eventId) {
  filter.value = 'all'
  query.value = ''
  nextTick(() => document.getElementById(`event-row-${eventId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
}
</script>

<template>
  <div class="container community-page">
    <header class="community-hero">
      <div class="community-hero-copy">
        <p class="community-eyebrow">Community</p>
        <h1 class="page-title m-0">Go together</h1>
        <p class="community-lede">Going to an event? Start a group for it, public or just for friends. Joining someone’s group RSVPs you to the event too.</p>
      </div>
      <div class="community-hero-actions">
        <button type="button" class="btn btn-primary" :disabled="loading" @click="openComposer()">Start a group</button>
      </div>
    </header>

    <!-- A group you were in was deleted -->
    <TransitionGroup v-if="notices.length" tag="div" name="list-fade" class="community-notices">
      <p v-for="notice in notices" :key="notice.id" class="community-notice" role="status">
        <span><strong>{{ notice.hostName }}</strong> deleted their group for {{ notice.eventTitle }}. Your RSVP to the event itself hasn’t changed.</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" :aria-label="`Dismiss notice about ${notice.eventTitle}`" @click="dismissNotice(notice)">OK</button>
      </p>
    </TransitionGroup>

    <!-- Invites from friends -->
    <section v-if="invites.length" class="community-invites" aria-labelledby="invites-title">
      <h2 id="invites-title" class="community-section-title">You’re invited <span class="community-count">{{ invites.length }}</span></h2>
      <TransitionGroup tag="ul" name="list-fade" class="list-unstyled m-0 community-invite-list">
        <li v-for="invite in invites" :key="invite.id" class="community-invite">
          <div class="min-w-0">
            <p class="m-0"><strong>{{ invite.from.name }}</strong> invited you to go to <strong>{{ invite.group.event?.title || 'an event' }}</strong></p>
            <p class="text-caption text-secondary m-0">{{ invite.group.event ? formatEventTime(invite.group.event) : '' }}<template v-if="invite.group.note"> · “{{ invite.group.note }}”</template></p>
          </div>
          <div class="community-invite-actions">
            <button type="button" class="btn btn-primary btn-sm" :disabled="Boolean(inviteBusy)" @click="answerInvite(invite, true)">{{ inviteBusy === invite.id ? 'Joining…' : 'Accept' }}</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="Boolean(inviteBusy)" @click="answerInvite(invite, false)">Decline</button>
            <RouterLink :to="`/groups/${invite.group.id}`" class="btn btn-link btn-sm">View</RouterLink>
          </div>
        </li>
      </TransitionGroup>
    </section>

    <!-- Your events: what you've RSVP'd to, with a way to start or find a group for each -->
    <section v-if="events.length" class="community-mine" aria-labelledby="my-events-title">
      <h2 id="my-events-title" class="community-section-title">Your events <span class="community-count">{{ events.length }}</span></h2>
      <ul class="list-unstyled m-0 community-mine-list">
        <li v-for="event in events" :key="event.id">
          <article class="community-tile community-event-tile">
            <span class="community-tile-when">{{ countdownLabel(event.startTime) }}</span>
            <RouterLink :to="`/events/${event.id}/rsvp`" class="community-tile-title">{{ event.title }}</RouterLink>
            <span class="community-tile-meta">{{ formatEventTime(event) }}</span>
            <span class="community-tile-chip">{{ rsvpLabel[event.myRsvpStatus] }} · {{ groupCount(event.id) }} {{ groupCount(event.id) === 1 ? 'group' : 'groups' }}</span>
            <span class="community-event-actions">
              <button type="button" class="btn btn-primary btn-sm" @click="openComposer(event.id)">Start a group</button>
              <button v-if="groupCount(event.id)" type="button" class="btn btn-outline-secondary btn-sm" @click="showEventGroups(event.id)">See groups</button>
            </span>
          </article>
        </li>
      </ul>
    </section>

    <!-- Your groups: quick tiles for what you host or are in -->
    <section v-if="mine.length" class="community-mine" aria-labelledby="mine-title">
      <h2 id="mine-title" class="community-section-title">Your groups</h2>
      <ul class="list-unstyled m-0 community-mine-list">
        <li v-for="g in mine" :key="g.id">
          <RouterLink :to="`/groups/${g.id}`" class="community-tile" :class="{ 'is-alert': g.myStatus === 'host' && g.pendingCount }">
            <span class="community-tile-when">{{ countdownLabel(g.startTime) }}</span>
            <strong class="community-tile-title">{{ g.event?.title || 'Group' }}</strong>
            <span class="community-tile-meta">{{ g.myStatus === 'host' ? 'You’re hosting' : `${g.host.name}’s group` }} · {{ 1 + g.members.length }} going</span>
            <span class="community-tile-chip">{{ mineChip(g) }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <div class="community-layout">
    <div class="community-main">
      <div class="community-tools">
        <div class="community-filters" role="group" aria-label="Show groups">
          <button v-for="f in FILTERS" :key="f.key" type="button" class="community-filter" :aria-pressed="filter === f.key" @click="filter = f.key">
            {{ f.label }} <span class="tnum"><BumpValue :value="counts[f.key]" /></span>
          </button>
        </div>
        <label class="visually-hidden" for="group-search">Search groups</label>
        <input id="group-search" v-model="query" type="search" class="form-control community-search" placeholder="Search events, hosts or notes…" autocomplete="off" />
      </div>

      <SkeletonList v-if="loading" :count="3" label="Loading groups…" />
      <div v-dismissible v-else-if="error" class="community-empty" role="alert">
        <h2 class="section-title">Couldn’t load groups</h2>
        <p>{{ error }}</p>
        <button type="button" class="btn btn-outline-secondary" @click="load">Try again</button>
      </div>
      <TransitionGroup v-else-if="visible.length" tag="div" name="list-fade" class="community-feed stagger-in">
        <EventGroupsCard v-for="item in byEvent" :id="`event-row-${item.key}`" :key="item.key" :event="item.event" :groups="item.groups" :can-start="events.some((e) => e.id === item.key)" @changed="load" @start="openComposer" />
      </TransitionGroup>
      <div v-else class="community-empty" role="status">
        <h2 class="section-title">{{ query || filter !== 'all' ? 'No groups match' : 'No groups yet' }}</h2>
        <p>{{ filter === 'hosting' ? 'You aren’t hosting any groups.' : filter === 'joined' ? 'You haven’t joined any groups yet.' : 'Be the first: pick an event and ask who wants to come.' }}</p>
        <div class="d-flex flex-wrap gap-2 justify-content-center">
          <button type="button" class="btn btn-primary" :disabled="loading" @click="openComposer()">Start a group</button>
          <button v-if="query || filter !== 'all'" type="button" class="btn btn-outline-secondary" @click="query = ''; filter = 'all'">Show all groups</button>
        </div>
      </div>
    </div>

    <!-- A small side panel: find people by username and handle friend requests -->
    <aside id="friends" class="community-aside" aria-label="Friends">
      <FriendsPanel compact :updates="socialUpdates" />
    </aside>
    </div>

    <StartGroupDialog v-if="composerFor !== null" :events="events" :event-id="composerFor" @close="closeComposer" @created="onCreated" />
  </div>
</template>

<style scoped>
.community-page { width: 100%; max-width: none; padding-block: 1.5rem 3rem; }
.community-layout { display: grid; gap: 22px; align-items: start; }
.community-main { min-width: 0; }
.community-aside { min-width: 0; scroll-margin-top: 16px; }
@media (min-width: 1200px) { .community-layout { grid-template-columns: minmax(0, 1fr) 320px; } .community-aside { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 16px); } }
.community-eyebrow { margin: 0 0 6px; color: var(--bookedz-muted); font-weight: 600; }
.community-hero { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 22px; }
.community-lede { margin: 8px 0 0; max-width: 46ch; color: var(--bookedz-muted); }
.community-hero-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.community-hero-actions .btn { min-height: 44px; }
.community-tools { display: grid; gap: 12px; margin-bottom: 18px; }
.community-filters { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.community-filters::-webkit-scrollbar { display: none; }
.community-filter { flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 6px 14px; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-size: .88rem; transition: background-color var(--bookedz-motion-fast) var(--bookedz-ease), color var(--bookedz-motion-fast) var(--bookedz-ease); }
.community-filter span { padding: 0 6px; border-radius: 99px; background: var(--bookedz-hover); font-size: .75rem; }
.community-filter[aria-pressed='true'] { background: var(--bookedz-ink); border-color: var(--bookedz-ink); color: var(--bookedz-surface); }
.community-filter[aria-pressed='true'] span { background: color-mix(in srgb, var(--bookedz-surface) 20%, transparent); }
.community-search { min-height: 44px; }
.community-feed { display: grid; gap: 18px; }
.community-section-title { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font: 900 1.15rem var(--bookedz-heading); }
.community-count { padding: 0 8px; border-radius: 99px; background: var(--bookedz-fill); color: var(--bookedz-on-fill); font-size: .8rem; }
.community-notices { display: grid; gap: 8px; margin-bottom: 18px; }
.community-notice { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin: 0; padding: 10px 14px; border: 2px dashed var(--bookedz-control-border); border-radius: 16px; background: var(--bookedz-surface); }
.community-invites { margin-bottom: 22px; padding: 16px; border: 2px solid var(--bookedz-ink); border-radius: 24px; background: color-mix(in srgb, var(--bookedz-pink) 12%, var(--bookedz-surface)); box-shadow: 6px 6px 0 var(--bookedz-pink); }
:global(:root[data-theme="dark"]) .community-invites { border-color: var(--bookedz-border); }
.community-invite-list { display: grid; gap: 8px; }
.community-invite { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: 16px; background: var(--bookedz-surface); }
.community-invite-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.community-invite-actions .btn { min-height: 40px; }
.min-w-0 { min-width: 0; overflow-wrap: anywhere; }
.community-mine { margin-bottom: 22px; }
.community-mine-list { display: flex; gap: 12px; overflow-x: auto; padding: 4px 4px 10px; scroll-snap-type: x proximity; }
.community-mine-list li { flex: 0 0 min(240px, 78vw); scroll-snap-align: start; }
.community-tile { display: grid; gap: 4px; height: 100%; padding: 12px 14px; border: 2px solid var(--bookedz-ink); border-radius: 20px; background: var(--bookedz-surface); color: var(--bookedz-ink); text-decoration: none; box-shadow: 4px 4px 0 var(--bookedz-mango); transition: transform var(--bookedz-motion-normal) var(--bookedz-ease); }
:global(:root[data-theme="dark"]) .community-tile { border-color: var(--bookedz-border); }
.community-tile:hover { color: var(--bookedz-ink); transform: translate(-1px, -2px); }
.community-tile.is-alert { box-shadow: 4px 4px 0 var(--bookedz-fill); }
.community-tile-when { justify-self: start; padding: 1px 8px; border-radius: 99px; background: var(--bookedz-mango-soft); font-size: .72rem; font-weight: 800; }
.community-tile-title { font-family: var(--bookedz-heading); overflow-wrap: anywhere; }
.community-tile-meta { color: var(--bookedz-muted); font-size: .82rem; }
.community-event-tile { box-shadow: 4px 4px 0 var(--bookedz-teal); }
.community-event-tile .community-tile-title { color: var(--bookedz-ink); text-decoration: none; }
.community-event-tile .community-tile-title:hover { text-decoration: underline; }
.community-event-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.community-event-actions .btn { min-height: 36px; }
.community-tile-chip { justify-self: start; margin-top: 2px; padding: 2px 9px; border: 1.5px solid var(--bookedz-control-border); border-radius: 99px; font-size: .74rem; font-weight: 700; }
.community-tile.is-alert .community-tile-chip { border-color: var(--bookedz-fill); background: var(--bookedz-orange-soft); color: var(--bookedz-primary-dark); }
@media (prefers-reduced-motion: reduce) { .community-tile { transition: none; } .community-tile:hover { transform: none; } }
.community-empty { padding: 32px 20px; border: 1px dashed var(--bookedz-border); border-radius: 20px; background: var(--bookedz-surface); text-align: center; }
.community-empty p { color: var(--bookedz-muted); }
</style>
