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
function refreshCount() { fetchEvents({ ...query.value, countOnly: true }) }
watch(query, refreshCount, { immediate: true })
function explore(mode) {
  router.push({ path: '/discover', query: discoveryUrlQuery(filters.value, search.value, mode === 'map' ? 'map' : 'list') })
}
</script>

<template>
  <div ref="pageRoot" class="landing-page">
    <DiscoveryHero v-model="filters" v-model:search="search" :total="total" :loading="loading" :error="error" @retry="refreshCount" @mode="explore" />
  </div>
</template>

<style scoped>
.landing-page { --discover-gutter: 24px; min-height: calc(100svh - 150px); }
.landing-page :deep(.discovery-hero) { min-height: inherit; padding-block: 28px; }
@media(max-width:991.98px) { .landing-page { --discover-gutter: 12px; }.landing-page :deep(.discovery-hero) { padding-top: 82px; } }
</style>
