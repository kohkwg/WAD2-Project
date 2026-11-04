<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { createGroup } from '../../utils/api.js'
import { groupErrors, NOTE_LIMIT } from '../../utils/groups.js'
import { CAPACITY_RANGE } from '../../utils/hangouts.js'
import { formatEventTime } from '../../utils/helpers.js'

// "Start a group": pick an upcoming event, add a note, spots and who can find it, then post it.
// Public groups are listed in Community and on the event page; private ones only open by invite link.
// Native <dialog>: Escape closes it and focus returns to the button that opened it.
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

onMounted(async () => {
  opener = document.activeElement
  dialog.value.showModal()
  await nextTick()
  dialog.value.querySelector(props.eventId ? '#group-note' : '#group-event')?.focus()
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
    const group = await createGroup({ ...form.value, capacity: Number(form.value.capacity) })
    emit('created', group)
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

      <label class="form-label" for="group-event">Event</label>
      <select id="group-event" v-model="form.eventId" class="form-select" :aria-invalid="Boolean(errorFor('event')) || undefined" aria-describedby="group-event-error">
        <option value="" disabled>Choose an upcoming event</option>
        <option v-for="event in events" :key="event.id" :value="event.id">{{ event.title }}</option>
      </select>
      <p v-if="chosen" class="group-chosen text-meta">{{ formatEventTime(chosen) }} · {{ chosen.venue?.name || 'Venue to be announced' }}</p>
      <p v-if="errorFor('event')" id="group-event-error" class="group-error" role="alert">{{ errorFor('event') }}</p>

      <label class="form-label mt-3" for="group-note">Note <span class="text-secondary fw-normal">(optional)</span></label>
      <textarea id="group-note" v-model="form.note" class="form-control" rows="3" :maxlength="NOTE_LIMIT" placeholder="First time going? Where to meet? Say hi." :aria-invalid="Boolean(errorFor('note')) || undefined"></textarea>
      <p class="group-count text-caption" :class="{ 'is-low': NOTE_LIMIT - form.note.length < 20 }" aria-live="polite">{{ NOTE_LIMIT - form.note.length }} left</p>

      <div class="group-row">
        <div>
          <label class="form-label" for="group-capacity">Spots</label>
          <input id="group-capacity" v-model.number="form.capacity" type="number" class="form-control" :min="CAPACITY_RANGE.min" :max="CAPACITY_RANGE.max" :aria-invalid="Boolean(errorFor('capacity')) || undefined" aria-describedby="group-capacity-help" />
          <p id="group-capacity-help" class="text-caption text-secondary m-0">Including you, {{ CAPACITY_RANGE.min }} to {{ CAPACITY_RANGE.max }}.</p>
        </div>
        <fieldset>
          <legend class="form-label">Who can join</legend>
          <label class="group-choice"><input v-model="form.joinMode" type="radio" value="open" class="form-check-input" /> Anyone, straight away</label>
          <label class="group-choice"><input v-model="form.joinMode" type="radio" value="approval" class="form-check-input" /> I approve each person</label>
        </fieldset>
      </div>
      <fieldset class="mt-3">
        <legend class="form-label">Who can find it</legend>
        <div class="group-visibility">
          <label class="group-vis-option" :class="{ 'is-on': form.visibility === 'public' }">
            <input v-model="form.visibility" type="radio" value="public" class="form-check-input" />
            <span><strong>Public</strong><span class="text-caption text-secondary">Shown in Community and on the event page</span></span>
          </label>
          <label class="group-vis-option" :class="{ 'is-on': form.visibility === 'private' }">
            <input v-model="form.visibility" type="radio" value="private" class="form-check-input" />
            <span><strong>Private</strong><span class="text-caption text-secondary">Only people with your invite link</span></span>
          </label>
        </div>
      </fieldset>
      <p v-if="errorFor('capacity')" class="group-error" role="alert">{{ errorFor('capacity') }}</p>
      <p v-if="failure" class="group-error" role="alert">{{ failure }}</p>

      <footer class="group-form-foot">
        <button type="button" class="btn btn-outline-secondary" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Starting…' : 'Start group' }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.group-dialog { width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 48px); padding: 0; border: 1px solid var(--bookedz-border); border-radius: 20px; background: var(--bookedz-surface); color: var(--bookedz-ink); box-shadow: var(--bookedz-shadow); overflow: auto; }
.group-dialog[open] { animation: group-dialog-in var(--bookedz-motion-normal) var(--bookedz-ease); }
.group-dialog::backdrop { background: rgba(28, 25, 23, .45); }
@keyframes group-dialog-in { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: none; } }
.group-form { padding: 22px; }
.group-form-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.group-close { width: 44px; height: 44px; border: 0; border-radius: 12px; background: transparent; color: var(--bookedz-muted); font-size: 1.6rem; line-height: 1; }
.group-close:hover { background: var(--bookedz-hover); color: var(--bookedz-ink); }
.group-chosen { margin: 6px 0 0; color: var(--bookedz-muted); }
.group-count { margin: 4px 0 0; text-align: right; color: var(--bookedz-muted); }
.group-count.is-low { color: var(--bookedz-danger); }
.group-row { display: grid; grid-template-columns: 140px 1fr; gap: 18px; margin-top: 12px; }
.group-row fieldset { margin: 0; }
.group-choice { display: flex; align-items: center; gap: 8px; min-height: 36px; font-size: .92rem; }
.group-visibility { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.group-vis-option { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--bookedz-border); border-radius: 14px; cursor: pointer; transition: border-color var(--bookedz-motion-fast) var(--bookedz-ease), background-color var(--bookedz-motion-fast) var(--bookedz-ease); }
.group-vis-option > span { display: grid; gap: 2px; }
.group-vis-option.is-on { border-color: var(--bookedz-primary); background: var(--bookedz-orange-soft); animation: vis-pick var(--bookedz-motion-fast, .16s) var(--bookedz-ease-stamp, ease-out); }
@keyframes vis-pick { 50% { transform: scale(1.02); } }
@media (prefers-reduced-motion: reduce) { .group-vis-option.is-on { animation: none; } }
.group-vis-option .form-check-input { margin-top: 4px; flex: none; }
.group-error { margin: 6px 0 0; color: var(--bookedz-danger); font-size: .88rem; }
.group-form-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
.group-form-foot .btn { min-height: 44px; }
@media (max-width: 575px) { .group-row,.group-visibility { grid-template-columns: 1fr; gap: 12px; } }
@media (prefers-reduced-motion: reduce) { .group-dialog[open] { animation: none; } }
</style>
