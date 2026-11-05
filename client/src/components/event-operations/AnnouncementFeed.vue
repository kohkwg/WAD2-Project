<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getAnnouncements, watchEventAnnouncements } from '../../utils/api.js'
const props = defineProps({ eventId: { type: String, required: true }, loadEvent: Function })
const emit = defineEmits(['refreshed'])
const posts = ref([])
const loading = ref(false) // the first load and manual refreshes only; background checks are quiet
const error = ref('')
const backgroundError = ref('') // a failed background check keeps the posts already shown
const newIds = ref(new Set()) // posts that arrived since the feed first loaded, briefly highlighted
const editedIds = ref(new Set()) // posts edited since this viewer last saw them, briefly highlighted
const liveMessage = ref('')
let request = 0
let loaded = false
let highlightTimer

// Latest activity first: a post moves back to the top when it is edited
const activityAt = (post) => Date.parse(post.updatedAt || post.createdAt)
const orderedPosts = computed(() => [...posts.value].sort((a, b) => activityAt(b) - activityAt(a)))
const newCount = computed(() => orderedPosts.value.filter(post => newIds.value.has(post.id)).length)
const editedCount = computed(() => orderedPosts.value.filter(post => isEdited(post)).length)
// A post that arrived and was then edited still reads as new
const isEdited = (post) => editedIds.value.has(post.id) && !newIds.value.has(post.id)

function date(value) { return new Date(value).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' }) + ' SGT' }

// includeEvent: also reload the event (manual refresh, or a venue switch arrived)
// quiet: a background check, which doesn't show "Loading" or replace the list on failure
async function refresh({ includeEvent = true, quiet = false } = {}) {
  const ticket = ++request
  const id = props.eventId
  if (!quiet) { loading.value = true; error.value = '' }
  try {
    // Commit both successful reads together so a venue update cannot contradict
    // the parent summary. Standalone feeds need no event loader.
    const [result, event] = await Promise.all([
      getAnnouncements(id),
      includeEvent && props.loadEvent ? props.loadEvent(id) : null,
    ])
    if (ticket !== request || id !== props.eventId) return
    const known = new Map(posts.value.map(post => [post.id, post]))
    const arrived = loaded ? result.filter(post => !known.has(post.id)) : []
    const edited = loaded ? result.filter(post => known.has(post.id) && post.updatedAt && post.updatedAt !== known.get(post.id).updatedAt) : []
    // A venue switch posted by someone else also changed the event, so reload it once
    if (!event && arrived.some(post => post.kind === 'venue-switch') && props.loadEvent) {
      const latest = await props.loadEvent(id)
      if (ticket !== request || id !== props.eventId) return
      emit('refreshed', latest)
    }
    if (event) emit('refreshed', event)
    posts.value = result
    loaded = true
    backgroundError.value = ''
    if (arrived.length || edited.length) highlight(arrived, edited)
  }
  catch (failure) {
    if (ticket !== request) return
    if (quiet) backgroundError.value = 'Couldn’t check for new announcements. Trying again shortly.'
    else error.value = failure.message || 'Announcements could not be loaded.'
  }
  finally { if (ticket === request && !quiet) loading.value = false }
}

function highlight(arrived, edited) {
  newIds.value = new Set([...newIds.value, ...arrived.map(post => post.id)])
  editedIds.value = new Set([...editedIds.value, ...edited.map(post => post.id)])
  const parts = []
  if (arrived.length) parts.push(arrived.length === 1 ? 'New announcement posted.' : `${arrived.length} new announcements posted.`)
  if (edited.length) parts.push(edited.length === 1 ? 'An announcement was edited.' : `${edited.length} announcements were edited.`)
  liveMessage.value = parts.join(' ')
  clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => { newIds.value = new Set(); editedIds.value = new Set() }, 8000)
}

// Every viewer's feed re-reads when the organiser posts, edits or deletes (see api.watchEventAnnouncements)
let stopWatching = () => {}
watch(() => props.eventId, (id) => {
  stopWatching()
  posts.value = []; loaded = false; newIds.value = new Set(); editedIds.value = new Set(); liveMessage.value = ''; backgroundError.value = ''
  refresh({ includeEvent: false })
  stopWatching = watchEventAnnouncements(
    id,
    () => { if (!loading.value) refresh({ includeEvent: false, quiet: true }) },
    (postId) => posts.value.some(post => post.id === postId),
  )
}, { immediate: true })
onBeforeUnmount(() => { request++; stopWatching(); clearTimeout(highlightTimer) })
</script>

<template>
  <section class="card card-body shadow-sm mt-4" aria-labelledby="public-announcements-heading">
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <div class="d-flex flex-wrap align-items-center gap-2">
        <span v-if="newCount" class="badge new-badge">{{ newCount }} new</span>
        <span v-if="editedCount" class="badge edited-badge">{{ editedCount }} edited</span>
        <h2 id="public-announcements-heading" class="h5 mb-0">Event announcements</h2>
      </div>
      <button class="btn btn-sm btn-outline-secondary" type="button" :disabled="loading" @click="refresh()">{{ loading ? 'Refreshing…' : 'Refresh announcements' }}</button>
    </div>
    <p class="form-text mt-0 mb-3">New announcements appear here automatically.</p>
    <p class="visually-hidden" role="status" aria-live="polite">{{ liveMessage }}</p>
    <p v-if="loading && !posts.length" role="status">Loading announcements…</p>
    <div v-dismissible v-if="error" class="alert alert-danger" role="alert">{{ error }} <button class="btn btn-sm btn-outline-danger" type="button" :disabled="loading" @click="refresh()">Retry announcements</button></div>
    <p v-if="backgroundError && !error" class="small text-secondary">{{ backgroundError }}</p>
    <p v-if="!loading && !error && !posts.length" class="text-secondary mb-0">No announcements yet.</p>
    <TransitionGroup name="post" tag="div">
      <article v-for="post in orderedPosts" :key="post.id" class="post" :class="{ 'is-new': newIds.has(post.id), 'is-edited': isEdited(post) }">
        <p class="post-body mb-2">{{ post.body }}</p>
        <p class="small text-secondary mb-0"><span v-if="newIds.has(post.id)" class="badge new-badge me-1">New</span><span v-else-if="isEdited(post)" class="badge edited-badge me-1">Recently edited</span><span v-if="post.kind === 'venue-switch'" class="badge text-bg-info me-1">Venue update</span><time :datetime="post.createdAt">{{ date(post.createdAt) }}</time><span v-if="post.updatedAt"> · Edited {{ date(post.updatedAt) }}</span></p>
      </article>
    </TransitionGroup>
  </section>
</template>
<style scoped>
.post-body { white-space: pre-wrap; overflow-wrap: anywhere; }
.card { border-color: var(--bookedz-border, #e9ded3); border-radius: 18px; background: #ffffff; }
/* Even padding on every post so a highlight frames the text evenly; separators sit between posts */
.post { padding: .85rem 1rem; border-radius: 12px; transition: background-color .6s ease, box-shadow .6s ease; }
.post + .post { margin-top: .5rem; box-shadow: 0 -1px 0 var(--bookedz-border, #e9ded3); }
.post.is-new, .post.is-edited { box-shadow: none; }
.post.is-new + .post, .post.is-edited + .post { box-shadow: none; }
.post.is-new { background: color-mix(in srgb, var(--bookedz-mint, #d8f3e6) 35%, transparent); }
.post.is-edited { background: color-mix(in srgb, var(--bookedz-mango, #fde7b0) 45%, transparent); }
.new-badge { background: var(--bookedz-primary-dark, #b5471b); color: #fff; font-weight: 650; }
.edited-badge { background: #8a5a00; color: #fff; font-weight: 650; }
.post-move, .post-enter-active { transition: opacity .3s ease, transform .3s ease; }
.post-enter-from { opacity: 0; transform: translateY(-6px); }
@media (prefers-reduced-motion: reduce) { .post, .post-move, .post-enter-active { transition: none; } .post-enter-from { transform: none; } }
</style>
