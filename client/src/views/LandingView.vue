<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import DiscoveryHero from '@/components/discovery/DiscoveryHero.vue'
import { useDiscoveryMotion } from '@/composables/useDiscoveryMotion'
import { useEvents } from '@/composables/useEvents'
import { normalizeDiscoveryFilters, discoveryEventQuery, discoveryUrlQuery } from '@/lib/discoveryFilters'

const router = useRouter()
const pageRoot = ref(null)
useDiscoveryMotion(pageRoot)
const filters = ref(normalizeDiscoveryFilters())
const search = ref('')
const query = computed(() => discoveryEventQuery(filters.value, { search: search.value }))
const { total, loading, error, fetchEvents } = useEvents()
// The hero map shows every upcoming mapped event, independent of the typed filters.
const { events: mapEvents, loading: mapLoading, error: mapError, fetchEvents: fetchMapEvents } = useEvents()
function refreshCount() { fetchEvents({ ...query.value, countOnly: true }) }
watch(query, refreshCount, { immediate: true })
fetchMapEvents({ forMap: true })
function explore(mode) {
  router.push({ path: '/discover', query: discoveryUrlQuery(filters.value, search.value, mode === 'map' ? 'map' : 'list') })
}
</script>

<template>
  <div ref="pageRoot" class="landing-page">
    <DiscoveryHero v-model="filters" v-model:search="search" :total="total" :loading="loading" :error="error" :map-events="mapEvents" :map-loading="mapLoading" :map-error="mapError" @retry="refreshCount" @mode="explore" />
  </div>
</template>

<style scoped>
.landing-page { --discover-gutter: 24px; min-height: calc(100svh - 150px); }
.landing-page :deep(.discovery-hero) { min-height: inherit; padding-block: 28px; }
@media(max-width:991.98px) { .landing-page { --discover-gutter: 12px; }.landing-page :deep(.discovery-hero) { padding-top: 40px; } }
</style>
