<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useEvents, useRecommendations } from '@/composables/useEvents'
import EventCard from '@/components/EventCard.vue'
import EventFilters from '@/components/EventFilters.vue'

const filters = ref({
  search: '', category: '', tag: '', dateFrom: '', dateTo: '',
  availableOnly: false, sort: 'soonest', page: 1,
})

const { events, total, loading, error, fetchEvents, PAGE_SIZE } = useEvents()
const { recommended, loading: recLoading, error: recError, fetchRecommendations } = useRecommendations()

const loggedIn = ref(false)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

// "For you" only makes sense when no filters are active
const filtersActive = computed(() => {
  const f = filters.value
  return !!(f.search || f.category || f.tag || f.dateFrom || f.dateTo || f.availableOnly)
})

onMounted(async () => {
  const { data } = await supabase.auth.getSession()
  loggedIn.value = !!data.session
  if (loggedIn.value) fetchRecommendations(6)
  fetchEvents(filters.value)
})

watch(filters, (f) => fetchEvents(f), { deep: true })

// Dismissible error + "Clear filters" in the empty state
const errorDismissed = ref(false)
watch(error, () => { errorDismissed.value = false })

// EventFilters keeps its own copy of the filters, so remount it after a reset
const filterKey = ref(0)
function clearFilters() {
  filters.value = {
    search: '', category: '', tag: '', dateFrom: '', dateTo: '',
    availableOnly: false, sort: 'soonest', page: 1,
  }
  filterKey.value++
}

function goToPage(p) {
  filters.value = { ...filters.value, page: p }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <div class="bg-body-tertiary discover-page">
    <main class="container py-4">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <h1 class="h3 fw-bold mb-0">Discover events</h1>
        <RouterLink v-if="loggedIn" to="/profile" class="btn btn-outline-secondary btn-sm">
          Edit interests
        </RouterLink>
      </div>

      <!-- FOR YOU -->
      <section v-if="loggedIn && !filtersActive" class="mb-5" aria-labelledby="for-you">
        <h2 id="for-you" class="h5 fw-bold mb-3">For you</h2>

        <div v-if="recLoading" class="text-center py-4">
          <div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading recommendations</span></div>
        </div>
        <div v-else-if="recError" class="alert alert-danger">{{ recError }}</div>
        <div v-else-if="!recommended.length" class="card card-body shadow-sm text-center text-secondary">
          No recommendations yet. Add interests and your postal code in your
          <RouterLink to="/profile">profile</RouterLink> to get personalised picks.
        </div>
        <div v-else class="row row-cols-1 row-cols-md-2 g-3">
          <div v-for="e in recommended" :key="e.id" class="col">
            <EventCard :event="e" show-reason />
          </div>
        </div>
      </section>

      <!-- BROWSE -->
      <section aria-labelledby="all-events">
        <h2 id="all-events" class="h5 fw-bold mb-3">{{ filtersActive ? 'Results' : 'All upcoming events' }}</h2>
        <EventFilters :key="filterKey" v-model="filters" class="mb-4" />

        <div v-if="loading" class="text-center py-5">
          <div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading events</span></div>
        </div>
        <div v-else-if="error && !errorDismissed" class="alert alert-danger alert-dismissible" role="alert">
          {{ error }}
          <button type="button" class="btn-close" aria-label="Close" @click="errorDismissed = true"></button>
        </div>
        <div v-else-if="!events.length" class="card card-body shadow-sm text-center text-secondary">
          <p class="mb-3">No events match your filters. Try clearing a filter or searching a different word.</p>
          <div><button type="button" class="btn btn-outline-secondary btn-sm" @click="clearFilters">Clear filters</button></div>
        </div>
        <div v-else class="row row-cols-1 row-cols-md-2 g-3">
          <div v-for="e in events" :key="e.id" class="col">
            <EventCard :event="e" />
          </div>
        </div>

        <nav v-if="totalPages > 1" class="mt-4" aria-label="Event pages">
          <ul class="pagination justify-content-center">
            <li class="page-item" :class="{ disabled: filters.page === 1 }">
              <button class="page-link" @click="goToPage(filters.page - 1)">Previous</button>
            </li>
            <li class="page-item disabled"><span class="page-link">{{ filters.page }} / {{ totalPages }}</span></li>
            <li class="page-item" :class="{ disabled: filters.page === totalPages }">
              <button class="page-link" @click="goToPage(filters.page + 1)">Next</button>
            </li>
          </ul>
        </nav>
      </section>
    </main>
  </div>
</template>

<style scoped>
.discover-page { min-height: 100vh; }
</style>
