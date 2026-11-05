<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { createGroup } from '../../utils/api.js'
import { getFriends } from '../../utils/profileFriends.js'
import { CAPACITY_RANGE, groupErrors, NOTE_LIMIT } from '../../utils/groups.js'
import { formatEventTime } from '../../utils/helpers.js'

// "Start a group": pick one of your upcoming RSVP'd events (only people going can start one), add a note and spots, choose who can see it
// (public, or friends only) and who can join (anyone, or the host approves), and tick
// friends to invite. Native <dialog>: Escape closes it and focus returns to the opener.
const props = defineProps({ events: { type: Array, default: () => [] }, eventId: { type: String, default: '' } })
const emit = defineEmits(['close', 'created'])
const dialog = ref(null)
const form = ref({ eventId: props.eventId || '', note: '', capacity: 4, joinMode: 'open', visibility: 'public' })
const showErrors = ref(false)
const saving = ref(false)
const failure = ref('')
let opener

const errors = computed(() => groupErrors(form.value, props.events))
const errorFor = (field) => (showErrors.value ? errors.value.find((e) => e.field === field)?.message : '')
const chosen = computed(() => props.events.find((e) => e.id === form.value.eventId))

// Quick add: your friends, with a search box once the list is long
const friends = ref([])
const friendsState = ref('loading') // loading | ready | error
const friendQuery = ref('')
const invited = ref([])
const shownFriends = computed(() => {
  const q = friendQuery.value.trim().replace(/^@/, '').toLowerCase()
  return q ? friends.value.filter((f) => [f.displayName, f.username].some((t) => t?.toLowerCase().includes(q))) : friends.value
})
const initials = (name = '') => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
async function loadFriends() {
  friendsState.value = 'loading'
  try {
    friends.value = (await getFriends()).friends || []
    friendsState.value = 'ready'
  } catch {
    friendsState.value = 'error'
  }
}

onMounted(async () => {
  opener = document.activeElement
  dialog.value.showModal()
  await nextTick()
  dialog.value.querySelector(props.eventId ? '#group-note' : '#group-event')?.focus()
  loadFriends()
})
onBeforeUnmount(() => opener?.focus?.())

async function submit() {
  showErrors.value = true
  failure.value = ''
  if (errors.value.length) {
    await nextTick()
    dialog.value.querySelector('[aria-invalid="true"]')?.focus()
    return
  }
  saving.value = true
  try {
    const group = await createGroup({ ...form.value, capacity: Number(form.value.capacity), inviteIds: invited.value })
    emit('created', { ...group, invitedCount: invited.value.length })
  } catch (error) {
    failure.value = error.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="group-dialog" aria-labelledby="start-group-title" @close="emit('close')" @cancel.prevent="emit('close')">
    <form class="group-form" novalidate @submit.prevent="submit">
      <header class="group-form-head">
        <div>
          <h2 id="start-group-title" class="section-title m-0">Start a group</h2>
          <p class="text-meta m-0">Find people to go to an event with you.</p>
        </div>
        <button type="button" class="group-close" aria-label="Close" @click="emit('close')">×</button>
      </header>

      <div v-if="!events.length" class="group-no-events" role="status">
        <strong>RSVP to an event first.</strong>
        <span class="text-meta text-secondary">Groups are started by people going to the event. Find something on Discover, RSVP, then come back.</span>
        <RouterLink to="/discover" class="btn btn-primary btn-sm justify-self-start" @click="emit('close')">Browse events</RouterLink>
      </div>
      <template v-else>
      <label class="form-label" for="group-event">Event you’re going to</label>
      <select id="group-event" v-model="form.eventId" class="form-select" :aria-invalid="Boolean(errorFor('event')) || undefined" aria-describedby="group-event-error">
        <option value="" disabled>Choose one of your events</option>
        <option v-for="event in events" :key="event.id" :value="event.id">{{ event.title }}</option>
      </select>
      <p v-if="chosen" class="group-chosen text-meta">{{ formatEventTime(chosen) }} · {{ chosen.venue?.name || 'Venue to be announced' }}</p>
      <p v-dismissible v-if="errorFor('event')" id="group-event-error" class="group-error" role="alert">{{ errorFor('event') }}</p>

      <label class="form-label mt-3" for="group-note">Note <span class="text-secondary fw-normal">(optional)</span></label>
      <textarea id="group-note" v-model="form.note" class="form-control" rows="2" :maxlength="NOTE_LIMIT" placeholder="First time going? Where to meet? Say hi." :aria-invalid="Boolean(errorFor('note')) || undefined"></textarea>
      <p class="group-count text-caption" :class="{ 'is-low': NOTE_LIMIT - form.note.length < 20 }" aria-live="polite">{{ NOTE_LIMIT - form.note.length }} left</p>

      <div class="group-spots">
        <label class="form-label m-0" for="group-capacity">Spots</label>
        <input id="group-capacity" v-model.number="form.capacity" type="number" class="form-control" :min="CAPACITY_RANGE.min" :max="CAPACITY_RANGE.max" :aria-invalid="Boolean(errorFor('capacity')) || undefined" aria-describedby="group-capacity-help" />
        <span id="group-capacity-help" class="text-caption text-secondary">Including you, {{ CAPACITY_RANGE.min }} to {{ CAPACITY_RANGE.max }}.</span>
      </div>
      <p v-dismissible v-if="errorFor('capacity')" class="group-error" role="alert">{{ errorFor('capacity') }}</p>

      <fieldset class="mt-3">
        <legend class="form-label">Who can see it</legend>
        <div class="group-options">
          <label class="group-option" :class="{ 'is-on': form.visibility === 'public' }">
            <input v-model="form.visibility" type="radio" value="public" class="form-check-input" />
            <span><strong>Public</strong><span class="text-caption text-secondary">Everyone, in Community and on the event page</span></span>
          </label>
          <label class="group-option" :class="{ 'is-on': form.visibility === 'private' }">
            <input v-model="form.visibility" type="radio" value="private" class="form-check-input" />
            <span><strong>Friends only</strong><span class="text-caption text-secondary">Your friends, or anyone you send the link to</span></span>
          </label>
        </div>
      </fieldset>

      <fieldset class="mt-3">
        <legend class="form-label">Who can join</legend>
        <div class="group-options">
          <label class="group-option" :class="{ 'is-on': form.joinMode === 'open' }">
            <input v-model="form.joinMode" type="radio" value="open" class="form-check-input" />
            <span><strong>Anyone can join</strong><span class="text-caption text-secondary">They’re in straight away while spots last</span></span>
          </label>
          <label class="group-option" :class="{ 'is-on': form.joinMode === 'approval' }">
            <input v-model="form.joinMode" type="radio" value="approval" class="form-check-input" />
            <span><strong>I approve each person</strong><span class="text-caption text-secondary">They send a request with a short message</span></span>
          </label>
        </div>
      </fieldset>

      <fieldset class="mt-3 group-invite">
        <legend class="form-label d-flex justify-content-between w-100">
          <span>Invite friends <span class="text-secondary fw-normal">(optional)</span></span>
          <span v-if="invited.length" class="text-caption text-secondary fw-normal" aria-live="polite">{{ invited.length }} selected</span>
        </legend>
        <p v-if="friendsState === 'loading'" class="text-caption text-secondary m-0" role="status">Loading your friends…</p>
        <p v-else-if="friendsState === 'error'" class="text-caption text-secondary m-0">Couldn’t load your friends. <button type="button" class="btn btn-link btn-sm p-0 align-baseline" @click="loadFriends">Try again</button></p>
        <p v-else-if="!friends.length" class="text-caption text-secondary m-0">No friends yet. Add people in the Friends panel, then invite them here.</p>
        <template v-else>
          <label v-if="friends.length > 5" class="visually-hidden" for="group-friend-search">Search friends</label>
          <input v-if="friends.length > 5" id="group-friend-search" v-model="friendQuery" type="search" class="form-control form-control-sm mb-2" placeholder="Search friends" autocomplete="off" />
          <ul class="group-friends list-unstyled m-0">
            <li v-for="friend in shownFriends" :key="friend.id">
              <label class="group-friend" :class="{ 'is-on': invited.includes(friend.id) }">
                <input v-model="invited" type="checkbox" :value="friend.id" class="form-check-input" />
                <span class="group-friend-avatar" aria-hidden="true">{{ initials(friend.displayName || friend.username) }}</span>
                <span class="min-w-0"><strong>{{ friend.displayName || friend.username }}</strong><span v-if="friend.username" class="d-block text-caption text-secondary">@{{ friend.username }}</span></span>
              </label>
            </li>
            <li v-if="!shownFriends.length" class="text-caption text-secondary py-2">No friends match “{{ friendQuery }}”.</li>
          </ul>
          <p class="text-caption text-secondary mt-2 mb-0">They’ll get an invite in Community. Accepting joins them straight away.</p>
        </template>
      </fieldset>

      <p v-dismissible v-if="failure" class="group-error" role="alert">{{ failure }}</p>
      </template>

      <footer class="group-form-foot">
        <button type="button" class="btn btn-outline-secondary" @click="emit('close')">Cancel</button>
        <button v-if="events.length" type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Starting…' : invited.length ? `Start group & invite ${invited.length}` : 'Start group' }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.group-dialog { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px); padding: 0; border: 2px solid var(--bookedz-ink); border-radius: 24px; background: var(--bookedz-surface); color: var(--bookedz-ink); box-shadow: 8px 8px 0 var(--bookedz-teal); overflow: auto; }
:root[data-theme="dark"] .group-dialog { border-color: var(--bookedz-border); }
.group-dialog[open] { animation: group-dialog-in var(--bookedz-motion-normal) var(--bookedz-ease); }
.group-dialog::backdrop { background: rgba(28, 25, 23, .45); }
@keyframes group-dialog-in { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: none; } }
.group-form { padding: 22px; }
.group-form-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.group-form-head .section-title { font-weight: 900; }
.group-close { width: 44px; height: 44px; border: 0; border-radius: 12px; background: transparent; color: var(--bookedz-muted); font-size: 1.6rem; line-height: 1; }
.group-close:hover { background: var(--bookedz-hover); color: var(--bookedz-ink); }
.group-chosen { margin: 6px 0 0; color: var(--bookedz-muted); }
.group-count { margin: 4px 0 0; text-align: right; color: var(--bookedz-muted); }
.group-count.is-low { color: var(--bookedz-danger); }
.group-form :is(.form-control, .form-select) { border-width: 2px; border-radius: 14px; }
.group-spots { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.group-spots .form-control { width: 90px; }
.group-form fieldset { margin-bottom: 0; }
.group-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.group-option { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 2px solid var(--bookedz-control-border); border-radius: 16px; cursor: pointer; transition: border-color var(--bookedz-motion-fast) var(--bookedz-ease), background-color var(--bookedz-motion-fast) var(--bookedz-ease); }
.group-option > span { display: grid; gap: 2px; }
.group-option.is-on { border-color: var(--bookedz-ink); background: var(--bookedz-orange-soft); box-shadow: 3px 3px 0 var(--bookedz-ink); }
:root[data-theme="dark"] .group-option.is-on { border-color: var(--bookedz-fill); box-shadow: 3px 3px 0 var(--db-dark-edge); }
.group-option .form-check-input { margin-top: 4px; flex: none; }
.group-friends { display: grid; gap: 6px; max-height: 220px; overflow: auto; padding: 2px; }
.group-friend { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 6px 10px; border: 2px solid var(--bookedz-control-border); border-radius: 14px; cursor: pointer; }
.group-friend.is-on { border-color: var(--bookedz-teal); background: color-mix(in srgb, var(--bookedz-teal) 14%, var(--bookedz-surface)); }
.group-friend .form-check-input { flex: none; margin: 0; }
.group-friend-avatar { display: inline-grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 50%; background: var(--bookedz-orange-soft); color: var(--bookedz-primary-dark); font-size: .78rem; font-weight: 700; }
.min-w-0 { min-width: 0; overflow-wrap: anywhere; }
.group-no-events { display: grid; gap: 6px; padding: 14px; border: 2px dashed var(--bookedz-control-border); border-radius: 16px; }
.justify-self-start { justify-self: start; }
.group-error { margin: 6px 0 0; color: var(--bookedz-danger); font-size: .88rem; }
.group-form-foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 22px; }
.group-form-foot .btn { min-height: 44px; border-radius: 99px; border-width: 2px; }
@media (max-width: 575px) { .group-options { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .group-dialog[open] { animation: none; } }
</style>
