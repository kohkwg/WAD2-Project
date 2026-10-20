<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { validCoordinates } from '../../utils/feature4Weather.js'
import ConfirmationDialog from './ConfirmationDialog.vue'
const props = defineProps({ event: { type: Object, required: true }, forecast: Object, areas: { type: Array, default: () => [] }, areaOverride: String, loading: Boolean, pending: Boolean, error: String, actionError: String, areasError: String })
const emit = defineEmits(['refresh', 'saveArea', 'switchVenue', 'cancel-action'])
const selectedArea = ref(props.areaOverride || '')
const confirming = ref(false)
const now = ref(Date.now())
let expiryTimer
const hasCoordinates = computed(() => {
  const venue = props.event.originalVenue || props.event.venue
  return validCoordinates(venue?.lat, venue?.lng)
})
const expired = computed(() => !props.forecast?.validUntil || Date.parse(props.forecast.validUntil) <= now.value || Date.parse(props.event.endTime) <= now.value)
const canSwitch = computed(() => props.forecast?.canSwitch && !expired.value && !props.loading && !props.pending)
const reason = computed(() => props.forecast?.canSwitch && expired.value ? 'This forecast or event has expired. Refresh weather to check again.' : props.forecast?.reason)
watch(() => props.areaOverride, value => { selectedArea.value = value || '' })
watch(() => [props.forecast?.validUntil, props.event.endTime], () => {
  clearTimeout(expiryTimer); now.value = Date.now()
  const deadlines = [Date.parse(props.forecast?.validUntil), Date.parse(props.event.endTime)].filter(value => Number.isFinite(value) && value > now.value)
  if (deadlines.length) expiryTimer = setTimeout(() => { now.value = Date.now() }, Math.min(Math.min(...deadlines) - now.value + 10, 2147483647))
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(expiryTimer))
function date(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not available'
  return new Date(value).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' }) + ' SGT'
}
function confirm() {
  now.value = Date.now()
  if (!canSwitch.value) { confirming.value = false; return }
  emit('switchVenue', { done: () => { confirming.value = false } })
}
function cancelSwitch() { confirming.value = false; emit('cancel-action') }
</script>

<template>
  <section aria-labelledby="weather-heading">
    <div class="tool-heading">
      <div><h2 id="weather-heading" tabindex="-1">Weather</h2><p class="tool-description">Check conditions and the backup plan before moving your event.</p></div>
      <button type="button" class="btn btn-outline-primary" :disabled="loading || pending" @click="emit('refresh')">{{ loading ? 'Refreshing weather…' : 'Refresh weather' }}</button>
    </div>
    <div v-if="!hasCoordinates" class="workspace-panel mb-3">
      <h3 class="section-heading">Choose the venue’s forecast area</h3>
      <p class="text-secondary">Select a nearby forecast area for this venue. Map coordinates are missing or invalid.</p>
      <form @submit.prevent="emit('saveArea', { input: selectedArea })">
        <fieldset :disabled="loading || pending">
          <label for="forecast-area" class="form-label">Forecast area</label>
          <div class="d-flex flex-wrap gap-2">
            <select id="forecast-area" v-model="selectedArea" class="form-select area-select" required><option disabled value="">Select an area</option><option v-for="area in areas" :key="area.name" :value="area.name">{{ area.name }}</option></select>
            <button type="submit" class="btn btn-primary" :disabled="!selectedArea || !areas.length">Save forecast area</button>
          </div>
        </fieldset>
      </form>
      <p v-if="areasError" class="text-danger mt-2 mb-0" role="alert">{{ areasError }} <button type="button" class="btn btn-sm btn-outline-danger" :disabled="loading" @click="emit('refresh')">Retry areas</button></p>
    </div>
    <p v-if="loading" role="status">Loading the latest forecast…</p>
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }} <button type="button" class="btn btn-sm btn-outline-danger" :disabled="loading" @click="emit('refresh')">Retry weather</button></div>
    <div class="weather-grid">
      <div v-if="forecast" class="workspace-panel">
        <p class="text-secondary small mb-2">Two-hour forecast · data.gov.sg</p>
        <h3 class="forecast-condition">{{ forecast.available ? forecast.forecast : 'Forecast unavailable' }}</h3>
        <p class="mb-2"><strong>{{ forecast.area || 'Area not selected' }}</strong><span v-if="forecast.areaSource" class="text-secondary"> · {{ forecast.areaSource === 'coordinates' ? 'nearest area to venue coordinates' : 'manual choice' }}</span></p>
        <p v-if="forecast.available" class="small text-secondary">Valid until {{ date(forecast.validUntil) }}</p>
        <p v-if="reason" class="mb-0" role="status">{{ reason }}</p>
        <p class="small text-secondary mt-3 mb-0">Forecast areas approximate local conditions.</p>
      </div>
      <div class="workspace-panel">
        <h3 class="section-heading">Active venue</h3>
        <p class="mb-1 fw-semibold">{{ event.venue?.name }}</p><p class="text-secondary venue-address">{{ event.venue?.address }}</p>
        <p v-if="event.usingBackup" class="alert alert-success mb-0">The backup venue is active. Participants can see its address and the venue update.</p>
        <template v-else>
          <h3 class="section-heading mt-4">Backup venue</h3>
          <template v-if="event.backupVenue"><p class="mb-1 fw-semibold">{{ event.backupVenue.name }}</p><p class="text-secondary venue-address">{{ event.backupVenue.address }}</p></template>
          <p v-else class="text-secondary">No backup venue configured.</p>
          <template v-if="canSwitch"><p class="text-warning-emphasis">Rain is forecast for this event. You can move to the backup venue.</p><button type="button" class="btn btn-primary" @click="confirming = true">Switch to backup venue</button></template>
        </template>
      </div>
    </div>
    <details v-if="forecast" class="forecast-details mt-4">
      <summary>Forecast details</summary>
      <dl class="row mt-3 mb-0"><dt class="col-sm-4">Forecast area</dt><dd class="col-sm-8">{{ forecast.area || 'Not selected' }}</dd><dt class="col-sm-4">Issued</dt><dd class="col-sm-8">{{ date(forecast.issuedAt) }}</dd><dt class="col-sm-4">Last updated</dt><dd class="col-sm-8">{{ date(forecast.updatedAt) }}</dd><dt class="col-sm-4">Valid from</dt><dd class="col-sm-8">{{ date(forecast.validFrom) }}</dd><dt class="col-sm-4">Valid until</dt><dd class="col-sm-8">{{ date(forecast.validUntil) }}</dd></dl>
    </details>
    <ConfirmationDialog v-if="confirming" title="Switch to backup venue?" focus-fallback="#weather-heading" confirm-label="Confirm switch" confirm-variant="primary" :confirm-disabled="!canSwitch" :pending="pending" :error="actionError" @cancel="cancelSwitch" @confirm="confirm">
      <p>The active venue will change from <strong>{{ event.venue?.name }}</strong> to:</p><p><strong>{{ event.backupVenue?.name }}</strong><br />{{ event.backupVenue?.address }}</p><p>A public venue update will be posted. This switch is one-way.</p><p v-if="!canSwitch && !pending" class="text-danger">This suggestion is no longer current. Cancel and refresh the forecast.</p>
    </ConfirmationDialog>
  </section>
</template>
<style scoped>
.area-select { max-width: 24rem; }
.weather-grid { display: grid; gap: 1rem; }
.forecast-condition { font-size: 1.5rem; font-weight: 600; margin-bottom: .75rem; }
.venue-address { overflow-wrap: anywhere; }
.forecast-details { max-width: 48rem; color: var(--bookedz-muted); }
.forecast-details summary { cursor: pointer; }
@media (min-width: 992px) { .weather-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
</style>
