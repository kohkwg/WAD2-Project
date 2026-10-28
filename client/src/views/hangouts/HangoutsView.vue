<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { getHangouts } from '../../utils/api.js'

// F5/F6 entry point: the signed-in user's group hangouts and solo plans.

const hangouts = ref([])
const loading = ref(true)
const errorMessage = ref('')

const STATUS_LABELS = { collecting: 'Collecting availability', slot_locked: 'Time locked', planned: 'Planned', cancelled: 'Cancelled' }

function formatRange(hangout) {
  const options = { day: 'numeric', month: 'short' }
  const from = new Date(hangout.dateFrom).toLocaleDateString('en-SG', options)
  const to = new Date(hangout.dateTo).toLocaleDateString('en-SG', options)
  return from === to ? from : `${from} – ${to}`
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    hangouts.value = await getHangouts()
  } catch (error) {
    errorMessage.value = 'Could not load your hangouts: ' + error.message
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <header class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
    <div><h1 class="mb-1">Hangouts</h1><p class="text-secondary mb-0">Find a time, plan the day, and see where everyone is.</p></div>
    <div class="d-flex gap-2">
      <RouterLink to="/hangouts/new?mode=solo" class="btn btn-outline-primary">Plan solo</RouterLink>
      <RouterLink to="/hangouts/new" class="btn btn-primary">New hangout</RouterLink>
    </div>
  </header>

  <div v-if="loading" class="text-center my-5" role="status" aria-live="polite">
    <div class="spinner-border text-primary" aria-hidden="true"></div>
    <span class="visually-hidden">Loading your hangouts…</span>
  </div>

  <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
    {{ errorMessage }}
    <button type="button" class="btn btn-sm btn-outline-danger ms-2" @click="load">Retry</button>
  </div>

  <div v-else-if="hangouts.length === 0" class="text-center my-5">
    <h2 class="h4">No hangouts yet</h2>
    <p class="text-secondary">Start one and invite your friends, or plan an afternoon for yourself.</p>
  </div>

  <div v-else class="row row-cols-1 row-cols-md-2 g-3">
    <div v-for="hangout in hangouts" :key="hangout.id" class="col">
      <article class="card h-100" :data-testid="'hangout-' + hangout.id">
        <div class="card-body">
          <div class="d-flex flex-wrap gap-2 mb-2">
            <span class="badge" :class="hangout.mode === 'solo' ? 'text-bg-secondary' : 'text-bg-primary'">{{ hangout.mode === 'solo' ? 'Solo' : 'Group' }}</span>
            <span class="badge text-bg-light">{{ STATUS_LABELS[hangout.status] }}</span>
          </div>
          <h2 class="h5 card-title mb-1">{{ hangout.title }}</h2>
          <p class="small text-secondary mb-0">
            {{ formatRange(hangout) }}<template v-if="hangout.areaName"> · {{ hangout.areaName }}</template>
            <template v-if="hangout.mode === 'group'"> · {{ hangout.members.length }} {{ hangout.members.length === 1 ? 'person' : 'people' }}</template>
          </p>
        </div>
        <footer class="card-footer bg-transparent">
          <RouterLink :to="'/hangouts/' + hangout.id" class="btn btn-sm btn-primary">Open</RouterLink>
        </footer>
      </article>
    </div>
  </div>
</template>
