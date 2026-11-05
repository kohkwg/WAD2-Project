<script setup>
import { computed } from 'vue'
import { dinoById } from '../../lib/dinos.js'
import { RouterLink } from 'vue-router'
import { formatEventTime } from '../../utils/helpers.js'
import { organiserEventState } from '../../utils/organiserEvents.js'
const props = defineProps({ event: { type: Object, required: true }, now: Number, confirming: Boolean, busy: Boolean, disabled: Boolean, justCreated: Boolean })
defineEmits(['ask-delete', 'keep', 'delete'])
const creatorDino = computed(() => dinoById(props.event.creator?.dino))
const state = computed(() => organiserEventState(props.event, props.now))
const editable = computed(() => state.value === 'drafts' || (state.value === 'upcoming' && Date.parse(props.event.startTime) > props.now))
const date = computed(() => new Date(props.event.startTime))
const validDate = computed(() => Number.isFinite(date.value.getTime()))
// Day number is shown large beside this, so the caption reads "Nov 2026 · Wed"
const dateCaption = computed(() => validDate.value ? `${date.value.toLocaleDateString('en-SG', { month: 'short', year: 'numeric' })} · ${date.value.toLocaleDateString('en-SG', { weekday: 'short' })}` : 'Date not set')
const label = computed(() => {
  if (state.value === 'drafts') return 'Draft'
  if (state.value === 'past') return 'Ended'
  if (state.value === 'cancelled') return 'Cancelled'
  if (Date.parse(props.event.startTime) <= props.now) return 'Happening now'
  if (date.value.toDateString() === new Date(props.now).toDateString()) return 'Later today'
  return 'Upcoming'
})
const capacityPercent = computed(() => props.event.capacity > 0 ? Math.max(0, Math.min(100, Math.round((props.event.confirmedCount || 0) / props.event.capacity * 100))) : 0)
</script>
<template>
  <article class="organiser-event-card lift-on-hover" :class="[`event-state-${state}`, { 'just-created': justCreated }]">
    <header class="card-date"><div><strong>{{ validDate ? date.getDate() : '—' }}</strong><span>{{ dateCaption }}</span></div><div class="card-status"><span v-if="!event.isMine && event.creator" class="event-creator" :aria-label="`Created by ${event.creator.username || event.creator.displayName || 'event creator'}`"><span class="creator-avatar" aria-hidden="true"><img v-if="creatorDino" :src="creatorDino.src" alt=""><template v-else>{{ (event.creator.displayName || event.creator.username || '?').charAt(0).toUpperCase() }}</template></span><span>{{ event.creator.username ? '@' + event.creator.username : event.creator.displayName || 'Event creator' }}</span></span><span class="date-label">{{ label }}</span></div></header>
    <div class="event-card-copy">
      <h3 class="event-title">{{ event.title || 'Untitled draft' }}</h3>
      <p class="event-meta text-meta">{{ validDate ? formatEventTime(event) : 'Choose a date when you edit this draft.' }}</p>
      <p class="event-meta text-meta" :class="{ 'venue-missing': !event.venue?.address }">{{ event.venue?.name || 'Venue not set yet' }}</p>
      <template v-if="state === 'drafts'"><p class="draft-note">Not published yet. Participants cannot find or RSVP to this draft.</p><span class="status-pill">Hidden from guests</span></template>
      <template v-else>
        <p class="capacity-copy"><strong>{{ event.confirmedCount || 0 }}</strong> {{ event.capacity == null ? 'confirmed · no capacity limit' : `of ${event.capacity} confirmed` }}</p>
        <div v-if="event.capacity > 0" class="capacity-track" role="progressbar" :aria-label="`Confirmed RSVPs for ${event.title}`" :aria-valuenow="Math.min(event.confirmedCount || 0, event.capacity)" aria-valuemin="0" :aria-valuemax="event.capacity"><span :style="{ width: capacityPercent + '%' }"></span></div>
        <div class="event-statuses"><span v-if="state === 'upcoming' && event.pendingCount > 0" class="status-pill pending-pill">{{ event.pendingCount }} awaiting approval</span><span v-if="event.waitlistCount > 0" class="status-pill">{{ event.waitlistCount }} on waitlist</span><span v-if="event.offeredCount > 0" class="status-pill">{{ event.offeredCount }} {{ event.offeredCount === 1 ? 'offer' : 'offers' }} out</span></div>
      </template>
    </div>
    <footer class="event-card-actions">
      <RouterLink v-if="state === 'drafts'" :to="`/organiser/events/${event.id}/manage?tab=edit`" class="btn btn-primary">Edit draft</RouterLink>
      <RouterLink v-else-if="state === 'past'" :to="`/organiser/events/${event.id}/attendance`" class="btn btn-primary">View results</RouterLink>
      <RouterLink v-else-if="state === 'upcoming' && event.pendingCount > 0" :to="`/organiser/events/${event.id}/manage?tab=rsvps&status=pending`" class="btn btn-primary">Review requests</RouterLink>
      <RouterLink v-else :to="`/organiser/events/${event.id}/manage?tab=tasks`" class="btn btn-primary">Manage event</RouterLink>
      <RouterLink v-if="editable && state !== 'drafts'" :to="`/organiser/events/${event.id}/manage?tab=edit`" class="btn btn-outline-secondary">Edit details</RouterLink>
      <details class="event-more">
        <summary :aria-label="`More actions for ${event.title}`">•••</summary>
        <div class="event-menu">
          <RouterLink v-if="state !== 'drafts'" :to="`/events/${event.id}/rsvp`">View public page</RouterLink>
          <RouterLink v-if="state !== 'drafts'" :to="`/organiser/events/${event.id}/manage?tab=tasks`">Manage event</RouterLink>
          <RouterLink v-if="state !== 'drafts'" :to="`/organiser/events/${event.id}/manage?tab=rsvps`">Manage RSVPs</RouterLink>
          <template v-if="(event.isMine || event.canManage) && confirming"><p>Permanently delete this event, its RSVPs and organiser records?</p><button type="button" class="btn btn-danger" :disabled="disabled" @click="$emit('delete', event.id)">{{ busy ? 'Deleting…' : 'Yes, delete event' }}</button><button :id="`keep-event-${event.id}`" type="button" class="btn btn-outline-secondary" :disabled="disabled" @click="$emit('keep', event.id)">Keep event</button></template>
          <button v-else-if="event.isMine || event.canManage" :id="`delete-event-${event.id}`" type="button" class="delete-event" :disabled="disabled" @click="$emit('ask-delete', event.id)">Delete event</button>
        </div>
      </details>
    </footer>
  </article>
</template>
<style scoped>
.organiser-event-card{display:flex;flex-direction:column;border:1px solid var(--bookedz-border);border-radius:20px;background:var(--bookedz-surface);min-width:0}.event-state-drafts{border-style:dashed}.just-created{border-color:var(--bookedz-success)}.card-date{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:15px;border-radius:19px 19px 0 0;background:color-mix(in srgb,var(--bookedz-mint) 70%,var(--bookedz-surface))}.card-date>div{display:flex;align-items:baseline;gap:8px;min-width:0}.card-date strong{font:650 1.8rem/1 var(--bookedz-heading)}.card-date>div>span{font-size:var(--text-caption);}.date-label{font-size:var(--text-caption);font-weight:650;padding:4px 7px;border-radius:12px;background:var(--bookedz-surface);white-space:nowrap}.event-state-drafts .card-date{background:color-mix(in srgb,var(--bookedz-yellow) 28%,var(--bookedz-surface))}.event-state-past .card-date,.event-state-cancelled .card-date{background:var(--bookedz-hover)}.event-card-copy{padding:18px 16px 10px;flex:1;min-width:0}h3{ overflow-wrap:anywhere; margin:0 0 10px; }.event-meta{font-size:var(--text-small);color:var(--bookedz-muted);margin:6px 0;overflow-wrap:anywhere}.capacity-copy{font-size:var(--text-small);margin:14px 0 6px;color:var(--bookedz-muted)}.capacity-copy strong{color:var(--bookedz-ink)}.capacity-track{height:5px;border-radius:10px;background:var(--bookedz-hover);overflow:hidden}.capacity-track span{display:block;height:100%;background:var(--bookedz-success)}.event-statuses{min-height:24px;display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}.status-pill{display:inline-block;padding:4px 7px;border-radius:9px;background:var(--bookedz-hover);font-size:var(--text-caption);color:var(--bookedz-ink)}.pending-pill{background:color-mix(in srgb,var(--bookedz-yellow) 35%,var(--bookedz-surface))}.draft-note{font-size:var(--text-small);color:var(--bookedz-muted);margin:14px 0 8px}.event-card-actions{display:flex;gap:7px;align-items:center;flex-wrap:nowrap;padding:10px 16px 16px}.event-card-actions>.btn{ min-height:44px; display:flex; align-items:center; justify-content:center; padding:8px 10px; }
/* Same row on every card: the buttons share the width equally and the ••• menu keeps its own 44px slot at the end, so it never wraps under them */
.event-card-actions>.btn{ flex:1 1 0; min-width:0; align-self:stretch; padding-inline:6px; text-align:center; line-height:1.15; white-space:normal; }
.event-card-actions>.btn:only-of-type{ flex-grow:1 }.event-card-actions>.btn-primary{background:var(--bookedz-primary);border-color:var(--bookedz-primary);color:var(--bookedz-on-action)}.event-more{position:relative;flex:none;margin-left:0}.event-more summary{list-style:none;display:grid;place-items:center;cursor:pointer;min-width:44px;min-height:44px;border:1px solid var(--bookedz-border);border-radius:10px;font-size:var(--text-button)}.event-more summary::-webkit-details-marker{display:none}.event-menu{position:absolute;bottom:calc(100% + 8px);right:0;z-index:5;display:grid;gap:5px;width:235px;max-width:75vw;padding:12px;background:var(--bookedz-surface);border:1px solid var(--bookedz-border);border-radius:14px;box-shadow:var(--bookedz-shadow)}.event-menu>a,.delete-event{display:flex;align-items:center;min-height:44px;padding:8px;color:var(--bookedz-ink);font-size:var(--text-button);text-decoration:none;background:transparent;border:0;border-radius:8px;text-align:left}.event-menu>a:hover{background:var(--bookedz-hover)}.delete-event{color:var(--bookedz-danger)}.delete-event:hover,.delete-event:focus-visible{background:color-mix(in srgb,var(--bookedz-danger) 15%,transparent)}.event-menu p{font-size:var(--text-small);margin:0 0 6px}.event-menu button{ min-height:44px; }
.card-date > .card-status { display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:.5rem; min-width:0; }
.event-creator { display:flex; align-items:center; gap:.35rem; font-size:var(--text-caption); min-width:0; overflow-wrap:anywhere; }
.creator-avatar { display:grid; place-items:center; flex-shrink:0; width:28px; height:28px; border-radius:50%; background:var(--bookedz-surface); overflow:hidden; }
.creator-avatar img { width:100%; height:100%; object-fit:contain; }
.creator-avatar:has(img) { overflow:visible; background:none; }
.creator-avatar img { transform:scale(1.25); }
.card-date { flex-wrap:wrap; }
</style>
