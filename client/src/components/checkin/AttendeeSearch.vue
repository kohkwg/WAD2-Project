<script setup>
// BOILERPLATE: manual check-in at the station. Search confirmed attendees by name
// (and email, for organisers) and pick one; the parent checks them in.
import { computed, onMounted, ref } from 'vue'
import { listAttendees } from '@/utils/checkin'

const props = defineProps({
  eventId: { type: String, required: true },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['pick'])

const people = ref([])
const query = ref('')
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    people.value = await listAttendees(props.eventId)
  } catch (e) {
    error.value = e.message ?? 'Could not load attendees.'
  } finally {
    loading.value = false
  }
}

const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return people.value
    .filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    .slice(0, 8)
})

// The parent checks them in and calls done(ok); only mark them as in on success
function pick(person) {
  emit('pick', person.id, (ok) => {
    if (ok) person.checkedIn = true
  })
}

onMounted(load)
defineExpose({ reload: load })
</script>

<template>
  <div>
    <label for="attendee-search" class="form-label small text-body-secondary">Find by name or email</label>
    <input
      id="attendee-search"
      v-model="query"
      type="search"
      class="form-control"
      placeholder="e.g. Tan or tan@example.com"
      autocomplete="off"
      :disabled="loading"
    />
    <div v-if="loading" class="small text-body-secondary mt-2">
      <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Loading attendees…
    </div>
    <div v-else-if="error" class="alert alert-danger small mt-2 mb-0" role="alert">{{ error }}</div>
    <p v-else-if="query.trim() && !matches.length" class="small text-body-secondary mt-2 mb-0">
      No confirmed attendee matches “{{ query.trim() }}”.
    </p>
    <ul v-if="matches.length" class="list-group mt-2" aria-label="Matching attendees">
      <li
        v-for="p in matches"
        :key="p.id"
        class="list-group-item d-flex justify-content-between align-items-center gap-2"
      >
        <span class="text-truncate">
          {{ p.name }}
          <span v-if="p.email" class="small text-body-secondary d-block text-truncate">{{ p.email }}</span>
        </span>
        <span v-if="p.checkedIn" class="badge text-bg-success">In</span>
        <button
          v-else
          type="button"
          class="btn btn-sm btn-primary text-nowrap"
          :disabled="busy"
          @click="pick(p)"
        >
          Check in
        </button>
      </li>
    </ul>
  </div>
</template>
