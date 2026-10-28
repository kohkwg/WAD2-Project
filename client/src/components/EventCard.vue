<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EventArtwork from './EventArtwork.vue'

const props = defineProps({
  event: { type: Object, required: true },
  showReason: { type: Boolean, default: false },
})
const failedCover = ref('')
const coverSource = computed(() => props.event?.image_url || props.event?.coverImageUrl || '')
const timeLabel = computed(() => new Date(props.event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
const isFull = computed(() => !!props.event.is_full || (props.event.spots_left != null && Number(props.event.spots_left) <= 0))
// Events are tagged rather than categorised, so fall back to the first tag
const primaryTag = computed(() => props.event.category || props.event.tags?.[0] || '')
const categoryLabel = computed(() => (primaryTag.value || 'Event').replace(/[_-]/g, ' '))
const savedLocation = computed(() => [...new Set([props.event.venue_name, props.event.venue_address]
  .filter(value => typeof value === 'string' && value.trim())
  .map(value => value.trim()))].join(' · '))
const venueVisible = computed(() => {
  const name = typeof props.event.venue_name === 'string' ? props.event.venue_name.trim() : ''
  return name || (typeof props.event.venue_address === 'string' && props.event.venue_address.trim()) || 'Venue to be announced'
})
const venueShort = computed(() => venueVisible.value.length > 38 ? `${venueVisible.value.slice(0, 35).trimEnd()}…` : venueVisible.value)
const venueLabel = computed(() => savedLocation.value ? `Venue: ${savedLocation.value}` : 'Venue to be announced')
const attendees = computed(() => props.event.attendees || [])
const remainingAttendees = computed(() => Math.max(0, Number(props.event.confirmed_count || 0) - attendees.value.length))
const failedAvatarUrls = ref(new Set())
const availabilityLabel = computed(() => {
  if (isFull.value) return 'Full · Join the waitlist'
  if (props.event.spots_left == null) return ''
  const left = Number(props.event.spots_left)
  if (!Number.isFinite(left)) return ''
  return left <= 0 ? 'Full · Join the waitlist' : `${left} ${left === 1 ? 'place' : 'places'} left`
})
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
</script>

<template>
  <article class="event-card">
    <div class="event-cover">
      <img v-if="coverSource && failedCover !== coverSource" :src="coverSource" @error="failedCover = coverSource" :alt="`Cover for ${event.title}`" class="event-cover-image" width="720" height="480" loading="lazy" />
      <EventArtwork v-else :category="primaryTag" />
      <span class="artwork-category" aria-hidden="true">{{ categoryLabel }}</span>
    </div>
    <div class="event-details">
      <div class="event-meta">
        <time class="event-time" :datetime="event.start_time">{{ timeLabel }}</time>
        <span class="category-chip">{{ categoryLabel }}</span>
      </div>
      <h3 class="event-title">{{ event.title }}</h3>
      <p class="venue-line" :title="venueLabel" :aria-label="venueLabel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M12 22 5.5 12a7.5 7.5 0 1 1 13 0L12 22Z" /><circle cx="12" cy="8.25" r="3.5" /></svg>
        <span aria-hidden="true">{{ venueShort }}</span>
      </p>
      <p v-if="showReason && event.reason" class="event-reason">{{ event.reason }}</p>
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
        <span v-if="availabilityLabel" class="availability-chip" :class="{ 'availability-chip--full': isFull }">{{ availabilityLabel }}</span>
      </div>
      <div class="event-actions">
        <RouterLink :to="`/events/${event.id}/rsvp`" class="btn event-cta event-cta--secondary" :aria-label="`View ${event.title}`">View event</RouterLink>
        <RouterLink :to="{ path: `/events/${event.id}/rsvp`, hash: '#rsvp' }" class="btn event-cta" :aria-label="`RSVP for ${event.title}`">RSVP</RouterLink>
      </div>
    </div>
  </article>
</template>

<style scoped>
.event-card { display: grid; grid-template-columns: minmax(12rem, .85fr) minmax(0, 1.4fr); gap: clamp(1.1rem, 2.4vw, 2rem); padding: clamp(1rem, 2vw, 1.35rem); border: 1px solid var(--bookedz-border); border-radius: 22px; background: var(--bookedz-surface); box-shadow: 0 8px 22px rgb(41 45 50 / 4%); transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease; }
@media (hover: hover) {
.event-card:hover { transform: translateY(-2px); border-color: #d7c8b6; box-shadow: 0 12px 28px rgb(41 45 50 / 8%); }
}
.event-card:focus-within { border-color: #cbd2dc; box-shadow: 0 8px 24px #23304712; }
@media (prefers-reduced-motion: reduce) {
  .event-card { transition: none; }
  .event-card:hover { transform: none; }
}
.event-cover { position: relative; min-height: 210px; overflow: hidden; border-radius: 16px; background: var(--bookedz-mint, #dceee3); }
.event-cover > :deep(.event-artwork) { position: absolute; inset: 0; }
.event-cover-image { display: block; width: 100%; height: 100%; min-height: 210px; object-fit: cover; }
.artwork-category { position: absolute; right: 12px; bottom: 12px; max-width: calc(100% - 24px); padding: .35rem .65rem; overflow: hidden; border: 1px solid rgb(255 249 239 / 72%); border-radius: 999px; background: rgb(255 249 239 / 92%); color: var(--bookedz-ink, #292d32); font-size: .78rem; font-weight: 650; text-overflow: ellipsis; text-transform: capitalize; white-space: nowrap; }
.event-details { min-width: 0; align-self: center; }
.event-meta { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem .7rem; margin-bottom: .55rem; }
.event-time { display: block; color: var(--bookedz-muted); font-size: .9rem; }
.category-chip { display: inline-flex; align-items: center; padding: .22rem .65rem; border: 1px solid #d6e4d9; border-radius: 999px; background: #e8f2e9; color: #3e664d; font-size: .76rem; font-weight: 650; text-transform: capitalize; }
.event-title { font-family: var(--bookedz-heading); font-size: clamp(1.35rem, 2vw, 1.8rem); font-weight: 650; line-height: 1.13; letter-spacing: -.035em; margin: 0 0 .75rem; overflow-wrap: anywhere; }
.venue-line { display: flex; align-items: flex-start; gap: 7px; color: var(--bookedz-muted); font-size: .9rem; margin-bottom: 14px; }
.venue-line svg { width: 18px; height: 18px; flex-shrink: 0; margin-top: 2px; }
.venue-line span { overflow-wrap: anywhere; }
.event-reason { margin: -.35rem 0 .8rem; color: #5e5a4f; font-size: .85rem; }
.event-status { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-height: 24px; }
.attendee-avatars { display: flex; align-items: center; flex-wrap: wrap; row-gap: 6px; padding: 0 0 0 6px; margin: 0; list-style: none; max-width: 100%; }
.attendee-avatar { display: flex; align-items: center; justify-content: center; flex: 0 0 32px; width: 32px; height: 32px; margin-left: -6px; border: 2px solid white; border-radius: 50%; overflow: hidden; background: #e8edf5; color: #52627d; font-size: .65rem; font-weight: 650; }
.attendee-avatar img { width: 100%; height: 100%; object-fit: cover; }
.attendee-avatar svg { width: 20px; height: 20px; }
.attendee-overflow { padding: 0 6px; color: var(--bookedz-muted); font-size: .75rem; }
.going-count { color: var(--bookedz-muted); font-size: .83rem; }
.availability-chip { display: inline-flex; align-items: center; min-height: 28px; padding: .25rem .6rem; border: 1px solid #c5ddcb; border-radius: 999px; background: #e5f2e8; color: #315c3e; font-size: .76rem; font-weight: 650; }
.availability-chip--full { border-color: #e4c7a5; background: #fbebd9; color: #714a2d; }
.event-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.event-actions .btn { display: inline-flex; align-items: center; justify-content: center; min-width: 76px; min-height: 44px; border-radius: 14px 24px 24px 14px; padding: 12px 54px 12px 18px; }
.event-actions .btn-primary { --bs-btn-bg: var(--bookedz-primary-dark, #aa3e2c); --bs-btn-border-color: var(--bookedz-primary-dark, #aa3e2c); --bs-btn-hover-bg: #8f3022; --bs-btn-hover-border-color: #8f3022; }
.event-actions .btn-outline-secondary { --bs-btn-color: #4f5656; --bs-btn-border-color: #bdc3bc; --bs-btn-hover-bg: #f4f0e7; --bs-btn-hover-color: #292d32; --bs-btn-hover-border-color: #aeb4ad; }
@media (max-width: 575px) {
  .event-card { grid-template-columns: minmax(0, 1fr); gap: 1rem; padding: .8rem; border-radius: 18px; }
  .event-cover { min-height: 172px; max-height: 205px; border-radius: 13px; }
  .event-cover-image { min-height: 172px; }
  .event-title { font-size: 1.35rem; }
  .event-actions { margin-top: 14px; }
}
.event-card :deep(:focus-visible) { outline: 3px solid var(--bookedz-primary-dark, #aa3e2c); outline-offset: 3px; }
</style>
