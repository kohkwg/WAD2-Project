<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  event: { type: Object, required: true },
  showReason: { type: Boolean, default: false },
})
const timeLabel = computed(() => new Date(props.event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
const isFull = computed(() => props.event.spots_left != null && Number(props.event.spots_left) === 0)
const categoryLabel = computed(() => (props.event.category || 'Event').replace(/[_-]/g, ' '))
const savedLocation = computed(() => [...new Set([props.event.venue_name, props.event.venue_address]
  .filter(value => typeof value === 'string' && value.trim())
  .map(value => value.trim()))].join(' · '))
// Preview-only fallback requested for events that do not yet have a venue.
const demoLocations = {
  sports: 'Campus Futsal Court · 21 Campus Walk',
  tech: 'Innovation Lab · 8 University Avenue',
  hackathon: 'Innovation Lab · 8 University Avenue',
  music: 'Campus Concert Hall · 12 Arts Avenue',
  arts: 'Creative Studio · 5 Gallery Walk',
  food: 'Campus Food Court · 3 Student Plaza',
  networking: 'Student Lounge · 10 Campus Walk',
}
const locationLabel = computed(() => savedLocation.value
  || demoLocations[(props.event.category || '').toLowerCase()]
  || 'Campus Activity Centre · 1 University Walk')
const attendees = computed(() => props.event.attendees || [])
const remainingAttendees = computed(() => Math.max(0, Number(props.event.confirmed_count || 0) - attendees.value.length))
const failedAvatarUrls = ref(new Set())
function avatarUrl(attendee) {
  const key = attendee.avatar_url || attendee.avatar_key
  if (!key) return ''
  if (/^https?:\/\//i.test(key)) return key
  const base = import.meta.env?.VITE_R2_PUBLIC_URL
  if (!base || !/^https?:\/\//i.test(base)) return ''
  return `${base.replace(/\/$/, '')}/${key.replace(/^\//, '').split('/').map(encodeURIComponent).join('/')}`
}
function initials(attendee) {
  return (attendee.display_name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}
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
      <span class="category-chip">{{ categoryLabel }}</span>
      <h3 class="event-title">{{ event.title }}</h3>
      <p v-if="locationLabel" class="venue-line">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M12 22 5.5 12a7.5 7.5 0 1 1 13 0L12 22Z" /><circle cx="12" cy="8.25" r="3.5" /></svg>
        <span>{{ locationLabel }}</span>
      </p>
      <p v-if="showReason && event.reason" class="small text-primary mb-2">{{ event.reason }}</p>
      <div class="event-status">
        <ul v-if="attendees.length" class="attendee-avatars" aria-label="Confirmed attendees available to you">
          <li v-for="attendee in attendees" :key="attendee.id" class="attendee-avatar" :title="attendee.display_name || 'Attendee'">
            <img v-if="avatarUrl(attendee) && !failedAvatarUrls.has(avatarUrl(attendee))" :src="avatarUrl(attendee)" :alt="attendee.display_name || 'Attendee'" loading="lazy" referrerpolicy="no-referrer" @error="failedAvatarUrls.add(avatarUrl(attendee))" />
            <span v-else-if="initials(attendee)" :aria-label="attendee.display_name">{{ initials(attendee) }}</span>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" role="img" aria-label="Attendee without a profile photo"><circle cx="12" cy="8" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></svg>
          </li>
          <li v-if="remainingAttendees" class="attendee-overflow" :aria-label="`${remainingAttendees} more attendees`">+{{ remainingAttendees }}</li>
        </ul>
        <span class="going-count">{{ event.confirmed_count ?? 0 }} going</span>
        <span v-if="isFull" class="badge full-badge">Full</span>
      </div>
      <div class="event-actions">
        <RouterLink :to="`/events/${event.id}`" class="btn btn-outline-secondary btn-sm" :aria-label="`View ${event.title}`">View event</RouterLink>
        <RouterLink :to="{ path: `/events/${event.id}`, hash: '#rsvp' }" class="btn btn-primary btn-sm" :aria-label="`RSVP for ${event.title}`">RSVP</RouterLink>
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
.category-chip { display: inline-flex; align-items: center; padding: 4px 10px; margin-bottom: 10px; border: 1px solid #e3e7ed; border-radius: 999px; background: #f5f7fa; color: #566275; font-size: .75rem; font-weight: 600; text-transform: capitalize; }
.event-title { font-size: 1.35rem; font-weight: 650; line-height: 1.3; letter-spacing: -.025em; margin-bottom: 12px; overflow-wrap: anywhere; }
.venue-line { display: flex; align-items: flex-start; gap: 7px; color: #737b88; font-size: .95rem; margin-bottom: 14px; }
.venue-line svg { width: 18px; height: 18px; flex-shrink: 0; margin-top: 2px; }
.venue-line span { overflow-wrap: anywhere; }
.event-status { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-height: 24px; }
.attendee-avatars { display: flex; align-items: center; flex-wrap: wrap; row-gap: 6px; padding: 0 0 0 6px; margin: 0; list-style: none; max-width: 100%; }
.attendee-avatar { display: flex; align-items: center; justify-content: center; flex: 0 0 32px; width: 32px; height: 32px; margin-left: -6px; border: 2px solid white; border-radius: 50%; overflow: hidden; background: #e8edf5; color: #52627d; font-size: .65rem; font-weight: 650; }
.attendee-avatar img { width: 100%; height: 100%; object-fit: cover; }
.attendee-avatar svg { width: 20px; height: 20px; }
.attendee-overflow { padding: 0 6px; color: #737b88; font-size: .75rem; }
.going-count { color: #737b88; font-size: .85rem; }
.full-badge { background: #fff1d8; color: #82580e; }
.event-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.event-actions .btn { display: inline-flex; align-items: center; justify-content: center; min-width: 70px; min-height: 44px; border-radius: 8px; }
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
