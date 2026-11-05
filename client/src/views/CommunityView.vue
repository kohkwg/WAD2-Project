<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getEvents, getGroups } from '../utils/api.js'
import { subscribeSocialUpdates } from '../utils/profileSocial.js'
import EventTeamPanel from '../components/event-operations/EventTeamPanel.vue'
import FriendsPanel from '../components/community/FriendsPanel.vue'
import '../assets/design-baseline.css'
import GroupCard from '../components/community/GroupCard.vue'
import StartGroupDialog from '../components/community/StartGroupDialog.vue'
import SkeletonList from '../components/ui/SkeletonList.vue'
import BumpValue from '../components/ui/BumpValue.vue'
import { toast } from '../composables/useToast'
import { isOfficialEvent } from '../utils/groups.js'

// Community is Go together: people start a group for an event ("who wants to come?"),
// others join, then RSVP to the event itself. Private groups show here only for their
// members. Official events stay in Discover. Friends sit in a side panel (live mode).
const route = useRoute()
const router = useRouter()
const groups = ref([])
const events = ref([])
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

async function load() {
  error.value = ''
  try {
    const [groupList, eventList] = await Promise.all([getGroups(), getEvents()])
    groups.value = groupList
    // Groups meet at the event's venue, so online events can't have one
    events.value = eventList.filter((e) => isOfficialEvent(e) && !e.isOnline && e.status === 'published' && new Date(e.startTime) > new Date())
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
  composerFor.value = events.value.some((e) => e.id === eventId) ? eventId : ''
}
function closeComposer() {
  composerFor.value = null
  if (route.query.start) router.replace({ query: { ...route.query, start: undefined } })
}
async function onCreated(group) {
  closeComposer()
  toast(group.visibility === 'private' ? 'Your private group is ready. Share the invite link.' : 'Your group is live')
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
</script>

<template>
  <div class="container community-page">
    <header class="community-hero">
      <div class="community-hero-copy">
        <p class="community-eyebrow">Community</p>
        <h1 class="page-title m-0">Go together</h1>
        <p class="community-lede">Going to an event? Join a group heading there, or start one: public for anyone, or private with an invite link for friends.</p>
      </div>
      <div class="community-hero-actions">
        <button type="button" class="btn btn-primary" @click="openComposer()">Start a group</button>
      </div>
    </header>

    <div class="community-layout">
    <div class="community-main">
      <EventTeamPanel class="mb-4" :updates="socialUpdates" />
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
        <GroupCard v-for="group in visible" :key="group.id" :group="group" @changed="load" />
      </TransitionGroup>
      <div v-else class="community-empty" role="status">
        <h2 class="section-title">{{ query || filter !== 'all' ? 'No groups match' : 'No groups yet' }}</h2>
        <p>{{ filter === 'hosting' ? 'You aren’t hosting any groups.' : filter === 'joined' ? 'You haven’t joined any groups yet.' : 'Be the first: pick an event and ask who wants to come.' }}</p>
        <div class="d-flex flex-wrap gap-2 justify-content-center">
          <button type="button" class="btn btn-primary" @click="openComposer()">Start a group</button>
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
.community-feed { display: grid; gap: 14px; }
.community-empty { padding: 32px 20px; border: 1px dashed var(--bookedz-border); border-radius: 20px; background: var(--bookedz-surface); text-align: center; }
.community-empty p { color: var(--bookedz-muted); }
</style>
