<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { getAnnouncements } from '../../utils/api.js'
const props = defineProps({ eventId: { type: String, required: true }, loadEvent: Function })
const emit = defineEmits(['refreshed'])
const posts = ref([])
const loading = ref(false)
const error = ref('')
let request = 0
function date(value) { return new Date(value).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' }) + ' SGT' }
async function refresh(includeEvent = true) {
  const ticket = ++request
  const id = props.eventId
  loading.value = true; error.value = ''
  try {
    // Commit both successful reads together so a venue update cannot contradict
    // the parent summary. Standalone feeds need no event loader.
    const [result, event] = await Promise.all([
      getAnnouncements(id),
      includeEvent && props.loadEvent ? props.loadEvent(id) : null,
    ])
    if (ticket !== request || id !== props.eventId) return
    if (event) emit('refreshed', event)
    posts.value = result
  }
  catch (failure) { if (ticket === request) error.value = failure.message || 'Announcements could not be loaded.' }
  finally { if (ticket === request) loading.value = false }
}
watch(() => props.eventId, () => { posts.value = []; refresh(false) }, { immediate: true })
onBeforeUnmount(() => { request++ })
</script>

<template>
  <section class="card card-body shadow-sm mt-4" aria-labelledby="public-announcements-heading">
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"><h2 id="public-announcements-heading" class="h5 mb-0">Event announcements</h2><button class="btn btn-sm btn-outline-secondary" type="button" :disabled="loading" @click="refresh()">{{ loading ? 'Refreshing…' : 'Refresh announcements' }}</button></div>
    <p v-if="loading" role="status">Loading announcements…</p>
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }} <button class="btn btn-sm btn-outline-danger" type="button" :disabled="loading" @click="refresh()">Retry announcements</button></div>
    <p v-if="!loading && !error && !posts.length" class="text-secondary mb-0">No announcements yet.</p>
    <article v-for="post in posts" :key="post.id" class="post border-top pt-3 mt-2">
      <p class="post-body mb-2">{{ post.body }}</p>
      <p class="small text-secondary"><span v-if="post.kind === 'venue-switch'" class="badge text-bg-info me-1">Venue update</span><time :datetime="post.createdAt">{{ date(post.createdAt) }}</time><span v-if="post.updatedAt"> · Edited {{ date(post.updatedAt) }}</span></p>
    </article>
  </section>
</template>
<style scoped>
.post-body { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
