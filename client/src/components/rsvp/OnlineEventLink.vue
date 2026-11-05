<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getEventOnlineAccess } from '../../utils/api.js'

// An online event's link on its public page. The backend decides who gets the link (the
// organiser, or confirmed attendees once its time has come); everyone else is told when it
// appears. refreshKey changes when the viewer's RSVP changes, so a new confirmation shows it.
const props = defineProps({
  eventId: { type: String, required: true },
  isOrganiser: Boolean,
  refreshKey: { type: String, default: '' },
})

const access = ref(null)
const loading = ref(true)
const error = ref('')
let request = 0
let revealTimer

async function load() {
  const ticket = ++request
  clearTimeout(revealTimer)
  loading.value = true
  error.value = ''
  try {
    const result = await getEventOnlineAccess(props.eventId)
    if (ticket !== request) return
    access.value = result
    // Ask again when the link is due, if that's within the next day and the page is still open
    const wait = Date.parse(result?.revealAt) - Date.now()
    if (result?.hasLink && !result.url && wait > 0 && wait < 864e5) revealTimer = setTimeout(load, wait + 1000)
  } catch (failure) {
    if (ticket === request) error.value = failure.message || 'Could not load the online link.'
  } finally {
    if (ticket === request) loading.value = false
  }
}
watch(() => [props.eventId, props.refreshKey], load, { immediate: true })
onBeforeUnmount(() => { request++; clearTimeout(revealTimer) })

const revealLabel = computed(() => {
  const reveal = new Date(access.value?.revealAt)
  return Number.isNaN(reveal.getTime()) ? '' : new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short' }).format(reveal)
})
const revealed = computed(() => Date.parse(access.value?.revealAt) <= Date.now())
</script>

<template>
  <section class="online-link" aria-labelledby="online-link-heading">
    <h2 id="online-link-heading" class="online-link-heading">Online event</h2>
    <p v-if="loading" class="mb-0" role="status">Checking the online link…</p>
    <p v-else-if="error" class="text-danger mb-0" role="alert">
      {{ error }}
      <button type="button" class="btn btn-sm btn-outline-danger ms-1" @click="load">Try again</button>
    </p>
    <template v-else-if="access?.url">
      <a class="btn event-cta online-link-open" :href="access.url" target="_blank" rel="noopener noreferrer">
        Join online<span class="visually-hidden"> (opens in a new tab)</span>
      </a>
      <p class="online-link-url">{{ access.url }}</p>
      <p v-if="isOrganiser" class="online-link-note mb-0">
        {{ revealed ? 'Confirmed attendees can open this link now.' : `Confirmed attendees can open it from ${revealLabel}.` }}
      </p>
    </template>
    <p v-else-if="access?.hasLink" class="online-link-note mb-0" role="status">
      {{ revealed ? 'The link is available to confirmed attendees.' : `The link appears here on ${revealLabel} for confirmed attendees.` }}
    </p>
    <p v-else class="online-link-note mb-0">The organiser hasn't added the link yet. It will appear here for confirmed attendees.</p>
  </section>
</template>

<style scoped>
.online-link { margin: 1rem 0 0; padding: 1rem; border: 1px solid var(--bookedz-border); border-radius: 14px; background: color-mix(in srgb, var(--bookedz-mint) 18%, var(--bookedz-surface)); }
.online-link-heading { margin: 0 0 .5rem; color: var(--bookedz-ink); font-size: 1rem; font-weight: 700; }
.online-link-open { min-height: 44px; }
.online-link-url { margin: .5rem 0 0; color: var(--bookedz-muted); font-size: .85rem; overflow-wrap: anywhere; }
.online-link-note { margin-top: .5rem; color: var(--bookedz-muted); font-size: .9rem; }
</style>
