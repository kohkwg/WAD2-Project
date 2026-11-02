<script setup>
import { computed, onMounted, ref } from 'vue'

// Success state after creating a hangout: a ticket-style slip with the share link.
const props = defineProps({ event: { type: Object, required: true } })
const emit = defineEmits(['open'])
const heading = ref(null)
const copyState = ref('')
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

const mode = computed(() => props.event.hangout?.mode)
const link = computed(() => {
  if (mode.value === 'group') return `${location.origin}/j/${props.event.hangout.inviteToken}`
  if (mode.value === 'public') return `${location.origin}/events/${props.event.id}/rsvp`
  return ''
})
const when = computed(() => {
  const opts = { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }
  const range = props.event.hangout?.dateRange
  if (range) return `${new Date(`${range.start}T12:00:00+08:00`).toLocaleDateString('en-SG', opts)} – ${new Date(`${range.end}T12:00:00+08:00`).toLocaleDateString('en-SG', opts)} · time to be chosen together`
  const start = new Date(props.event.startTime), end = new Date(props.event.endTime)
  const time = d => d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' })
  return `${start.toLocaleDateString('en-SG', opts)} · ${time(start)} – ${time(end)}`
})

async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    copyState.value = 'Link copied.'
  } catch {
    copyState.value = 'Couldn’t copy automatically. Select the link and copy it.'
  }
}
async function share() {
  try { await navigator.share({ title: props.event.title, text: `Join my hangout: ${props.event.title}`, url: link.value }) } catch { /* Dismissed share sheets need no message. */ }
}
onMounted(() => heading.value?.focus())
</script>

<template>
  <section class="invite-slip" aria-labelledby="invite-slip-title">
    <p class="slip-stamp" aria-hidden="true">Steady lah!</p>
    <h1 id="invite-slip-title" ref="heading" tabindex="-1">{{ mode === 'solo' ? 'Your plan is ready' : 'Your hangout is ready' }}</h1>
    <div class="slip">
      <div class="slip-main">
        <p class="slip-kicker">{{ mode === 'group' ? 'Private invite' : mode === 'public' ? 'Open Jio' : 'Solo plan' }}</p>
        <h2>{{ event.title }}</h2>
        <p>{{ when }}</p>
        <p>Starting from {{ event.venue?.name }}</p>
      </div>
      <div class="slip-stub" aria-hidden="true"><span>{{ mode === 'solo' ? '1' : event.capacity }}</span>{{ mode === 'solo' ? 'person' : 'max' }}</div>
    </div>
    <template v-if="link">
      <label class="form-label mt-4" for="invite-link">{{ mode === 'group' ? 'Share this private link with your friends' : 'Anyone can find and join from this link' }}</label>
      <div class="link-row">
        <input id="invite-link" class="form-control" :value="link" readonly @focus="$event.target.select()">
        <button type="button" class="btn btn-outline-secondary" @click="copy">Copy link</button>
        <button v-if="canShare" type="button" class="btn btn-outline-secondary" @click="share">Share</button>
      </div>
      <p class="form-text" role="status">{{ copyState }}</p>
    </template>
    <button type="button" class="btn event-cta mt-2" @click="emit('open')">Go to hangout</button>
  </section>
</template>

<style scoped>
.invite-slip { position: relative; max-width: 40rem; margin: 1rem auto 2rem; animation: slip-arrive var(--bookedz-motion-reveal) var(--bookedz-ease) both; }
.invite-slip h1:focus { outline: none; }
@keyframes slip-arrive { from { opacity: 0; transform: translateY(14px) rotate(-1deg); } to { opacity: 1; transform: none; } }
.slip-stamp { position: absolute; top: -6px; right: 0; margin: 0; padding: 6px 12px; border: 2px solid var(--bookedz-pink); border-radius: 10px; color: var(--bookedz-pink-ink); font: 900 .85rem var(--bookedz-heading); transform: rotate(6deg); }
.slip { display: flex; margin-top: 1rem; border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); background: var(--bookedz-surface); box-shadow: var(--bookedz-preview-shadow); overflow: hidden; }
.slip-main { flex: 1; min-width: 0; padding: 22px 24px; }
.slip-main h2 { font-size: 1.4rem; margin: 4px 0 8px; overflow-wrap: anywhere; }
.slip-main p { margin: 0 0 4px; color: var(--bookedz-muted); }
.slip-main .slip-kicker { color: var(--bookedz-teal-ink); font-weight: 800; font-size: .75rem; letter-spacing: .05em; text-transform: uppercase; }
.slip-stub { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 96px; border-left: 2px dashed var(--bookedz-border); background: var(--bookedz-orange-soft); color: var(--bookedz-primary-dark); font-size: .75rem; font-weight: 700; text-transform: uppercase; }
.slip-stub span { font: 900 2rem var(--bookedz-heading); font-variant-numeric: tabular-nums; }
.link-row { display: flex; gap: 8px; }
.link-row .form-control { font-size: .85rem; }
@media (max-width: 575.98px) { .link-row { flex-wrap: wrap; } .link-row .btn { flex: 1; } .slip-stub { width: 72px; } .slip-stamp { position: static; display: inline-block; margin-bottom: 8px; } }
@media (prefers-reduced-motion: reduce) { .invite-slip { animation: none; } .slip-stamp { transform: none; } }
</style>
