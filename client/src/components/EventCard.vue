<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  event: { type: Object, required: true },
  showReason: { type: Boolean, default: false },
})
const timeLabel = computed(() => new Date(props.event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
const isFull = computed(() => props.event.spots_left != null && Number(props.event.spots_left) === 0)
const coverStyle = computed(() => {
  let hash = 0
  for (const c of props.event.category || 'event') hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  const hue = hash % 360
  return { background: `radial-gradient(circle at 85% 15%, hsl(${(hue + 45) % 360} 80% 90%), transparent 65%), linear-gradient(140deg, hsl(${hue} 65% 86%), hsl(${(hue + 30) % 360} 55% 68%))`, color: `hsl(${hue} 40% 25%)` }
})
</script>

<template>
  <article class="event-card">
    <div class="event-details">
      <time class="event-time" :datetime="event.start_time">{{ timeLabel }}</time>
      <h3 class="event-title">{{ event.title }}</h3>
      <p v-if="event.venue_name" class="venue-line">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
        {{ event.venue_name }}
      </p>
      <p v-if="showReason && event.reason" class="small text-primary mb-2">{{ event.reason }}</p>
      <div class="event-status">
        <span class="going-count">{{ event.confirmed_count ?? 0 }} going</span>
        <span v-if="isFull" class="badge full-badge">Full</span>
      </div>
      <div class="event-actions">
        <RouterLink :to="`/events/${event.id}`" class="btn btn-outline-secondary btn-sm" :aria-label="`View ${event.title}`">View event</RouterLink>
      </div>
    </div>
    <img v-if="event.image_url" :src="event.image_url" :alt="`Cover for ${event.title}`" class="event-cover event-cover-image" loading="lazy" />
    <div v-else class="event-cover" :style="coverStyle" role="img" :aria-label="`${event.category || 'Event'} category placeholder`">
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><circle cx="60" cy="60" r="42" /><circle cx="60" cy="60" r="28" /><path d="M18 60h84M60 18v84M30 30l60 60M90 30 30 90" /></svg>
      <span>{{ event.category || 'Event' }}</span>
    </div>
  </article>
</template>

<style scoped>
.event-card { display: flex; justify-content: space-between; gap: 24px; padding: 22px; border: 1px solid #e4e6eb; border-radius: 20px; background: white; box-shadow: 0 5px 18px #23304704; transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease; }
@media (hover: hover) {
  .event-card:hover { transform: translateY(-2px); border-color: #cbd2dc; box-shadow: 0 8px 24px #23304712; }
}
.event-card:focus-within { border-color: #cbd2dc; box-shadow: 0 8px 24px #23304712; }
@media (prefers-reduced-motion: reduce) {
  .event-card { transition: none; }
  .event-card:hover { transform: none; }
}
.event-details { flex: 1; min-width: 0; }
.event-time { display: block; color: #737b88; font-size: .95rem; margin-bottom: 9px; }
.event-title { font-size: 1.35rem; font-weight: 650; line-height: 1.3; letter-spacing: -.025em; margin-bottom: 12px; overflow-wrap: anywhere; }
.venue-line { display: flex; align-items: center; gap: 7px; color: #737b88; font-size: .95rem; margin-bottom: 14px; }
.venue-line svg { width: 18px; height: 18px; flex-shrink: 0; }
.event-status { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-height: 24px; }
.going-count { color: #737b88; font-size: .85rem; }
.full-badge { background: #fff1d8; color: #82580e; }
.event-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.event-actions .btn { min-width: 70px; border-radius: 8px; }
.event-cover { position: relative; align-self: flex-start; flex: 0 0 156px; height: 156px; overflow: hidden; border-radius: 14px; display: flex; align-items: flex-end; padding: 14px; }
.event-cover span { position: relative; font-weight: 650; text-transform: capitalize; font-size: .9rem; }
.event-cover svg { position: absolute; width: 150px; height: 150px; right: -28px; top: -24px; stroke: currentColor; opacity: .2; stroke-width: 1; }
.event-cover-image { width: 156px; object-fit: cover; }
@media (max-width: 575px) {
  .event-card { gap: 14px; padding: 18px; border-radius: 16px; }
  .event-title { font-size: 1.15rem; }
  .event-cover { flex-basis: 88px; height: 104px; padding: 9px; border-radius: 10px; }
  .event-cover span { font-size: .7rem; }
  .event-cover-image { width: 88px; }
}
@media (max-width: 359px) {
  .event-card { flex-direction: column-reverse; }
  .event-cover { width: 100%; flex-basis: auto; height: 100px; }
}
.event-cover-image { padding: 0; }
</style>
