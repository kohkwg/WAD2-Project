<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { requireCommunityAccount } from '../utils/communityAccount.js'
import EventArtwork from '../components/EventArtwork.vue'
import BumpValue from '../components/ui/BumpValue.vue'
import GroupPlan from '../components/groups/GroupPlan.vue'
import GroupChat from '../components/groups/GroupChat.vue'
import { getCurrentUser, getGroup, joinGroup, cancelRsvp, approveRsvp, rejectRsvp, respondGroupInvite, updateGroupSettings, deleteGroup } from '../utils/api.js'
import { CAPACITY_RANGE, JOIN_MESSAGE_LIMIT, NOTE_LIMIT, countdownLabel, joinModeLabel, settingsErrors, visibilityLabel } from '../utils/groups.js'
import '../assets/design-baseline.css'
import { formatEventTime } from '../utils/helpers.js'
import { toast } from '../composables/useToast'

// A Go together group's own page, and where invite links (/g/<token>) land: a sticky bar
// with the main action (join, ask with a message, accept an invite, leave, settings), the
// event, who's going and requests, the invite link, the before/after plan, the chat, and
// the host's settings (visibility, who can join, spots, note, delete).
const route = useRoute()
const router = useRouter()
const signedIn = ref(false)
const group = ref(null)
const loading = ref(true)
const error = ref('')
const busy = ref(false)
const actionError = ref('')
const confirmLeave = ref(false)
const justJoined = ref(false)
const copied = ref(false)
const token = computed(() => (typeof route.params.token === 'string' ? route.params.token : ''))

async function load({ quiet = false } = {}) {
  if (!quiet) loading.value = true
  error.value = ''
  try {
    signedIn.value = Boolean(await getCurrentUser())
    group.value = await getGroup(token.value ? { token: token.value } : { id: route.params.id })
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
// Every 45 s while visible, and on returning to the tab at most every 20 s (keeps database load low)
let lastRefresh = Date.now()
const refreshOnFocus = () => { if (Date.now() - lastRefresh > 20000) { lastRefresh = Date.now(); refresh() } }
onMounted(() => { timer = setInterval(() => { lastRefresh = Date.now(); refresh() }, 45000); window.addEventListener('focus', refreshOnFocus) })
onBeforeUnmount(() => { clearInterval(timer); window.removeEventListener('focus', refreshOnFocus) })

const event = computed(() => group.value?.event)
const isHost = computed(() => group.value?.myStatus === 'host')
const isMember = computed(() => isHost.value || group.value?.myStatus === 'confirmed')
const full = computed(() => group.value?.spotsLeft <= 0)
const requests = computed(() => group.value?.requests || [])
const invite = computed(() => group.value?.myInvite || null)
const countdown = computed(() => (group.value ? countdownLabel(group.value.startTime) : ''))
const people = computed(() => (group.value ? [{ ...group.value.host, host: true }, ...group.value.members] : []))
import { useMyDino } from '@/lib/myDino'
const { dinoFor } = useMyDino()
const initials = (name) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
const inviteUrl = computed(() => (group.value?.inviteToken ? `${location.origin}${router.resolve(`/g/${group.value.inviteToken}`).href}` : ''))
const eventRsvpLabel = computed(() => (event.value?.requiresApproval ? 'Request a spot' : event.value?.spotsLeft > 0 ? 'RSVP' : 'Join waitlist'))
const needsEventRsvp = computed(() => isMember.value && event.value && !group.value.myEventStatus)
const eventStatusText = { confirmed: 'going to the event', waitlisted: 'on the event’s waitlist', pending: 'waiting for the organiser to approve your RSVP', offered: 'holding an offer for the event' }

// Approval groups: "Ask to join" opens a short message box first
const asking = ref(false)
const joinMessage = ref('')
async function startJoin() {
  if (!await requireCommunityAccount(router, route.fullPath)) return
  if (group.value.joinMode === 'approval' && !invite.value) {
    asking.value = true
    setTimeout(() => document.getElementById('join-message')?.focus(), 50)
    return
  }
  join()
}
async function join() {
  if (!await requireCommunityAccount(router, route.fullPath)) return
  busy.value = true
  actionError.value = ''
  try {
    const rsvp = await joinGroup({ id: group.value.id, token: token.value || undefined, message: joinMessage.value })
    asking.value = false
    joinMessage.value = ''
    justJoined.value = rsvp?.status === 'confirmed'
    toast(rsvp?.status === 'pending' ? 'Request sent to the host — you’ll be RSVP’d to the event if they approve' : rsvp?.eventRsvpStatus && !group.value.myEventStatus ? `You joined the group and RSVP’d to ${event.value?.title || 'the event'}` : 'You joined the group')
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
    // A friends-only group you just left can't be opened without the link (unless you're the host's friend)
    if (group.value.visibility === 'private' && !token.value && !group.value.hostIsFriend) { router.replace('/community'); return }
    await load({ quiet: true })
  } catch (e) {
    actionError.value = e.message
  } finally {
    busy.value = false
  }
}
async function answerInvite(accept) {
  busy.value = true
  actionError.value = ''
  try {
    await respondGroupInvite(invite.value.id, accept)
    toast(accept ? 'You joined the group' : 'Invite declined')
    justJoined.value = accept
    if (!accept && group.value.visibility === 'private' && !token.value && !group.value.hostIsFriend) { router.replace('/community'); return }
    await load({ quiet: true })
  } catch (e) {
    actionError.value = e.message
  } finally {
    busy.value = false
  }
}
async function answer(request, approve) {
  try {
    await (approve ? approveRsvp(request.rsvpId) : rejectRsvp(request.rsvpId))
    toast(approve ? `${request.name} is in` : 'Request declined')
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

// Host settings
const settingsOpen = ref(false)
const settings = ref({ visibility: 'public', joinMode: 'open', capacity: 4, note: '' })
const settingsTried = ref(false)
const savingSettings = ref(false)
const settingsError = ref('')
const settingsProblems = computed(() => settingsErrors(settings.value, people.value.length))
function openSettings() {
  const g = group.value
  settings.value = { visibility: g.visibility, joinMode: g.joinMode === 'approval' ? 'approval' : 'open', capacity: g.capacity, note: g.note || '' }
  settingsTried.value = false
  settingsError.value = ''
  deleteStep.value = false
  settingsOpen.value = true
  setTimeout(() => document.getElementById('settings-capacity')?.closest('form')?.querySelector('input')?.focus({ preventScroll: true }), 50)
}
async function saveSettings() {
  settingsTried.value = true
  settingsError.value = ''
  if (settingsProblems.value.length) return
  savingSettings.value = true
  try {
    await updateGroupSettings(group.value.id, { ...settings.value, capacity: Number(settings.value.capacity) })
    toast('Group settings saved')
    settingsOpen.value = false
    await load({ quiet: true })
  } catch (e) {
    settingsError.value = e.message
  } finally {
    savingSettings.value = false
  }
}
const deleteStep = ref(false)
const deleting = ref(false)
async function removeGroup() {
  deleting.value = true
  settingsError.value = ''
  try {
    await deleteGroup(group.value.id)
    toast('Group deleted. Everyone in it has been told.')
    router.replace('/community')
  } catch (e) {
    settingsError.value = e.message
    deleting.value = false
  }
}
</script>

<template>
  <div class="container group-page">
    <RouterLink to="/community" class="group-back">&larr; Go together</RouterLink>

    <div v-if="loading" class="group-loading" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Loading the group…</div>
    <div v-dismissible v-else-if="error" class="group-empty" role="alert">
      <h1 class="section-title">Can’t open this group</h1>
      <p>{{ error }}</p>
      <RouterLink to="/community" class="btn btn-outline-secondary">See other groups</RouterLink>
      <RouterLink v-if="!signedIn" class="btn btn-primary ms-2" :to="{ path: '/', query: { redirect: route.fullPath }, hash: '#join-dino' }">Log in / Sign up</RouterLink>
    </div>

    <template v-else-if="group">
      <header class="group-hero slide-up-in">
        <span class="group-avatar" aria-hidden="true"><img v-if="dinoFor(group.host.id)" class="dino-face" :src="dinoFor(group.host.id)" alt="">{{ dinoFor(group.host.id) ? '' : initials(group.host.name) }}</span>
        <div class="min-w-0">
          <h1 class="page-title m-0">{{ isHost ? 'Your group' : `${group.host.name}’s group` }}</h1>
          <p class="group-rules m-0">
            <span class="group-rule group-rule--when">{{ countdown }}</span>
            <span class="group-rule" :class="{ 'is-friends': group.visibility === 'private' }">{{ visibilityLabel(group.visibility) }}</span>
            <span class="group-rule">{{ joinModeLabel(group.joinMode) }}</span>
            <span v-if="group.hostIsFriend" class="group-rule is-friend">Your friend</span>
          </p>
        </div>
        <span v-if="isHost" class="group-badge group-badge--host">Hosting</span>
        <span v-else-if="group.myStatus === 'confirmed'" class="group-badge group-badge--in">You’re in</span>
        <span v-else-if="group.myStatus === 'pending'" class="group-badge">Request sent</span>
      </header>

      <!-- Sticky bar: the one thing to do next on this page -->
      <div class="group-bar">
        <span class="group-bar-title">{{ event?.title || 'Group' }} <span class="text-secondary">· {{ people.length }}/{{ group.capacity }}</span></span>
        <div class="group-bar-actions">
          <template v-if="isHost">
            <button v-if="inviteUrl" type="button" class="btn btn-outline-secondary btn-sm" @click="copyLink">{{ copied ? 'Copied ✓' : 'Copy invite link' }}</button>
            <button type="button" class="btn btn-primary btn-sm" :aria-expanded="settingsOpen" aria-controls="group-settings" @click="settingsOpen ? (settingsOpen = false) : openSettings()">{{ settingsOpen ? 'Close settings' : 'Settings' }}</button>
          </template>
          <template v-else-if="invite">
            <button type="button" class="btn btn-primary btn-sm" :disabled="busy || full" @click="answerInvite(true)">{{ busy ? 'Joining…' : full ? 'Full' : 'Accept invite' }}</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="busy" @click="answerInvite(false)">Decline</button>
          </template>
          <template v-else-if="group.myStatus">
            <template v-if="confirmLeave">
              <button type="button" class="btn btn-outline-danger btn-sm" :disabled="busy" @click="leave">{{ group.myStatus === 'pending' ? 'Withdraw request' : 'Leave group' }}</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="confirmLeave = false">Stay</button>
            </template>
            <button v-else type="button" class="btn btn-outline-secondary btn-sm" @click="confirmLeave = true">{{ group.myStatus === 'pending' ? 'Withdraw request' : 'Leave group' }}</button>
          </template>
          <button v-else type="button" class="btn btn-primary btn-sm" :disabled="busy || full" @click="startJoin">
            {{ busy ? 'Joining…' : full ? 'Full' : group.joinMode === 'approval' ? 'Ask to join' : 'Join group' }}
          </button>
        </div>
      </div>

      <p v-if="invite" class="group-invited reveal-down">
        <strong>{{ invite.from.name }} invited you.</strong> Accepting puts you straight in the group for {{ event?.title || 'this event' }}.
      </p>
      <p v-else-if="group.viaInvite && !isMember && group.myStatus !== 'pending'" class="group-invited reveal-down">
        <strong>You’re invited.</strong> {{ group.host.name }} wants you to come along to {{ event?.title || 'this event' }}.
      </p>

      <!-- Host settings: who can see and join, spots, note, and deleting the group -->
      <section v-if="isHost && settingsOpen" id="group-settings" class="group-card group-settings reveal-down" aria-labelledby="group-settings-title">
        <h2 id="group-settings-title" class="section-title m-0">Group settings</h2>
        <form class="d-grid gap-3" novalidate @submit.prevent="saveSettings">
          <fieldset>
            <legend class="form-label">Who can see it</legend>
            <div class="group-options">
              <label class="group-option" :class="{ 'is-on': settings.visibility === 'public' }"><input v-model="settings.visibility" type="radio" value="public" class="form-check-input" /><span><strong>Public</strong><span class="text-caption text-secondary">Everyone</span></span></label>
              <label class="group-option" :class="{ 'is-on': settings.visibility === 'private' }"><input v-model="settings.visibility" type="radio" value="private" class="form-check-input" /><span><strong>Friends only</strong><span class="text-caption text-secondary">Your friends, or anyone with the link</span></span></label>
            </div>
          </fieldset>
          <fieldset>
            <legend class="form-label">Who can join</legend>
            <div class="group-options">
              <label class="group-option" :class="{ 'is-on': settings.joinMode === 'open' }"><input v-model="settings.joinMode" type="radio" value="open" class="form-check-input" /><span><strong>Anyone can join</strong><span class="text-caption text-secondary">Straight away while spots last</span></span></label>
              <label class="group-option" :class="{ 'is-on': settings.joinMode === 'approval' }"><input v-model="settings.joinMode" type="radio" value="approval" class="form-check-input" /><span><strong>I approve each person</strong><span class="text-caption text-secondary">They send a request</span></span></label>
            </div>
          </fieldset>
          <div class="d-flex flex-wrap align-items-center gap-2">
            <label class="form-label m-0" for="settings-capacity">Spots</label>
            <input id="settings-capacity" v-model.number="settings.capacity" type="number" class="form-control settings-capacity" :min="Math.max(CAPACITY_RANGE.min, people.length)" :max="CAPACITY_RANGE.max" />
            <span class="text-caption text-secondary">Including you. {{ people.length }} {{ people.length === 1 ? 'person is' : 'people are' }} in.</span>
          </div>
          <div>
            <label class="form-label" for="settings-note">Note</label>
            <textarea id="settings-note" v-model="settings.note" class="form-control" rows="2" :maxlength="NOTE_LIMIT"></textarea>
          </div>
          <p v-if="settingsTried && settingsProblems.length" class="group-error" role="alert">{{ settingsProblems[0].message }}</p>
          <p v-if="settingsError" class="group-error" role="alert">{{ settingsError }}</p>
          <div class="d-flex flex-wrap gap-2">
            <button type="submit" class="btn btn-primary" :disabled="savingSettings">{{ savingSettings ? 'Saving…' : 'Save changes' }}</button>
            <button type="button" class="btn btn-outline-secondary" @click="settingsOpen = false">Cancel</button>
          </div>
        </form>
        <div class="group-danger">
          <h3 class="h6 m-0">Delete group</h3>
          <p class="text-meta text-secondary m-0">Removes the group, its chat and plan. Members, people asking to join and invited friends get a notice. Their RSVPs to the event itself stay.</p>
          <div v-if="deleteStep" class="d-flex flex-wrap gap-2" role="group" aria-label="Confirm delete">
            <button type="button" class="btn btn-danger" :disabled="deleting" @click="removeGroup">{{ deleting ? 'Deleting…' : 'Yes, delete this group' }}</button>
            <button type="button" class="btn btn-outline-secondary" :disabled="deleting" @click="deleteStep = false">Keep it</button>
          </div>
          <button v-else type="button" class="btn btn-outline-danger justify-self-start" @click="deleteStep = true">Delete group…</button>
        </div>
      </section>

      <!-- Ask to join: an optional message for the host -->
      <form v-if="asking && !group.myStatus" class="group-card group-ask reveal-down" @submit.prevent="join">
        <label class="form-label m-0" for="join-message">Message for {{ group.host.name }} <span class="text-secondary fw-normal">(optional)</span></label>
        <textarea id="join-message" v-model="joinMessage" class="form-control" rows="2" :maxlength="JOIN_MESSAGE_LIMIT" placeholder="Say hi: how you know them, or why you’re keen to go"></textarea>
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span class="text-caption text-secondary" aria-live="polite">{{ JOIN_MESSAGE_LIMIT - joinMessage.length }} left</span>
          <span class="d-flex gap-2">
            <button type="button" class="btn btn-outline-secondary btn-sm" @click="asking = false">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm" :disabled="busy">{{ busy ? 'Sending…' : 'Send request' }}</button>
          </span>
        </div>
      </form>
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

      <!-- Going, invite and chat on the left; Before and after on the right -->
      <div class="group-columns">
        <div class="group-col">
      <section class="group-card" aria-labelledby="group-people-title">
        <div class="group-people-head">
          <h2 id="group-people-title" class="section-title m-0"><BumpValue :value="people.length" /> going</h2>
          <span class="text-meta text-secondary">{{ full ? 'Full' : `${group.spotsLeft} ${group.spotsLeft === 1 ? 'spot' : 'spots'} left` }}</span>
        </div>
        <TransitionGroup tag="ul" name="person-in" class="list-unstyled m-0 group-people">
          <li v-for="person in people" :key="person.id" class="group-person">
            <span class="group-mini" aria-hidden="true"><img v-if="dinoFor(person.id)" class="dino-face" :src="dinoFor(person.id)" alt="">{{ dinoFor(person.id) ? '' : initials(person.name) }}</span>
            <span>{{ person.name }}<span v-if="person.host" class="text-caption text-secondary"> · host</span></span>
          </li>
        </TransitionGroup>

        <ul v-if="requests.length" class="list-unstyled m-0 group-requests" aria-label="Requests to join">
          <li v-for="request in requests" :key="request.rsvpId" class="group-request">
            <span class="min-w-0"><strong>{{ request.name }}</strong> asked to join<span v-if="request.message" class="group-request-note">“{{ request.message }}”</span></span>
            <span class="d-flex gap-2">
              <button type="button" class="btn btn-primary btn-sm" @click="answer(request, true)">Accept</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="answer(request, false)">Decline</button>
            </span>
          </li>
        </ul>


        <div v-if="needsEventRsvp" class="group-rsvp-prompt" :class="{ 'reveal-down': justJoined }">
          <p class="m-0"><strong>{{ justJoined ? 'You’re in the group.' : 'One more step.' }}</strong> RSVP to {{ event.title }} so you have a spot at the event too.</p>
          <RouterLink :to="{ path: `/events/${event.id}/rsvp`, hash: event.spotsLeft > 0 || event.requiresApproval ? '#rsvp' : '#waitlist' }" class="btn btn-primary btn-sm">{{ eventRsvpLabel }}</RouterLink>
        </div>
        <p v-else-if="isMember && group.myEventStatus" class="group-rsvp-done text-meta">You’re {{ eventStatusText[group.myEventStatus] }}.</p>
        <p v-dismissible v-if="actionError" class="group-error" role="alert">{{ actionError }}</p>
      </section>

      <section v-if="inviteUrl" class="group-card" aria-labelledby="group-share-title">
        <h2 id="group-share-title" class="section-title m-0">Invite friends</h2>
        <p class="text-meta text-secondary m-0">{{ group.visibility === 'private' ? 'Your friends can find the group in Community; anyone else needs this link.' : 'Send this link to friends; the group is also listed publicly.' }}</p>
        <div class="group-share">
          <label class="visually-hidden" for="group-invite-link">Invite link</label>
          <input id="group-invite-link" class="form-control" :value="inviteUrl" readonly @focus="$event.target.select()" />
          <button type="button" class="btn btn-primary" @click="copyLink"><Transition name="list-fade" mode="out-in"><span :key="copied">{{ copied ? 'Copied ✓' : 'Copy link' }}</span></Transition></button>
          <button v-if="canShare" type="button" class="btn btn-outline-secondary" @click="share">Share</button>
        </div>
      </section>

      <section v-if="signedIn" class="group-card">
        <GroupChat :key="group.id" :group-id="group.id" :can-post="isMember" @changed="load({ quiet: true })" />
      </section>
        </div>
        <div class="group-col">
      <section v-if="isMember && group.plan" class="group-card">
        <GroupPlan :group="group" @update:plan="group.plan = $event" />
      </section>
      <section v-else class="group-card group-teaser">
        <h2 class="section-title m-0">Before and after</h2>
        <p class="text-meta text-secondary m-0">Members plan food before or after the event, with deals nearby. Join the group to see and add ideas.</p>
      </section>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.group-page { max-width: none; padding-block: 1.25rem 3rem; display: grid; gap: 16px; }
.group-columns { display: grid; gap: 16px; align-items: start; }
.group-col { display: grid; gap: 16px; min-width: 0; }
@media (min-width: 992px) { .group-columns { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; } }
.group-back { justify-self: start; color: var(--bookedz-muted); text-decoration: none; font-weight: 600; }
.group-back:hover { color: var(--bookedz-ink); }
.group-loading { display: flex; align-items: center; gap: 10px; padding: 40px 0; color: var(--bookedz-muted); }
.group-empty { padding: 32px 20px; border: 1px dashed var(--bookedz-border); border-radius: 20px; background: var(--bookedz-surface); text-align: center; }
.group-empty p { color: var(--bookedz-muted); }
.group-hero { display: flex; align-items: center; gap: 14px; }
.min-w-0 { min-width: 0; flex: 1; }
.group-avatar,.group-mini { display: inline-grid; place-items: center; flex: none; border-radius: 50%; background: var(--bookedz-orange-soft); color: var(--bookedz-primary-dark); font-weight: 700; }
.dino-face { width: 100%; height: 100%; object-fit: contain; }
/* A dino shows whole, not cropped to the circle */
:is(.group-avatar, .group-mini):has(.dino-face) { overflow: visible; background: none; border-color: transparent; }
:is(.group-avatar, .group-mini) .dino-face { transform: scale(1.25); }
.group-avatar,.group-mini { overflow: hidden; }
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
.group-rules { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px !important; }
.group-rule { padding: 2px 9px; border: 1.5px solid var(--bookedz-control-border); border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-size: .74rem; font-weight: 700; }
.group-rule--when { border-color: var(--bookedz-ink); background: var(--bookedz-mango-soft); }
.group-rule.is-friends { border-color: var(--bookedz-pink); }
.group-rule.is-friend { border-color: var(--bookedz-teal); background: var(--bookedz-teal-soft); color: var(--bookedz-teal-ink); }
.group-bar { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 8px); z-index: 5; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; padding: 8px 8px 8px 16px; border: 2px solid var(--bookedz-ink); border-radius: 99px; background: var(--bookedz-surface); box-shadow: 4px 4px 0 var(--bookedz-ink); }
:global(:root[data-theme="dark"]) .group-bar { border-color: var(--bookedz-fill); box-shadow: 4px 4px 0 var(--bookedz-fill); }
.group-bar-title { min-width: 0; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 160px; }
.group-bar-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.group-bar-actions .btn { min-height: 40px; }
.group-ask textarea, .group-settings :is(.form-control) { border-width: 2px; border-radius: 14px; }
.group-request-note { display: block; margin-top: 2px; color: var(--bookedz-muted); font-style: italic; overflow-wrap: anywhere; }
.group-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.group-option { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 2px solid var(--bookedz-control-border); border-radius: 16px; cursor: pointer; }
.group-option > span { display: grid; gap: 2px; }
.group-option.is-on { border-color: var(--bookedz-ink); background: var(--bookedz-orange-soft); box-shadow: 3px 3px 0 var(--bookedz-ink); }
:global(:root[data-theme="dark"]) .group-option.is-on { border-color: var(--bookedz-fill); box-shadow: 3px 3px 0 var(--bookedz-fill); }
.group-option .form-check-input { margin-top: 4px; flex: none; }
.settings-capacity { width: 90px; }
.group-danger { display: grid; gap: 8px; padding-top: 14px; border-top: 2px dashed var(--bookedz-control-border); }
.justify-self-start { justify-self: start; }
@media (max-width: 575px) { .group-options { grid-template-columns: 1fr; } .group-bar { border-radius: 20px; } }
@media (max-width: 575px) { .group-hero { flex-wrap: wrap; } }
</style>
