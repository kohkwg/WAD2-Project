<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EventArtwork from '../EventArtwork.vue'
import { getMyEventTeams } from '../../utils/eventTeam.js'
import { USING_SUPABASE, getGroups, getGroupInvites, respondGroupInvite, getOrganiserEvents } from '@/utils/api'
import { getFriends, respondToRequest } from '@/utils/profileFriends'
import { toast } from '@/composables/useToast'
import { formatEventTime } from '@/utils/helpers'
import { groupRsvps, directionsUrl, eventEnded } from '@/utils/rsvpOverview'
import { organiserEventState } from '@/utils/organiserEvents'
import { countdownLabel, isOfficialEvent } from '@/utils/groups'
import { useMyDino } from '@/lib/myDino'

// The signed-in home. LandingView owns the account and passes down what it already loaded;
// everything else (groups, invites, friends, events you run) loads here and fails on its own,
// so one slow or missing source never blanks the dashboard.
const props = defineProps({
  session: { type: Object, required: true },
  profile: { type: Object, default: null },
  rsvps: { type: Array, default: () => [] },
  saved: { type: Array, default: () => [] },
  loadError: { type: String, default: '' },
  justJoined: Boolean,
})
const emit = defineEmits(['refresh'])

const { mySrc: myDinoSrc } = useMyDino()
const now = ref(Date.now())
const groups = ref([])
const invites = ref([])
const friends = ref({ friends: [], incoming: [], outgoing: [] })
const hosted = ref([])
const extrasLoading = ref(true)
const extrasFailed = ref(false)
const teamInvites = ref([])
let active = true, request = 0, timer

async function loadExtras() {
  const ticket = ++request
  extrasLoading.value = true
  const results = await Promise.allSettled([
    getGroups(), getGroupInvites(), getFriends(), getOrganiserEvents(),
    USING_SUPABASE ? getMyEventTeams() : Promise.resolve({ invitations: [] }),
  ])
  if (!active || ticket !== request) return
  const [g, i, f, h, t] = results
  if (g.status === 'fulfilled') groups.value = g.value
  if (i.status === 'fulfilled') invites.value = i.value
  if (f.status === 'fulfilled') friends.value = f.value
  if (h.status === 'fulfilled') hosted.value = h.value.filter(isOfficialEvent)
  if (t.status === 'fulfilled') teamInvites.value = t.value.invitations || []
  extrasFailed.value = results.some(result => result.status === 'rejected')
  extrasLoading.value = false
}
function refreshDashboard() {
  if (!active || document.hidden || extrasLoading.value) return
  now.value = Date.now()
  emit('refresh')
  loadExtras()
}
onMounted(() => {
  loadExtras()
  timer = setInterval(() => { now.value = Date.now() }, 60_000)
  window.addEventListener('focus', refreshDashboard)
})
onBeforeUnmount(() => { active = false; request++; clearInterval(timer); window.removeEventListener('focus', refreshDashboard) })

const name = computed(() => props.profile?.name || props.session.email?.split('@')[0] || 'there')
const firstName = computed(() => name.value.split(/\s+/)[0])
const initials = computed(() => name.value.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase())
const greeting = computed(() => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
})

const grouped = computed(() => groupRsvps(props.rsvps, now.value))
const upcoming = computed(() => grouped.value.upcoming)
const offers = computed(() => upcoming.value.filter((r) => r.status === 'offered'))
// Events you're going to (accepted RSVPs), soonest first; each carries your group for it, if any
const plans = computed(() => upcoming.value
  .filter((r) => r.status === 'confirmed')
  .map((row) => ({ row, group: myGroups.value.find((g) => (g.eventId || g.event?.id) === row.event.id) || null })))
const savedPreview = computed(() => props.saved
  .filter(event => !['cancelled', 'completed', 'draft'].includes(event.status) && !eventEnded(event, now.value))
  .sort((a, b) => (Date.parse(a.startTime) - Date.parse(b.startTime)) || String(a.id).localeCompare(String(b.id)))
  .slice(0, 3))
const countdown = (event) => (Number.isFinite(Date.parse(event.startTime)) ? countdownLabel(event.startTime, new Date(now.value)) : '')

const myGroups = computed(() => groups.value
  .filter((g) => ['host', 'confirmed', 'pending'].includes(g.myStatus))
  .sort((a, b) => new Date(a.startTime) - new Date(b.startTime)))
const groupRequests = computed(() => myGroups.value.reduce((sum, g) => sum + (g.myStatus === 'host' ? g.pendingCount || 0 : 0), 0))

const hostedUpcoming = computed(() => hosted.value.filter((e) => organiserEventState(e, now.value) === 'upcoming').sort((a,b) => Date.parse(a.startTime) - Date.parse(b.startTime)))
const hostedPending = computed(() => hostedUpcoming.value.reduce((sum, e) => sum + (e.pendingCount || 0), 0))
const hostedDrafts = computed(() => hosted.value.filter((e) => organiserEventState(e, now.value) === 'drafts').length)

// "Needs you": the things waiting on a decision. Friend requests and group invites are answered
// right here; the rest link to where they're settled.
const busy = ref('')
const personName = (person) => person.displayName || `@${person.username}`
const attention = computed(() => {
  const items = []
  if (offers.value.length) items.push({ key: 'offer', tone: 'urgent', to: '/my-rsvps', text: `A spot opened up for ${offers.value[0].event.title}`, hint: 'Confirm it before it goes to the next person' })
  if (teamInvites.value.length) items.push({ key: 'team', to: '/organiser/events', text: `${teamInvites.value.length} co-organiser ${teamInvites.value.length === 1 ? 'invitation' : 'invitations'}`, hint: 'Review your event team invitations' })
  for (const invite of invites.value) {
    const title = invite.group.event?.title || 'an event'
    items.push({ key: `invite-${invite.id}`, text: `${invite.from.name} invited you to go to ${title}`, hint: 'Accepting RSVPs you to the event too', respond: (accept) => respondGroupInvite(invite.id, accept), accepted: `You’re in for ${title}.`, declined: 'Invite declined.', done: () => { invites.value = invites.value.filter((i) => i.id !== invite.id) }, reload: true, name: title })
  }
  for (const person of friends.value.incoming) {
    items.push({ key: `friend-${person.id}`, text: `${personName(person)} sent you a friend request`, hint: person.displayName ? `@${person.username}` : 'Friend request', respond: (accept) => respondToRequest(person.id, accept), accepted: `You and ${personName(person)} are now friends.`, declined: `Friend request from ${personName(person)} declined.`, done: (accept) => { friends.value = { ...friends.value, incoming: friends.value.incoming.filter((p) => p.id !== person.id), friends: accept ? [...friends.value.friends, person] : friends.value.friends } }, name: personName(person) })
  }
  if (groupRequests.value) items.push({ key: 'requests', to: '/community', text: `${groupRequests.value} ${groupRequests.value === 1 ? 'person wants' : 'people want'} to join your groups`, hint: 'Approve or decline' })
  if (hostedPending.value) items.push({ key: 'approvals', to: '/organiser/events', text: `${hostedPending.value} ${hostedPending.value === 1 ? 'RSVP needs' : 'RSVPs need'} your approval`, hint: 'On the events you run' })
  return items
})
async function answer(item, accept) {
  if (busy.value) return
  busy.value = item.key
  try {
    await item.respond(accept)
    item.done(accept)
    toast(accept ? item.accepted : item.declined)
    // Joining a group RSVPs you to its event, so the plans and groups need a fresh look
    if (accept && item.reload) { emit('refresh'); loadExtras() }
  } catch (error) {
    toast(error.message || 'That didn’t go through. Please try again.', { tone: 'error' })
  } finally {
    busy.value = ''
  }
}

// Sideways list of the events you're going to
const track = ref(null)
function slide(direction) {
  const el = track.value
  if (!el) return
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollBy({ left: direction * Math.max(el.clientWidth * .8, 240), behavior: reduce ? 'auto' : 'smooth' })
}

const groupTitle = (g) => g.event?.title || 'Group'
</script>

<template>
  <section class="dash" aria-labelledby="dash-title">
    <header class="dash-hero">
      <span class="dash-avatar-wrap" :class="{ celebrate: justJoined }" aria-hidden="true">
        <span class="dash-avatar"><img v-if="myDinoSrc" class="dino-face" :src="myDinoSrc" alt="">{{ myDinoSrc ? '' : initials }}</span>
        <span v-if="justJoined" class="dash-burst"><span v-for="n in 8" :key="n" :style="{ '--burst-angle': `${n * 45}deg` }">✦</span></span>
      </span>
      <div class="dash-hero-copy">
        <p class="dash-greeting">{{ greeting }},</p>
        <h1 id="dash-title" class="page-title m-0">{{ firstName }}</h1>
      </div>
      <div class="dash-hero-actions">
        <RouterLink to="/discover" class="btn btn-primary">Discover events</RouterLink>
        <RouterLink v-if="USING_SUPABASE" to="/organiser/events/new" class="btn btn-outline-secondary">Create an event</RouterLink>
      </div>
    </header>

    <p v-if="!USING_SUPABASE" class="dash-demo">
      <strong>Demo mode.</strong> You’re signed in as the sample account {{ name }}. Everything is stored in this browser only;
      use <em>Reset demo data</em> in the top bar to start over.
    </p>
    <p v-dismissible v-if="loadError" class="alert alert-warning m-0" role="alert">{{ loadError }} <button type="button" class="btn btn-outline-secondary btn-sm ms-2" @click="$emit('refresh')">Retry account data</button></p>
    <p v-dismissible v-if="extrasFailed" class="alert alert-warning m-0" role="alert">Some dashboard updates couldn’t load. <button type="button" class="btn btn-outline-secondary btn-sm ms-2" :disabled="extrasLoading" @click="refreshDashboard">Retry updates</button></p>

    <section v-if="attention.length" class="dash-attention" aria-labelledby="attention-title">
      <h2 id="attention-title" class="dash-section-title">Needs you <span class="dash-count">{{ attention.length }}</span></h2>
      <ul class="list-unstyled m-0 dash-attention-list">
        <li v-for="item in attention" :key="item.key">
          <RouterLink v-if="item.to" :to="item.to" class="dash-attention-item" :class="{ 'is-urgent': item.tone === 'urgent' }">
            <strong>{{ item.text }}</strong>
            <span>{{ item.hint }}</span>
          </RouterLink>
          <div v-else class="dash-attention-item">
            <strong>{{ item.text }}</strong>
            <span>{{ item.hint }}</span>
            <div class="dash-attention-actions">
              <button type="button" class="btn btn-primary btn-sm" :disabled="!!busy" :aria-label="`Accept ${item.name}`" @click="answer(item, true)">{{ busy === item.key ? 'Saving…' : 'Accept' }}</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!!busy" :aria-label="`Decline ${item.name}`" @click="answer(item, false)">Decline</button>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <section class="dash-card dash-next" aria-labelledby="next-plan-title">
      <div class="dash-next-head">
        <h2 id="next-plan-title" class="dash-section-title m-0">{{ plans.length > 1 ? 'Your plans' : 'Your next plan' }}</h2>
        <div v-if="plans.length > 1" class="dash-carousel-nav">
          <button type="button" class="btn btn-outline-secondary btn-sm" aria-label="Earlier plans" @click="slide(-1)">←</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" aria-label="Later plans" @click="slide(1)">→</button>
        </div>
      </div>
      <ul v-if="plans.length" ref="track" class="list-unstyled m-0 dash-carousel" tabindex="0" aria-label="Events you’re going to">
        <li v-for="({ row, group }, index) in plans" :key="row.id" class="dash-slide">
          <div class="dash-next-art" aria-hidden="true"><EventArtwork :category="row.event.tags?.[0] || ''" /></div>
          <div class="dash-next-copy">
            <p v-if="countdown(row.event)" class="dash-countdown">{{ index === 0 ? 'Next up · ' : '' }}{{ countdown(row.event) }}</p>
            <p class="dash-next-title">{{ row.event.title }}</p>
            <p class="text-meta m-0">{{ formatEventTime(row.event) }}</p>
            <p class="text-meta m-0">{{ row.event.venue?.name || 'Venue to be announced' }}</p>
            <RouterLink v-if="group" :to="`/groups/${group.id}`" class="dash-slide-group">
              <span><strong>{{ group.myStatus === 'host' ? 'Your group' : 'Going with a group' }}</strong> · {{ 1 + (group.members?.length || 0) }} going</span>
              <span aria-hidden="true">↗</span>
            </RouterLink>
            <div class="dash-actions">
              <RouterLink v-if="USING_SUPABASE" :to="`/events/${row.event.id}/ticket`" class="btn btn-primary btn-sm">View ticket</RouterLink>
              <RouterLink :to="`/events/${row.event.id}/rsvp`" class="btn btn-outline-secondary btn-sm">View event</RouterLink>
              <a v-if="directionsUrl(row.event)" :href="directionsUrl(row.event)" target="_blank" rel="noopener noreferrer" class="btn btn-outline-secondary btn-sm">Directions ↗</a>
            </div>
          </div>
        </li>
      </ul>
      <template v-else>
        <p class="text-meta m-0">Nothing confirmed yet. Find something to do this week.</p>
        <div class="dash-actions"><RouterLink to="/discover" class="btn btn-primary btn-sm">Explore events</RouterLink></div>
      </template>
    </section>

    <div class="dash-grid">
      <section v-if="extrasLoading || myGroups.length" class="dash-card" aria-labelledby="groups-title">
        <h2 id="groups-title" class="dash-section-title">Your groups</h2>
        <p v-if="extrasLoading" class="text-meta m-0" role="status">Loading…</p>
        <ul v-else-if="myGroups.length" class="list-unstyled m-0 dash-list">
          <li v-for="g in myGroups.slice(0, 3)" :key="g.id">
            <RouterLink :to="`/groups/${g.id}`" class="dash-row">
              <span class="dash-row-main"><strong>{{ groupTitle(g) }}</strong><span class="text-meta">{{ countdownLabel(g.startTime) }} · {{ 1 + (g.members?.length || 0) }} going</span></span>
              <span class="dash-chip">{{ g.myStatus === 'host' ? 'Hosting' : g.myStatus === 'pending' ? 'Requested' : 'In' }}</span>
            </RouterLink>
          </li>
        </ul>
        <p v-else class="text-meta m-0">Going to an event? Start a group and find people to go with.</p>
        <div class="dash-actions"><RouterLink to="/community" class="btn btn-outline-secondary btn-sm">{{ myGroups.length ? 'Open Community' : 'Find a group' }}</RouterLink></div>
      </section>

      <section v-if="extrasLoading || hostedUpcoming.length || hostedDrafts" class="dash-card" aria-labelledby="hosting-title">
        <h2 id="hosting-title" class="dash-section-title">Events you run</h2>
        <p v-if="extrasLoading" class="text-meta m-0" role="status">Loading…</p>
        <ul v-else-if="hostedUpcoming.length" class="list-unstyled m-0 dash-list">
          <li v-for="event in hostedUpcoming.slice(0, 3)" :key="event.id">
            <RouterLink :to="`/organiser/events/${event.id}/manage`" class="dash-row">
              <span class="dash-row-main"><strong>{{ event.title }}</strong><span class="text-meta">{{ formatEventTime(event) }}</span></span>
              <span v-if="event.pendingCount" class="dash-chip is-pending">{{ event.pendingCount }} to review</span>
            </RouterLink>
          </li>
        </ul>
        <p v-else class="text-meta m-0">{{ hostedDrafts ? `${hostedDrafts} ${hostedDrafts === 1 ? 'draft' : 'drafts'} waiting to be published.` : 'Run something of your own and manage it from here.' }}</p>
        <div class="dash-actions">
          <RouterLink to="/organiser/events" class="btn btn-outline-secondary btn-sm">Organise</RouterLink>
          <RouterLink v-if="USING_SUPABASE && !hostedUpcoming.length" to="/organiser/events/new" class="btn btn-primary btn-sm">Create an event</RouterLink>
        </div>
      </section>

      <section v-if="saved.length" class="dash-card dash-saved" aria-labelledby="saved-title">
        <h2 id="saved-title" class="dash-section-title">Saved for later</h2>
        <p class="text-meta m-0">A few possibilities for your next good day.</p>
        <ul v-if="savedPreview.length" class="list-unstyled m-0 dash-list">
          <li v-for="event in savedPreview" :key="event.id"><RouterLink :to="`/events/${event.id}/rsvp`" class="dash-row"><span class="dash-saved-art" aria-hidden="true"><EventArtwork :category="event.tags?.[0] || ''" /></span><span class="dash-row-main"><strong>{{ event.title }}</strong><span class="text-meta">{{ formatEventTime(event) }}</span></span><span aria-hidden="true">↗</span></RouterLink></li>
        </ul>
        <p v-else class="text-meta m-0">Your saved events have ended. Find something new to look forward to.</p>
        <div class="dash-actions"><RouterLink to="/my-rsvps?tab=saved" class="btn btn-outline-secondary btn-sm">View all saved events</RouterLink></div>
      </section>
    </div>


  </section>
</template>

<style scoped>
/* Same festival-ticket look as Plans and Community: ink outline, hard shadow, pill buttons */
.dash { width: 100%; max-width: none; margin: 0 auto; display: grid; gap: 22px; --db-r: 24px; }
.dash-hero { position: relative; overflow: hidden; display: flex; align-items: center; flex-wrap: wrap; gap: 18px; padding: clamp(1.4rem, 4vw, 2.2rem); border: 2px solid var(--bookedz-ink); border-radius: var(--db-r); background: linear-gradient(120deg, var(--bookedz-orange-soft), var(--bookedz-mango-soft) 70%); box-shadow: 6px 6px 0 var(--bookedz-ink); }
.dash-hero::after { content: '★'; position: absolute; right: 38%; top: 50%; translate: 0 -50%; rotate: 12deg; font-size: clamp(4rem, 11vw, 7rem); line-height: 1; color: var(--bookedz-fill); opacity: .35; pointer-events: none; }
.dash-hero > * { position: relative; z-index: 1; }
.dash-hero-copy { flex: 1 1 220px; min-width: 0; }
.dash-hero-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.dash-avatar { overflow: hidden; display: grid; place-items: center; flex: none; width: 88px; height: 88px; border: 2px solid var(--bookedz-ink); border-radius: 50%; background: var(--bookedz-surface); color: var(--bookedz-primary-dark); font: 700 1.5rem var(--bookedz-heading); animation: pop-once var(--bookedz-motion-slip) var(--bookedz-ease-stamp); }
.dino-face { width: 100%; height: 100%; object-fit: contain; }
/* A dino shows whole, not cropped to the circle */
.dash-avatar:has(.dino-face) { overflow: visible; border-color: transparent; background: none; }
.dash-avatar-wrap { position: relative; flex: none; display: grid; place-items: center; }
.celebrate .dash-avatar { animation: avatar-hop 900ms var(--bookedz-ease-stamp) both; }
.dash-burst { position: absolute; inset: 50% auto auto 50%; pointer-events: none; }
.dash-burst span { position: absolute; left: -.5em; top: -.5em; width: 1em; text-align: center; color: var(--bookedz-primary); font-size: .95rem; opacity: 0; animation: avatar-burst 900ms var(--bookedz-ease) 180ms both; }
.dash-burst span:nth-child(even) { color: var(--bookedz-yellow); font-size: .75rem; }
@keyframes avatar-hop { 0% { transform: translateY(24px) scale(.4); } 45% { transform: translateY(-14px) scale(1.12); } 70% { transform: translateY(0) scale(.95); } 100% { transform: none; } }
@keyframes avatar-burst { 0% { opacity: 1; transform: rotate(var(--burst-angle)) translateY(-18px) scale(.4); } 100% { opacity: 0; transform: rotate(var(--burst-angle)) translateY(-56px) scale(1); } }
.dash-greeting { margin: 0; color: var(--bookedz-ink); font-weight: 500; }
.dash-hero h1 { font-size: clamp(2.1rem, 5vw, 3.2rem); font-weight: 900; letter-spacing: -.03em; overflow-wrap: anywhere; background: linear-gradient(90deg, var(--bookedz-ink) 55%, var(--bookedz-primary-dark)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.dash-demo { margin: 0; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--bookedz-yellow) 60%, var(--bookedz-border)); border-radius: 14px; background: color-mix(in srgb, var(--bookedz-yellow) 18%, var(--bookedz-surface)); font-size: .95rem; }

.dash-section-title { margin: 0 0 6px; font: 900 1.25rem var(--bookedz-heading); }
.dash-count { display: inline-grid; place-items: center; min-width: 1.6em; padding: 0 .45em; border-radius: 99px; background: var(--bookedz-fill); color: var(--bookedz-on-fill); font-size: .8rem; vertical-align: middle; }

.dash-attention-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.dash-attention-item { display: grid; gap: 2px; height: 100%; padding: 14px 16px; border: 2px solid var(--bookedz-ink); border-radius: 18px; background: var(--bookedz-surface); box-shadow: 4px 4px 0 var(--bookedz-pink); color: var(--bookedz-ink); text-decoration: none; transition: transform var(--bookedz-motion-normal) var(--bookedz-ease); }
.dash-attention-item.is-urgent { background: color-mix(in srgb, var(--bookedz-yellow) 30%, var(--bookedz-surface)); box-shadow: 4px 4px 0 var(--bookedz-mango); }
.dash-attention-item span { color: var(--bookedz-muted); font-size: var(--text-small); }
.dash-attention-item:hover { color: var(--bookedz-ink); }
.dash-attention-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.dash-attention-actions .btn { min-height: 40px; border-width: 2px; border-radius: 99px; }

.dash-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; }
.dash-card { display: grid; align-content: start; gap: 8px; padding: 20px; border: 2px solid var(--bookedz-ink); border-radius: var(--db-r); background: var(--bookedz-surface); box-shadow: 6px 6px 0 var(--bookedz-teal); }
.dash-next { box-shadow: 6px 6px 0 var(--bookedz-mango); }
.dash-next-title { margin: 0; font: 700 1.15rem var(--bookedz-heading); overflow-wrap: anywhere; }
.dash-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; }
.dash-actions .btn, .dash-hero-actions .btn { min-height: 44px; border-width: 2px; border-radius: 99px; }
.dash-actions .btn-sm { min-height: 40px; }
.btn-primary { border-color: var(--bookedz-ink); }

.dash-list { display: grid; gap: 8px; }
.dash-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 44px; padding: 8px 12px; border: 2px solid var(--bookedz-control-border); border-radius: 14px; color: var(--bookedz-ink); text-decoration: none; transition: background-color var(--bookedz-motion-fast) var(--bookedz-ease); }
.dash-row:hover { background: var(--bookedz-hover); color: var(--bookedz-ink); }
.dash-row-main { display: grid; min-width: 0; }
.dash-row-main strong { overflow-wrap: anywhere; }
.dash-chip { flex: none; padding: 3px 10px; border-radius: 99px; background: var(--bookedz-orange-soft); color: var(--bookedz-ink); font-size: .8rem; font-weight: 700; }
.dash-chip.is-confirmed { background: color-mix(in srgb, var(--bookedz-success) 14%, var(--bookedz-surface)); color: var(--bookedz-success); }
.dash-chip.is-pending, .dash-chip.is-offered { background: color-mix(in srgb, var(--bookedz-yellow) 35%, var(--bookedz-surface)); }

.dash-next-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px; }
.dash-carousel-nav { display:flex; gap:8px; }
.dash-carousel-nav .btn { min-width:44px; min-height:44px; border-width:2px; border-radius:99px; }
.dash-carousel { display:flex; gap:16px; overflow-x:auto; padding:4px 4px 12px; scroll-snap-type:x mandatory; scrollbar-width:thin; }
.dash-carousel:focus-visible { outline:3px solid var(--bookedz-focus); outline-offset:2px; border-radius:var(--db-r); }
.dash-slide { flex:0 0 min(100%, 640px); scroll-snap-align:start; display:grid; grid-template-columns:180px minmax(0,1fr); align-items:center; gap:1.5rem; padding:16px; border:2px solid var(--bookedz-control-border); border-radius:20px; }
.dash-slide-group { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:44px; padding:8px 12px; border:2px dashed var(--bookedz-control-border); border-radius:14px; background:var(--bookedz-mango-soft); color:var(--bookedz-ink); text-decoration:none; }
.dash-slide-group:hover { color:var(--bookedz-ink); background:var(--bookedz-hover); }
.dash-next-art { border-radius:18px; overflow:hidden; }
.dash-next-art :deep(svg) { display:block; width:100%; height:180px; }
.dash-next-copy { min-width:0; display:grid; gap:.5rem; }
.dash-countdown { margin:0; color:var(--bookedz-primary-dark); font-size:.8rem; font-weight:750; }
.dash-next .dash-next-title { font-size:clamp(1.3rem,2.5vw,1.8rem); }
.dash-saved-art { flex:none; width:48px; height:48px; border-radius:10px; overflow:hidden; }
.dash-saved-art :deep(svg) { width:100%; height:100%; display:block; }
.dash-saved .dash-row-main { flex:1; }


:global(:root[data-theme="dark"]) .dash-hero { border-color: var(--bookedz-fill); box-shadow: 6px 6px 0 var(--bookedz-fill); }
:global(:root[data-theme="dark"]) :is(.dash-card, .dash-attention-item) { border-color: var(--bookedz-border); }
:global(:root[data-theme="dark"]) .dash-card { box-shadow: 6px 6px 0 color-mix(in srgb, var(--bookedz-teal) 60%, transparent); }
:global(:root[data-theme="dark"]) .dash-next { box-shadow: 6px 6px 0 color-mix(in srgb, var(--bookedz-mango) 60%, transparent); }
:global(:root[data-theme="dark"]) .dash-attention-item { box-shadow: 4px 4px 0 color-mix(in srgb, var(--bookedz-pink) 55%, transparent); }
:global(:root[data-theme="dark"]) .btn-primary { border-color: var(--bookedz-fill); }
:global(:root[data-theme="dark"]) .dash-hero .dash-greeting { color: var(--bookedz-ink); }

@media (hover: hover) {
  .dash-attention-item:hover { transform: translate(-2px, -3px) rotate(-.4deg); }
  .dash .btn:not(:disabled):hover { transform: translateY(-2px) rotate(-.6deg); }
}
@media (max-width: 767.98px) {
  .dash-grid { grid-template-columns: 1fr; gap: 18px; }
  .dash-hero { box-shadow: 4px 4px 0 var(--bookedz-ink); }
  .dash-hero::after { right: 1rem; top: 1.6rem; translate: 0; font-size: 4rem; }
}
@media (max-width: 575px) { .dash-slide { grid-template-columns:1fr; gap:14px; } .dash-next-art { max-width:160px; } .dash-next-art :deep(svg) { height:130px; } }
@media (prefers-reduced-motion: reduce) {
  .dash-avatar, .celebrate .dash-avatar { animation: none; }
  .dash-burst { display: none; }
  .dash .btn:not(:disabled):hover, .dash-attention-item:hover { transform: none; }
  .dash-carousel { scroll-behavior: auto; }
}
</style>
