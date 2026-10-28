<script setup>
// Discover (F1 merge): deals and outside events next to hosted events.
// Data is sample seed data until the scraping work (F8) fills the tables.
import { ref, onMounted } from 'vue'
import { getDeals, getExternalEvents } from '../../utils/api.js'
import PlaceholderPanel from './PlaceholderPanel.vue'

const deals = ref([])
const outsideEvents = ref([])
const loading = ref(true)
const errorMessage = ref('')

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function validDays(deal) {
  return deal.daysOfWeek.length ? deal.daysOfWeek.map((d) => DAY_NAMES[d]).join(', ') : 'Every day'
}

function validTimes(deal) {
  return deal.timeWindows.length ? deal.timeWindows.map((w) => `${w.start}–${w.end}`).join(', ') : 'All day'
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

onMounted(async () => {
  try {
    ;[deals.value, outsideEvents.value] = await Promise.all([getDeals(), getExternalEvents()])
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="deals-section container-fluid px-0 my-5" aria-labelledby="deals-title">
    <h2 id="deals-title" class="h4 mb-1">Deals and outside events</h2>
    <p class="small text-secondary mb-3">Sample data for now. Live deals will come from Singapore deal channels.</p>

    <div v-if="loading" class="text-center my-3" role="status"><div class="spinner-border spinner-border-sm" aria-hidden="true"></div><span class="visually-hidden">Loading deals…</span></div>
    <p v-else-if="errorMessage" class="small text-secondary" role="status">{{ errorMessage }}</p>
    <template v-else>
      <div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3 mb-3">
        <div v-for="deal in deals" :key="deal.id" class="col">
          <article class="card h-100" :data-testid="'deal-' + deal.id">
            <div class="card-body">
              <span class="badge text-bg-success mb-2">Deal</span>
              <h3 class="h6 card-title mb-1">{{ deal.title }}</h3>
              <p class="small text-secondary mb-2">{{ deal.merchant }} · {{ deal.outlets.map((o) => o.name).join(', ') }}</p>
              <p class="small mb-1">{{ validDays(deal) }} · {{ validTimes(deal) }}</p>
              <p v-if="deal.conditions.length" class="small text-secondary mb-0">{{ deal.conditions.join(' · ') }}</p>
            </div>
          </article>
        </div>
        <div v-for="item in outsideEvents" :key="item.id" class="col">
          <article class="card h-100" :data-testid="'external-event-' + item.id">
            <div class="card-body">
              <span class="badge text-bg-info mb-2">Outside event</span>
              <h3 class="h6 card-title mb-1">{{ item.title }}</h3>
              <p class="small text-secondary mb-2">{{ item.venueName }}</p>
              <p class="small mb-0">{{ formatDateTime(item.startsAt) }} · {{ item.priceText }}</p>
            </div>
          </article>
        </div>
      </div>
      <PlaceholderPanel
        title="Merged feed and ranking"
        description="Deals and outside events will be ranked together with hosted events, shown on the map, and addable to a hangout."
        waiting-on="F1 Discover merge and F8 ingestion"
      />
    </template>
  </section>
</template>
