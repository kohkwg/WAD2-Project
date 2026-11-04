<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { createJio } from '../../utils/api.js'
import { jioErrors, NOTE_LIMIT } from '../../utils/jios.js'
import { CAPACITY_RANGE } from '../../utils/hangouts.js'
import { formatEventTime } from '../../utils/helpers.js'

// "Start a jio": pick an upcoming event, add a note and the number of spots, post it.
// Native <dialog>: Escape closes it and focus returns to the button that opened it.
const props = defineProps({ events: { type: Array, default: () => [] }, eventId: { type: String, default: '' } })
const emit = defineEmits(['close', 'created'])
const dialog = ref(null)
const form = ref({ eventId: props.eventId || '', note: '', capacity: 4, joinMode: 'open' })
const showErrors = ref(false)
const saving = ref(false)
const failure = ref('')
let opener

const errors = computed(() => jioErrors(form.value, props.events))
const errorFor = (field) => (showErrors.value ? errors.value.find((e) => e.field === field)?.message : '')
const chosen = computed(() => props.events.find((e) => e.id === form.value.eventId))

onMounted(async () => {
  opener = document.activeElement
  dialog.value.showModal()
  await nextTick()
  dialog.value.querySelector(props.eventId ? '#jio-note' : '#jio-event')?.focus()
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
    const jio = await createJio({ ...form.value, capacity: Number(form.value.capacity) })
    emit('created', jio)
  } catch (error) {
    failure.value = error.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="jio-dialog" aria-labelledby="start-jio-title" @close="emit('close')" @cancel.prevent="emit('close')">
    <form class="jio-form" novalidate @submit.prevent="submit">
      <header class="jio-form-head">
        <div>
          <h2 id="start-jio-title" class="section-title m-0">Start a jio</h2>
          <p class="text-meta m-0">Ask others to go to an event with you.</p>
        </div>
        <button type="button" class="jio-close" aria-label="Close" @click="emit('close')">×</button>
      </header>

      <label class="form-label" for="jio-event">Event</label>
      <select id="jio-event" v-model="form.eventId" class="form-select" :aria-invalid="Boolean(errorFor('event')) || undefined" aria-describedby="jio-event-error">
        <option value="" disabled>Choose an upcoming event</option>
        <option v-for="event in events" :key="event.id" :value="event.id">{{ event.title }}</option>
      </select>
      <p v-if="chosen" class="jio-chosen text-meta">{{ formatEventTime(chosen) }} · {{ chosen.venue?.name || 'Venue to be announced' }}</p>
      <p v-if="errorFor('event')" id="jio-event-error" class="jio-error" role="alert">{{ errorFor('event') }}</p>

      <label class="form-label mt-3" for="jio-note">Note <span class="text-secondary fw-normal">(optional)</span></label>
      <textarea id="jio-note" v-model="form.note" class="form-control" rows="3" :maxlength="NOTE_LIMIT" placeholder="First time going? Where to meet? Say hi." :aria-invalid="Boolean(errorFor('note')) || undefined"></textarea>
      <p class="jio-count text-caption" :class="{ 'is-low': NOTE_LIMIT - form.note.length < 20 }" aria-live="polite">{{ NOTE_LIMIT - form.note.length }} left</p>

      <div class="jio-row">
        <div>
          <label class="form-label" for="jio-capacity">Spots</label>
          <input id="jio-capacity" v-model.number="form.capacity" type="number" class="form-control" :min="CAPACITY_RANGE.min" :max="CAPACITY_RANGE.max" :aria-invalid="Boolean(errorFor('capacity')) || undefined" aria-describedby="jio-capacity-help" />
          <p id="jio-capacity-help" class="text-caption text-secondary m-0">Including you, {{ CAPACITY_RANGE.min }} to {{ CAPACITY_RANGE.max }}.</p>
        </div>
        <fieldset>
          <legend class="form-label">Who can join</legend>
          <label class="jio-choice"><input v-model="form.joinMode" type="radio" value="open" class="form-check-input" /> Anyone, straight away</label>
          <label class="jio-choice"><input v-model="form.joinMode" type="radio" value="approval" class="form-check-input" /> I approve each person</label>
        </fieldset>
      </div>
      <p v-if="errorFor('capacity')" class="jio-error" role="alert">{{ errorFor('capacity') }}</p>
      <p v-if="failure" class="jio-error" role="alert">{{ failure }}</p>

      <footer class="jio-form-foot">
        <button type="button" class="btn btn-outline-secondary" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Posting…' : 'Post jio' }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.jio-dialog { width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 48px); padding: 0; border: 1px solid var(--bookedz-border); border-radius: 20px; background: var(--bookedz-surface); color: var(--bookedz-ink); box-shadow: var(--bookedz-shadow); overflow: auto; }
.jio-dialog[open] { animation: jio-dialog-in var(--bookedz-motion-normal) var(--bookedz-ease); }
.jio-dialog::backdrop { background: rgba(28, 25, 23, .45); }
@keyframes jio-dialog-in { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: none; } }
.jio-form { padding: 22px; }
.jio-form-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.jio-close { width: 44px; height: 44px; border: 0; border-radius: 12px; background: transparent; color: var(--bookedz-muted); font-size: 1.6rem; line-height: 1; }
.jio-close:hover { background: var(--bookedz-hover); color: var(--bookedz-ink); }
.jio-chosen { margin: 6px 0 0; color: var(--bookedz-muted); }
.jio-count { margin: 4px 0 0; text-align: right; color: var(--bookedz-muted); }
.jio-count.is-low { color: var(--bookedz-danger); }
.jio-row { display: grid; grid-template-columns: 140px 1fr; gap: 18px; margin-top: 12px; }
.jio-row fieldset { margin: 0; }
.jio-choice { display: flex; align-items: center; gap: 8px; min-height: 36px; font-size: .92rem; }
.jio-error { margin: 6px 0 0; color: var(--bookedz-danger); font-size: .88rem; }
.jio-form-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
.jio-form-foot .btn { min-height: 44px; }
@media (max-width: 575px) { .jio-row { grid-template-columns: 1fr; gap: 12px; } }
@media (prefers-reduced-motion: reduce) { .jio-dialog[open] { animation: none; } }
</style>
