<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import AvailabilityGrid from './AvailabilityGrid.vue'
import { getHangoutTime, saveHangoutAvailability, clearHangoutAvailability, setHangoutRequired, previewHangoutSlot, lockHangoutSlot, unlockHangoutSlot } from '../../utils/api.js'
import { rangeDays, cellsFromIntervals, intervalsFromCells } from '../../utils/hangoutSlots.js'
import { sgDateTime } from '../../utils/hangouts.js'

// Time tab for group hangouts: mark free times, see aggregate overlap, rank and lock.
const props = defineProps({ eventId: { type: String, required: true } })
const emit = defineEmits(['changed'])

const data = ref(null)
const loading = ref(true)
const loadError = ref('')
const selection = ref(new Set())
const saved = ref(new Set())
const history = ref([])
const tool = ref('paint')
const view = ref('mine')
const saving = ref(false)
const saveMessage = ref('')
const saveError = ref('')
const shorter = ref(false)
const highlight = ref(null)
const actionError = ref('')
const busy = ref(false)
const custom = ref({ day: '', from: '', to: '' })
const customPreview = ref(null)
let request = 0

const days = computed(() => (data.value ? rangeDays(data.value.dateRange) : []))
const dirty = computed(() => selection.value.size !== saved.value.size || [...selection.value].some(c => !saved.value.has(c)))
const counts = computed(() => new Map((data.value?.heatmap.cells || []).map(c => [c.start, c.count])))
const locked = computed(() => data.value?.lockedSlot)
const noReply = computed(() => (data.value?.members || []).filter(m => !m.responded))
const dayValue = d => new Date(d + 8 * 3600000).toISOString().slice(0, 10)
const dayLabel = d => new Date(d).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
const time = ms => new Date(ms).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' })
const range = slot => `${dayLabel(slot.start)}, ${time(slot.start)} – ${time(slot.end)}`
const names = list => list.map(m => m.name).join(', ')
const hours = minutes => `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`

async function load({ keepSelection = false } = {}) {
  const ticket = ++request
  loadError.value = ''
  try {
    const result = await getHangoutTime(props.eventId, shorter.value ? { minMinutes: 60 } : {})
    if (ticket !== request) return
    data.value = result
    saved.value = cellsFromIntervals(result.myIntervals)
    if (!keepSelection) { selection.value = new Set(saved.value); history.value = [] }
  } catch (error) {
    if (ticket === request) loadError.value = error.message
  } finally {
    if (ticket === request) loading.value = false
  }
}
onMounted(load)

function remember() {
  history.value = [...history.value.slice(-29), new Set(selection.value)]
  saveMessage.value = ''
}
function undoLast() {
  const previous = history.value[history.value.length - 1]
  if (!previous) return
  history.value = history.value.slice(0, -1)
  selection.value = previous
}
function addRange(day, from, to) {
  const start = sgDateTime(dayValue(day), from).getTime(), end = sgDateTime(dayValue(day), to).getTime()
  const next = new Set(selection.value)
  for (const c of cellsFromIntervals([{ start, end }])) next.add(c)
  selection.value = next
}
function preset(from, to) { remember(); for (const d of days.value) addRange(d, from, to) }
const typed = ref({ day: '', from: '', to: '' })
const typedError = ref('')
function addTyped() {
  typedError.value = ''
  const { day, from, to } = typed.value
  if (!day || !from || !to || to <= from) { typedError.value = 'Choose a day and an end time after the start time.'; return }
  remember()
  addRange(Number(day), from, to)
  typed.value = { day, from: '', to: '' }
}
function clearDraft() { remember(); selection.value = new Set() }

async function save() {
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    await saveHangoutAvailability(props.eventId, intervalsFromCells(selection.value))
    saveMessage.value = selection.value.size ? 'Free times saved.' : 'Saved: you’re not free at any of these times.'
    await load({ keepSelection: true })
    emit('changed')
  } catch (error) {
    saveError.value = `Couldn’t save: ${error.message} Your marks are still here; try again.`
  } finally {
    saving.value = false
  }
}
async function withdraw() {
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    await clearHangoutAvailability(props.eventId)
    saveMessage.value = 'Your reply was removed; you now show as “no reply”.'
    await load()
  } catch (error) { saveError.value = error.message } finally { saving.value = false }
}

async function hostAction(action) {
  if (busy.value) return
  busy.value = true
  actionError.value = ''
  try { await action(); await load({ keepSelection: true }); emit('changed') }
  catch (error) { actionError.value = error.message }
  finally { busy.value = false }
}
const toggleRequired = member => hostAction(() => setHangoutRequired(props.eventId, member.id, !member.required))
const lock = slot => {
  if (!window.confirm(`Lock ${range(slot)} for everyone? You can unlock it later.`)) return
  hostAction(() => lockHangoutSlot(props.eventId, { start: slot.start, end: slot.end }))
}
const unlock = () => hostAction(() => unlockHangoutSlot(props.eventId))
async function useShorter() { shorter.value = true; await load({ keepSelection: true }) }
async function useStandard() { shorter.value = false; await load({ keepSelection: true }) }
function showOnGrid(slot) {
  highlight.value = { start: slot.start, end: slot.end }
  view.value = 'overlap'
  document.getElementById('time-grid-section')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}
async function previewCustom() {
  actionError.value = ''
  customPreview.value = null
  const { day, from, to } = custom.value
  if (!day || !from || !to) { actionError.value = 'Choose a day, start and end for your own time.'; return }
  const slot = { start: sgDateTime(dayValue(Number(day)), from).getTime(), end: sgDateTime(dayValue(Number(day)), to).getTime() }
  try { customPreview.value = { slot, ...(await previewHangoutSlot(props.eventId, slot)) } }
  catch (error) { actionError.value = error.message }
}

// Leaving with unsaved marks asks first.
const beforeUnload = event => { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
onBeforeRouteLeave(() => !dirty.value || window.confirm('You have unsaved free times. Leave without saving?'))
</script>

<template>
  <section class="time-panel" aria-labelledby="time-title">
    <h2 id="time-title" class="visually-hidden">Time</h2>
    <div v-if="loading" role="status" class="text-body-secondary"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Loading free times…</div>
    <div v-else-if="loadError && !data" class="alert alert-warning" role="alert">{{ loadError }} <button type="button" class="btn btn-link btn-sm" @click="load()">Try again</button></div>
    <template v-else-if="data">
      <div v-if="locked" class="locked-slip" role="status">
        <p class="slip-label">Time locked</p>
        <p class="slip-time">{{ range({ start: Date.parse(locked.startTime), end: Date.parse(locked.endTime) }) }}</p>
        <p class="small mb-2">Free times are closed. Next: shape the plan.</p>
        <button v-if="data.isHost" type="button" class="btn btn-outline-secondary btn-sm" :disabled="busy" @click="unlock">Unlock and reopen free times</button>
      </div>

      <div class="people-strip" aria-label="Replies">
        <span v-for="m in data.members" :key="m.id" class="person" :class="m.responded ? 'person--replied' : 'person--waiting'">
          <span aria-hidden="true">{{ m.responded ? '✓' : '…' }}</span> {{ m.name }}<template v-if="m.role === 'host'"> (host)</template> · {{ m.responded ? 'replied' : 'no reply yet' }}<template v-if="m.required"> · required</template>
          <button v-if="data.isHost && m.role !== 'host' && !locked" type="button" class="person-toggle" :disabled="busy" :aria-label="`Make ${m.name} ${m.required ? 'optional' : 'required'}`" @click="toggleRequired(m)">{{ m.required ? 'Make optional' : 'Make required' }}</button>
        </span>
      </div>

      <div id="time-grid-section" class="workspace-panel">
        <div class="grid-head">
          <h3 class="section-heading mb-0">{{ view === 'mine' ? 'Mark when you’re free' : 'Group overlap' }}</h3>
          <div class="segmented" role="group" aria-label="Grid view">
            <button type="button" :aria-pressed="view === 'mine'" @click="view = 'mine'; highlight = null">My free times</button>
            <button type="button" :aria-pressed="view === 'overlap'" @click="view = 'overlap'">Group overlap</button>
          </div>
        </div>
        <template v-if="view === 'mine'">
          <p class="small text-body-secondary">Choose a tool, then drag or tap cells. With the keyboard, use the arrow keys and press Space to toggle. Times are Singapore time.</p>
          <div class="tool-row">
            <div class="segmented" role="group" aria-label="Grid tool">
              <button type="button" :aria-pressed="tool === 'paint'" :disabled="Boolean(locked)" @click="tool = 'paint'">Paint free</button>
              <button type="button" :aria-pressed="tool === 'erase'" :disabled="Boolean(locked)" @click="tool = 'erase'">Erase</button>
              <button type="button" :aria-pressed="tool === 'scroll'" @click="tool = 'scroll'">Scroll</button>
            </div>
            <div class="preset-row" role="group" aria-label="Quick fill">
              <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="Boolean(locked)" @click="preset('18:00', '22:00')">Evenings 6–10pm</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="Boolean(locked)" @click="preset('12:00', '18:00')">Afternoons 12–6pm</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="Boolean(locked)" @click="preset('10:00', '22:00')">All day 10am–10pm</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!history.length" @click="undoLast">Undo</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="Boolean(locked) || !selection.size" @click="clearDraft">Clear marks</button>
            </div>
          </div>
          <AvailabilityGrid v-model="selection" :days="days" :tool="locked ? 'scroll' : tool" mode="edit" label="Your free times" @change-start="remember" />
          <details class="typed-range">
            <summary>Add a range by typing</summary>
            <div class="row g-2 align-items-end mt-1">
              <div class="col-sm-4"><label class="form-label" for="typed-day">Day</label><select id="typed-day" v-model="typed.day" class="form-select"><option value="" disabled>Choose…</option><option v-for="d in days" :key="d" :value="String(d)">{{ dayLabel(d) }}</option></select></div>
              <div class="col-6 col-sm-3"><label class="form-label" for="typed-from">From</label><input id="typed-from" v-model="typed.from" type="time" step="1800" class="form-control"></div>
              <div class="col-6 col-sm-3"><label class="form-label" for="typed-to">To</label><input id="typed-to" v-model="typed.to" type="time" step="1800" class="form-control"></div>
              <div class="col-sm-2"><button type="button" class="btn btn-outline-secondary w-100" :disabled="Boolean(locked)" @click="addTyped">Add</button></div>
            </div>
            <p v-if="typedError" class="text-danger small mt-2 mb-0" role="alert">{{ typedError }}</p>
          </details>
          <div class="save-row">
            <span class="small" role="status">{{ saveMessage || (dirty ? 'Unsaved changes' : data.me.responded ? 'Saved' : 'You haven’t replied yet') }}</span>
            <button v-if="data.me.responded && !locked" type="button" class="btn btn-outline-secondary btn-sm" :disabled="saving" @click="withdraw">Remove my reply</button>
            <button type="button" class="btn btn-primary" :disabled="saving || Boolean(locked) || (!dirty && data.me.responded)" @click="save">{{ saving ? 'Saving…' : data.me.responded ? 'Save changes' : 'Save my free times' }}</button>
          </div>
          <p v-if="saveError" class="text-danger small mb-0" role="alert">{{ saveError }}</p>
        </template>
        <template v-else>
          <p class="small text-body-secondary">Numbers show how many of the {{ data.heatmap.responders }} people who replied are free for the whole half hour. Individual schedules aren’t shown.<template v-if="noReply.length"> No reply yet: {{ names(noReply) }}.</template></p>
          <AvailabilityGrid :model-value="new Set()" :days="days" mode="overlap" :counts="counts" :responders="data.heatmap.responders" :highlight="highlight" label="Group overlap, aggregate counts" />
        </template>
      </div>

      <div v-if="!locked" class="workspace-panel">
        <h3 class="section-heading">Recommended times</h3>
        <p v-if="shorter" class="small">Showing times as short as 1 hour. <button type="button" class="btn btn-link btn-sm p-0" @click="useStandard">Back to 2 hours or more</button></p>
        <p v-if="data.pendingRequired.length" class="alert alert-warning small" role="status">Waiting on required people: {{ names(data.pendingRequired) }}. Times are ranked once they reply.</p>
        <p v-else-if="!data.heatmap.responders" class="text-body-secondary">No one has replied yet. Times appear once people mark when they’re free.</p>
        <ol v-if="data.options.length" class="slot-list">
          <li v-for="(slot, index) in data.options" :key="`${slot.start}-${slot.end}`" class="slot-card">
            <span class="slot-rank" aria-hidden="true">{{ index + 1 }}</span>
            <div class="slot-body">
              <p class="slot-time">{{ range(slot) }} <span class="slot-length">({{ hours(slot.minutes) }})</span></p>
              <p class="slot-fact"><strong>Can make it ({{ slot.available.length }}):</strong> {{ names(slot.available) }}</p>
              <p v-if="slot.cannot.length" class="slot-fact"><strong>Can’t make it:</strong> {{ names(slot.cannot) }}</p>
              <p v-if="slot.noReply.length" class="slot-fact"><strong>No reply:</strong> {{ names(slot.noReply) }}</p>
              <p class="slot-fact text-body-secondary">{{ Math.round(slot.bandFraction * 100) }}% between 11am and 10pm · {{ [0, 6].includes(new Date(slot.start + 8 * 3600000).getUTCDay()) ? 'weekend' : 'weekday' }}</p>
              <div class="d-flex flex-wrap gap-2 mt-2">
                <button type="button" class="btn btn-outline-secondary btn-sm" @click="showOnGrid(slot)">Show on grid</button>
                <button v-if="data.isHost" type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="lock(slot)">Lock this time</button>
              </div>
            </div>
          </li>
        </ol>
        <div v-else-if="data.isHost && data.rescue.length" class="rescue">
          <p class="fw-semibold mb-2">No time works for everyone who’s required. Choose what to do (nothing changes until you pick):</p>
          <ul>
            <li v-for="s in data.rescue" :key="s.kind + (s.memberId || '')">
              {{ s.label }}
              <button v-if="s.kind === 'optional'" type="button" class="btn btn-link btn-sm" :disabled="busy" @click="toggleRequired(data.members.find(m => m.id === s.memberId))">Make optional</button>
              <button v-else-if="s.kind === 'shorter'" type="button" class="btn btn-link btn-sm" @click="useShorter">Show shorter times</button>
            </li>
          </ul>
        </div>
        <p v-else-if="data.heatmap.responders && !data.pendingRequired.length" class="text-body-secondary">No shared window of 2 hours or more yet.</p>

        <details v-if="data.isHost" class="custom-time">
          <summary>Choose your own time</summary>
          <div class="row g-2 align-items-end mt-1">
            <div class="col-sm-4"><label class="form-label" for="custom-day">Day</label><select id="custom-day" v-model="custom.day" class="form-select"><option value="" disabled>Choose…</option><option v-for="d in days" :key="d" :value="String(d)">{{ dayLabel(d) }}</option></select></div>
            <div class="col-6 col-sm-3"><label class="form-label" for="custom-from">Start</label><input id="custom-from" v-model="custom.from" type="time" step="1800" class="form-control"></div>
            <div class="col-6 col-sm-3"><label class="form-label" for="custom-to">End</label><input id="custom-to" v-model="custom.to" type="time" step="1800" class="form-control"></div>
            <div class="col-sm-2"><button type="button" class="btn btn-outline-secondary w-100" @click="previewCustom">Check</button></div>
          </div>
          <div v-if="customPreview" class="custom-preview" role="status">
            <p class="mb-1"><strong>{{ range(customPreview.slot) }}</strong></p>
            <p class="mb-1 small">Can make it: {{ names(customPreview.available) || 'nobody who replied' }}<template v-if="customPreview.cannot.length"> · Can’t: {{ names(customPreview.cannot) }}</template><template v-if="customPreview.noReply.length"> · No reply: {{ names(customPreview.noReply) }}</template></p>
            <ul v-if="customPreview.blockers.length" class="text-danger small mb-1"><li v-for="b in customPreview.blockers" :key="b">{{ b }}</li></ul>
            <button type="button" class="btn btn-primary btn-sm" :disabled="!customPreview.ok || busy" @click="lock(customPreview.slot)">Lock this time</button>
          </div>
        </details>
      </div>
      <p v-if="actionError" class="alert alert-danger" role="alert">{{ actionError }}</p>
    </template>
  </section>
</template>

<style scoped>
.time-panel { display: grid; gap: 20px; }
.locked-slip { padding: 18px 20px; border: 1px dashed var(--bookedz-teal); border-radius: var(--bookedz-radius-card); background: var(--bookedz-teal-soft); color: var(--bookedz-ink); }
.slip-label { margin: 0; font-size: .75rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--bookedz-teal-ink); }
.slip-time { margin: 4px 0; font: 900 1.3rem var(--bookedz-heading); font-variant-numeric: tabular-nums; }
.people-strip { display: flex; flex-wrap: wrap; gap: 8px; }
.person { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 99px; border: 1px solid var(--bookedz-border); background: var(--bookedz-surface); font-size: .8rem; }
.person--replied { background: var(--bookedz-teal-soft); border-color: transparent; }
.person--waiting { border-style: dashed; }
.person-toggle { min-height: 32px; padding: 2px 10px; border: 1px solid var(--bookedz-control-border); border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-size: .72rem; font-weight: 700; }
.grid-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.segmented { display: inline-flex; gap: 4px; padding: 4px; border-radius: 99px; background: var(--bookedz-glass-solid); border: 1px solid var(--bookedz-border); }
.segmented button { min-height: 40px; padding: 6px 14px; border: 0; border-radius: 99px; background: transparent; color: var(--bookedz-muted); font-size: .82rem; font-weight: 700; }
.segmented button[aria-pressed=true] { background: var(--bookedz-ink); color: var(--bookedz-surface); }
.segmented button:disabled { opacity: .55; }
.tool-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }
.preset-row { display: flex; flex-wrap: wrap; gap: 6px; }
.typed-range,.custom-time { margin-top: 14px; }
.typed-range summary,.custom-time summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; font-weight: 700; color: var(--bookedz-primary-dark); }
.save-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 16px; padding-top: 14px; border-top: 1px dashed var(--bookedz-border); }
.save-row > span { margin-right: auto; color: var(--bookedz-muted); }
.slot-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.slot-card { display: flex; gap: 14px; padding: 16px; border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-control); background: var(--bookedz-surface); }
.slot-card:first-child { border: 2px solid var(--bookedz-mango); padding: 15px; }
.slot-rank { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--bookedz-mango-soft); font: 900 1rem var(--bookedz-heading); }
.slot-body { min-width: 0; }
.slot-time { margin: 0 0 6px; font-family: var(--bookedz-heading); font-weight: 800; font-size: 1.05rem; font-variant-numeric: tabular-nums; }
.slot-length { font-family: var(--bookedz-body); font-weight: 500; color: var(--bookedz-muted); font-size: .85rem; }
.slot-fact { margin: 0 0 2px; font-size: .85rem; overflow-wrap: anywhere; }
.rescue ul { padding-left: 1.2rem; display: grid; gap: 4px; }
.custom-preview { margin-top: 12px; padding: 12px 14px; border: 1px dashed var(--bookedz-control-border); border-radius: var(--bookedz-radius-control); background: var(--bookedz-glass-solid); }
</style>
