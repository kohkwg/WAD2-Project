<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import EventArtwork from '../components/EventArtwork.vue'
import BumpValue from '../components/ui/BumpValue.vue'
import GroupPlan from '../components/groups/GroupPlan.vue'
import GroupChat from '../components/groups/GroupChat.vue'
import { getGroup, joinGroup, cancelRsvp, getRsvpsForEvent, approveRsvp, rejectRsvp } from '../utils/api.js'
import '../assets/design-baseline.css'
import { formatEventTime } from '../utils/helpers.js'
import { toast } from '../composables/useToast'

// A Go together group's own page, and where invite links (/g/<token>) land:
// the event, who's going, Join, the before/after food plan and the chat.
const route = useRoute()
const router = useRouter()
const group = ref(null)
const loading = ref(true)
const error = ref('')
const busy = ref(false)
const actionError = ref('')
const confirmLeave = ref(false)
const justJoined = ref(false)
const requests = ref([])
const copied = ref(false)
const token = computed(() => (typeof route.params.token === 'string' ? route.params.token : ''))

async function load({ quiet = false } = {}) {
  if (!quiet) loading.value = true
  error.value = ''
  try {
    group.value = await getGroup(token.value ? { token: token.value } : { id: route.params.id })
    requests.value = group.value.myStatus === 'host' && group.value.pendingCount
      ? (await getRsvpsForEvent(group.value.id)).filter((r) => r.status === 'pending')
      : []
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
watch(() => [route.params.id, route.params.token], () => load(), { immediate: true })
// Live: pick up others joining, marking times and suggesting spots every 20 s and on focus
const refresh = () => { if (!document.hidden && group.value && !busy.value) load({ quiet: true }) }
let timer
onMounted(() => { timer = setInterval(refresh, 20000); window.addEventListener('focus', refresh) })
onBeforeUnmount(() => { clearInterval(timer); window.removeEventListener('focus', refresh) })

const event = computed(() => group.value?.event)
const isHost = computed(() => group.value?.myStatus === 'host')
const isMember = computed(() => isHost.value || group.value?.myStatus === 'confirmed')
const full = computed(() => group.value?.spotsLeft <= 0)
const people = computed(() => (group.value ? [{ ...group.value.host, host: true }, ...group.value.members] : []))
const initials = (name) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
const inviteUrl = computed(() => (group.value?.inviteToken ? `${location.origin}${router.resolve(`/g/${group.value.inviteToken}`).href}` : ''))
const eventRsvpLabel = computed(() => (event.value?.requiresApproval ? 'Request a spot' : event.value?.spotsLeft > 0 ? 'RSVP' : 'Join waitlist'))
const needsEventRsvp = computed(() => isMember.value && event.value && !group.value.myEventStatus)
const eventStatusText = { confirmed: 'going to the event', waitlisted: 'on the event’s waitlist', pending: 'waiting for the organiser to approve your RSVP', offered: 'holding an offer for the event' }

async function join() {
  busy.value = true
  actionError.value = ''
  try {
    const rsvp = await joinGroup({ id: group.value.id, token: token.value || undefined })
    justJoined.value = rsvp?.status === 'confirmed'
    toast(rsvp?.status === 'pending' ? 'Request sent to the host' : 'You joined the group')
    await load({ quiet: true })
  } catch (e) {
    actionError.value = e.message
  } finally {
    busy.value = false
  }
}
async function leave() {
  busy.value = true
  actionError.value = ''
  try {
    await cancelRsvp(group.value.myRsvpId)
    confirmLeave.value = false
    justJoined.value = false
    toast(group.value.myStatus === 'pending' ? 'Request withdrawn' : 'You left the group')
    // A private group you just left can't be opened without the link any more
    if (group.value.visibility === 'private' && !token.value) { router.replace('/community'); return }
    await load({ quiet: true })
  } catch (e) {
    actionError.value = e.message
  } finally {
    busy.value = false
  }
}
async function answer(request, approve) {
  try {
    await (approve ? approveRsvp(request.id) : rejectRsvp(request.id))
    toast(approve ? `${request.user.name} is in` : 'Request declined')
    await load({ quiet: true })
  } catch (e) {
    actionError.value = e.message
  }
}
async function copyLink() {
  try {
    await navigator.clipboard.writeText(inviteUrl.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    actionError.value = 'Couldn’t copy. Select the link and copy it yourself.'
  }
}
async function share() {
  try {
    await navigator.share({ title: `Go together: ${event.value.title}`, text: `Come with me to ${event.value.title}`, url: inviteUrl.value })
  } catch { /* closed the share sheet */ }
}
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
</script>

<template>
  <div class="container group-page">
    <RouterLink to="/community" class="group-back">&larr; Go together</RouterLink>

    <div v-if="loading" class="group-loading" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Loading the group…</div>
    <div v-else-if="error" class="group-empty" role="alert">
      <h1 class="section-title">Can’t open this group</h1>
      <p>{{ error }}</p>
      <RouterLink to="/community" class="btn btn-outline-secondary">See other groups</RouterLink>
    </div>

    <template v-else-if="group">
      <header class="group-hero slide-up-in">
        <span class="group-avatar" aria-hidden="true">{{ initials(group.host.name) }}</span>
        <div class="min-w-0">
          <h1 class="page-title m-0">{{ isHost ? 'Your group' : `${group.host.name}’s group` }}</h1>
          <p class="text-meta text-secondary m-0">
            {{ group.visibility === 'private' ? 'Private · only people with the link can find it' : 'Public · listed in Community and on the event page' }}
          </p>
        </div>
        <span v-if="isHost" class="group-badge group-badge--host">Hosting</span>
        <span v-else-if="group.myStatus === 'confirmed'" class="group-badge group-badge--in">You’re in</span>
        <span v-else-if="group.myStatus === 'pending'" class="group-badge">Request sent</span>
      </header>

      <p v-if="group.viaInvite && !isMember && group.myStatus !== 'pending'" class="group-invited reveal-down">
        <strong>You’re invited.</strong> {{ group.host.name }} wants you to come along to {{ event?.title || 'this event' }}.
      </p>
      <p v-if="group.note" class="group-note">“{{ group.note }}”</p>

      <RouterLink v-if="event" :to="`/events/${event.id}/rsvp`" class="group-event cat-tint lift-on-hover" :class="`cat-${event.category}`">
        <span class="group-event-art" aria-hidden="true"><EventArtwork :category="event.category" /></span>
        <span class="group-event-copy">
          <strong>{{ event.title }}</strong>
          <span class="text-meta">{{ formatEventTime(event) }}</span>
          <span class="text-meta">{{ event.venue?.name || 'Venue to be announced' }}</span>
        </span>
        <span class="group-event-go" aria-hidden="true">›</span>
      </RouterLink>

      <section class="group-card" aria-labelledby="group-people-title">
        <div class="group-people-head">
          <h2 id="group-people-title" class="section-title m-0"><BumpValue :value="people.length" /> going</h2>
          <span class="text-meta text-secondary">{{ full ? 'Full' : `${group.spotsLeft} ${group.spotsLeft === 1 ? 'spot' : 'spots'} left` }}</span>
        </div>
        <TransitionGroup tag="ul" name="person-in" class="list-unstyled m-0 group-people">
          <li v-for="person in people" :key="person.id" class="group-person">
            <span class="group-mini" aria-hidden="true">{{ initials(person.name) }}</span>
            <span>{{ person.name }}<span v-if="person.host" class="text-caption text-secondary"> · host</span></span>
          </li>
        </TransitionGroup>

        <ul v-if="requests.length" class="list-unstyled m-0 group-requests" aria-label="Requests to join">
          <li v-for="request in requests" :key="request.id" class="group-request">
            <span><strong>{{ request.user.name }}</strong> asked to join</span>
            <span class="d-flex gap-2">
              <button type="button" class="btn btn-primary btn-sm" @click="answer(request, true)">Accept</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="answer(request, false)">Decline</button>
            </span>
          </li>
        </ul>

        <div class="group-actions">
          <template v-if="isHost" />
          <template v-else-if="group.myStatus">
            <template v-if="confirmLeave">
              <button type="button" class="btn btn-outline-danger" :disabled="busy" @click="leave">{{ group.myStatus === 'pending' ? 'Withdraw request' : 'Leave group' }}</button>
              <button type="button" class="btn btn-outline-secondary" @click="confirmLeave = false">Stay</button>
            </template>
            <button v-else type="button" class="btn btn-outline-secondary" @click="confirmLeave = true">{{ group.myStatus === 'pending' ? 'Withdraw request' : 'Leave group' }}</button>
          </template>
          <button v-else type="button" class="btn btn-primary" :disabled="busy || full" @click="join">
            {{ busy ? 'Joining…' : full ? 'Full' : group.joinMode === 'approval' ? 'Ask to join' : 'Join group' }}
          </button>
        </div>

        <div v-if="needsEventRsvp" class="group-rsvp-prompt" :class="{ 'reveal-down': justJoined }">
          <p class="m-0"><strong>{{ justJoined ? 'You’re in the group.' : 'One more step.' }}</strong> RSVP to {{ event.title }} so you have a spot at the event too.</p>
          <RouterLink :to="{ path: `/events/${event.id}/rsvp`, hash: event.spotsLeft > 0 || event.requiresApproval ? '#rsvp' : '#waitlist' }" class="btn btn-primary btn-sm">{{ eventRsvpLabel }}</RouterLink>
        </div>
        <p v-else-if="isMember && group.myEventStatus" class="group-rsvp-done text-meta">You’re {{ eventStatusText[group.myEventStatus] }}.</p>
        <p v-if="actionError" class="group-error" role="alert">{{ actionError }}</p>
      </section>

      <section v-if="inviteUrl" class="group-card" aria-labelledby="group-share-title">
        <h2 id="group-share-title" class="section-title m-0">Invite friends</h2>
        <p class="text-meta text-secondary m-0">{{ group.visibility === 'private' ? 'Only people with this link can see and join the group.' : 'Send this link to friends; the group is also listed publicly.' }}</p>
        <div class="group-share">
          <label class="visually-hidden" for="group-invite-link">Invite link</label>
          <input id="group-invite-link" class="form-control" :value="inviteUrl" readonly @focus="$event.target.select()" />
          <button type="button" class="btn btn-primary" @click="copyLink"><Transition name="list-fade" mode="out-in"><span :key="copied">{{ copied ? 'Copied ✓' : 'Copy link' }}</span></Transition></button>
          <button v-if="canShare" type="button" class="btn btn-outline-secondary" @click="share">Share</button>
        </div>
      </section>

      <section v-if="isMember && group.plan" class="group-card">
        <GroupPlan :group="group" @update:plan="group.plan = $event" />
      </section>
      <section v-else class="group-card group-teaser">
        <h2 class="section-title m-0">Before and after</h2>
        <p class="text-meta text-secondary m-0">Members plan food before or after the event, with deals nearby. Join the group to see and add ideas.</p>
      </section>

      <section class="group-card">
        <GroupChat :key="group.id" :group-id="group.id" :can-post="isMember" @changed="load({ quiet: true })" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.group-page { max-width: 820px; padding-block: 1.25rem 3rem; display: grid; gap: 16px; }
.group-back { justify-self: start; color: var(--bookedz-muted); text-decoration: none; font-weight: 600; }
.group-back:hover { color: var(--bookedz-ink); }
.group-loading { display: flex; align-items: center; gap: 10px; padding: 40px 0; color: var(--bookedz-muted); }
.group-empty { padding: 32px 20px; border: 1px dashed var(--bookedz-border); border-radius: 20px; background: var(--bookedz-surface); text-align: center; }
.group-empty p { color: var(--bookedz-muted); }
.group-hero { display: flex; align-items: center; gap: 14px; }
.min-w-0 { min-width: 0; flex: 1; }
.group-avatar,.group-mini { display: inline-grid; place-items: center; flex: none; border-radius: 50%; background: var(--bookedz-orange-soft); color: var(--bookedz-primary-dark); font-weight: 700; }
.group-avatar { width: 56px; height: 56px; font-size: 1.1rem; }
.group-mini { width: 32px; height: 32px; font-size: .75rem; }
.group-badge { flex: none; padding: 3px 10px; border-radius: 99px; background: var(--bookedz-hover); color: var(--bookedz-muted); font-size: var(--text-caption); font-weight: 700; }
.group-badge--host { background: var(--bookedz-mango-soft); color: var(--bookedz-ink); }
.group-badge--in { background: var(--bookedz-teal-soft); color: var(--bookedz-teal-ink); }
.group-invited { margin: 0; padding: 12px 14px; border-radius: 14px; background: var(--bookedz-teal-soft); }
.group-note { margin: 0; font-size: 1.05rem; line-height: 1.55; overflow-wrap: anywhere; }
.group-event { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px; border-radius: 16px; color: var(--bookedz-ink); text-decoration: none; }
.group-event:hover { color: var(--bookedz-ink); }
.group-event-art { width: 64px; height: 64px; overflow: hidden; border-radius: 12px; background: var(--bookedz-surface); }
.group-event-art :deep(svg) { width: 100%; height: 100%; }
.group-event-copy { display: grid; gap: 1px; min-width: 0; overflow-wrap: anywhere; }
.group-event-go { font-size: 1.5rem; color: var(--bookedz-primary-dark); }
.group-card { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--bookedz-border); border-radius: 20px; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.group-people-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.group-people { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.group-person { display: flex; align-items: center; gap: 8px; }
.person-in-enter-active { transition: opacity var(--bookedz-motion-normal) var(--bookedz-ease), transform var(--bookedz-motion-slip, .25s) var(--bookedz-ease-stamp, ease-out); }
.person-in-enter-from { opacity: 0; transform: scale(.6); }
.person-in-leave-active { transition: opacity var(--bookedz-motion-fast) var(--bookedz-ease); }
.person-in-leave-to { opacity: 0; }
.person-in-move { transition: transform var(--bookedz-motion-normal) var(--bookedz-ease); }
.group-card { animation: stagger-rise var(--bookedz-motion-reveal, .42s) var(--bookedz-ease) both; }
.group-card:nth-of-type(2) { animation-delay: 60ms; } .group-card:nth-of-type(3) { animation-delay: 120ms; } .group-card:nth-of-type(4) { animation-delay: 180ms; } .group-card:nth-of-type(5) { animation-delay: 240ms; }
@media (prefers-reduced-motion: reduce) { .person-in-enter-active, .person-in-leave-active, .person-in-move { transition: none; } .group-card { animation: none; } }
.group-requests { display: grid; gap: 8px; }
.group-request { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 12px; background: var(--bookedz-hover); }
.group-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.group-actions:empty { display: none; }
.group-actions .btn { min-height: 44px; }
.group-rsvp-prompt { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--bookedz-teal-soft); }
.group-rsvp-prompt .btn { min-height: 40px; }
.group-rsvp-done { margin: 0; color: var(--bookedz-teal-ink); }
.group-error { margin: 0; color: var(--bookedz-danger); font-size: .9rem; }
.group-share { display: flex; flex-wrap: wrap; gap: 8px; }
.group-share .form-control { flex: 1 1 240px; min-height: 44px; font-size: .9rem; }
.group-share .btn { min-height: 44px; }
.group-teaser { border-style: dashed; box-shadow: none; }
@media (max-width: 575px) { .group-hero { flex-wrap: wrap; } }
</style>
