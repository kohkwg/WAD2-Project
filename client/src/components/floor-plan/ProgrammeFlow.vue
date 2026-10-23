<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getProgramme, saveProgrammeItem, deleteProgrammeItem } from '@/utils/floorPlan'
import { programmePayload, singaporeInput } from '@/utils/floorPlanModel'
const props = defineProps({ eventId: { type: String, required: true }, canEdit: Boolean, planId: { type: String, default: null }, zones: { type: Array, default: () => [] } })
const emit = defineEmits(['loaded'])
const items = ref([]), error = ref(''), loading = ref(false), busy = ref(false), editing = ref(false), pendingDelete = ref(null)
const empty = () => ({ id: null, title: '', description: '', starts_at: '', ends_at: '', location_label: '', zone_key: '' })
const draft = ref(empty())
let generation = 0
onBeforeUnmount(() => { generation++ })
watch(() => props.eventId, load, { immediate: true })
async function load() {
  const token = ++generation; items.value = []; error.value = ''; editing.value = false; pendingDelete.value = null; busy.value = false; loading.value = true
  try { const rows = await getProgramme(props.eventId); if (token === generation) { items.value = rows; emit('loaded', rows.length) } }
  catch (e) { if (token === generation) error.value = e.message }
  finally { if (token === generation) loading.value = false }
}
const ordered = computed(() => [...items.value].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.position - b.position))
function edit(item) { draft.value = item ? { ...item, starts_at: singaporeInput(item.starts_at), ends_at: singaporeInput(item.ends_at) } : empty(); editing.value = true; error.value = '' }
async function save() {
  if (busy.value || !props.canEdit) return
  const token = generation, eid = props.eventId
  error.value = ''; busy.value = true
  try {
    const payload = programmePayload(draft.value, props.zones)
    const row = await saveProgrammeItem(eid, { ...payload, id: draft.value.id, floor_plan_id: payload.zone_key ? props.planId : null, position: items.value.length })
    if (token !== generation) return
    items.value = [...items.value.filter(x => x.id !== row.id), row]; editing.value = false
  } catch (e) { if (token === generation) error.value = e.message }
  finally { if (token === generation) busy.value = false }
}
async function remove() {
  if (busy.value || !props.canEdit) return
  const token = generation, id = pendingDelete.value.id; busy.value = true; error.value = ''
  try { await deleteProgrammeItem(props.eventId, id); if (token === generation) { items.value = items.value.filter(x => x.id !== id); pendingDelete.value = null } }
  catch (e) { if (token === generation) error.value = e.message }
  finally { if (token === generation) busy.value = false }
}
const time = (value) => new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Singapore' }).format(new Date(value))
</script>
<template>
<section class="my-4" aria-label="Programme flow">
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2"><h2 class="h5 mb-0">Programme</h2><button v-if="canEdit" class="btn btn-sm btn-outline-primary" @click="edit(null)" :disabled="busy">Add programme item</button></div>
  <p v-if="loading" role="status">Loading programme…</p>
  <div v-if="error" class="alert alert-danger" role="alert">{{ error }} <button v-if="!editing && !pendingDelete" class="btn btn-sm btn-outline-danger" @click="load">Retry programme</button></div>
  <form v-if="editing && canEdit" class="border rounded p-3 mb-3" @submit.prevent="save">
    <div class="row g-2">
      <label class="col-12">Title<input v-model="draft.title" required maxlength="180" class="form-control" /></label>
      <label class="col-12 col-sm-6">Starts (Singapore)<input v-model="draft.starts_at" required type="datetime-local" class="form-control" /></label>
      <label class="col-12 col-sm-6">Ends (Singapore)<input v-model="draft.ends_at" type="datetime-local" class="form-control" /></label>
      <label class="col-12">Description<textarea v-model="draft.description" class="form-control" maxlength="4000"></textarea></label>
      <label class="col-12 col-sm-6">Location<input v-model="draft.location_label" class="form-control" maxlength="180" /></label>
      <label class="col-12 col-sm-6">Floor-plan zone<select aria-label="Floor-plan zone" v-model="draft.zone_key" class="form-select"><option value="">No zone</option><option v-for="zone in zones" :key="zone.id" :value="zone.id">{{ zone.label }}</option></select></label>
    </div>
    <div class="d-flex gap-2 mt-3"><button class="btn btn-primary" :disabled="busy">Save programme item</button><button type="button" class="btn btn-outline-secondary" :disabled="busy" @click="editing = false">Cancel</button></div>
  </form>
  <div v-if="pendingDelete" class="alert alert-warning" role="alert">Delete “{{ pendingDelete.title }}”? <button class="btn btn-sm btn-danger" :disabled="busy" @click="remove">Confirm delete programme item</button> <button class="btn btn-sm btn-outline-secondary" :disabled="busy" @click="pendingDelete = null">Cancel</button></div>
  <p v-if="!loading && !items.length" class="text-muted">No programme items yet.</p>
  <ol v-else class="list-group list-group-numbered">
    <li v-for="item in ordered" :key="item.id" class="list-group-item d-flex gap-2"><div class="flex-grow-1 programme-copy"><h3 class="h6 mb-1">{{ item.title }}</h3><p class="small mb-1">{{ time(item.starts_at) }}<template v-if="item.ends_at"> – {{ time(item.ends_at) }}</template> (SGT)</p><p v-if="item.description" class="mb-1">{{ item.description }}</p><p class="small text-muted mb-0">{{ item.location_label }}<template v-if="item.zone_key"> · {{ zones.find(z => z.id === item.zone_key)?.label || 'Zone no longer available' }}</template></p><div v-if="canEdit" class="d-flex gap-2 mt-2"><button class="btn btn-sm btn-outline-primary" :disabled="busy" @click="edit(item)">Edit {{ item.title }}</button><button class="btn btn-sm btn-outline-danger" :disabled="busy" @click="pendingDelete = item">Delete {{ item.title }}</button></div></div></li>
  </ol>
</section>
</template>
<style scoped>.programme-copy { min-width: 0; overflow-wrap: anywhere; }</style>

<style scoped>
[aria-label="Programme flow"]{padding:1.1rem 1.25rem;border:1px solid var(--bookedz-border,#e5ded2);border-radius:18px;background:#fffdfa}[aria-label="Programme flow"] h2,[aria-label="Programme flow"] h3{font-family:Georgia,'Times New Roman',serif;letter-spacing:-.02em}[aria-label="Programme flow"] .list-group-item{padding:1rem;border-color:var(--bookedz-border,#e5ded2);background:transparent}[aria-label="Programme flow"] .border.rounded{border-color:var(--bookedz-border,#e5ded2)!important;border-radius:14px!important}[aria-label="Programme flow"] .form-control,[aria-label="Programme flow"] .form-select{min-height:42px;border-color:var(--bookedz-border,#e5ded2);border-radius:10px}[aria-label="Programme flow"] .btn{border-radius:10px;min-height:38px}[aria-label="Programme flow"] .btn-primary{--bs-btn-bg:var(--bookedz-primary-dark,#aa3e2c);--bs-btn-border-color:var(--bookedz-primary-dark,#aa3e2c);--bs-btn-hover-bg:#8f3022;--bs-btn-hover-border-color:#8f3022}
@media(max-width:575.98px){[aria-label="Programme flow"]{padding:1rem;border-radius:16px}}
</style>
