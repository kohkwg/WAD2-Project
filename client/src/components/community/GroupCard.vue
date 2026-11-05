<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EventArtwork from '../EventArtwork.vue'
import BumpValue from '../ui/BumpValue.vue'
import { joinGroup } from '../../utils/api.js'
import { formatEventTime } from '../../utils/helpers.js'
import { toast } from '../../composables/useToast'

// One group in the Community feed: who is going to which event, spots left and Join.
// Everything else (plan, chat, invite link) is on the group's own page.
const props = defineProps({ group: { type: Object, required: true }, highlight: Boolean })
const emit = defineEmits(['changed'])
const busy = ref(false)
const justJoined = ref(false)
const error = ref('')

const event = computed(() => props.group.event)
const category = computed(() => event.value?.category || '')
const joined = computed(() => ['confirmed', 'pending'].includes(props.group.myStatus))
const isHost = computed(() => props.group.myStatus === 'host')
const full = computed(() => props.group.spotsLeft <= 0)
const people = computed(() => [props.group.host, ...props.group.members])
const pageLink = computed(() => `/groups/${props.group.id}`)
import { useMyDino } from '@/lib/myDino'
const { dinoFor } = useMyDino()
const initials = (name) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
const ago = computed(() => {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(props.group.createdAt)) / 60000))
  return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1440)}d ago`
})
const eventRsvpLabel = computed(() => (event.value?.requiresApproval ? 'Request a spot' : event.value?.spotsLeft > 0 ? 'RSVP' : 'Join waitlist'))
// Offer the event RSVP to members who don't have one yet
const needsEventRsvp = computed(() => (props.group.myStatus === 'confirmed' || isHost.value) && !props.group.myEventStatus)

async function join() {
  busy.value = true
  error.value = ''
  try {
    const rsvp = await joinGroup({ id: props.group.id })
    justJoined.value = true
    toast(rsvp?.status === 'pending' ? 'Request sent to the host' : 'You joined the group')
    emit('changed')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <article :id="`group-${group.id}`" class="group-card lift-on-hover" :class="{ 'is-highlighted': highlight, 'is-joined': joined || isHost }" :aria-labelledby="`group-title-${group.id}`">
    <header class="group-head">
      <span class="group-avatar" aria-hidden="true"><img v-if="dinoFor(group.host.id)" class="dino-face" :src="dinoFor(group.host.id)" alt="">{{ dinoFor(group.host.id) ? '' : initials(group.host.name) }}</span>
      <p class="group-who m-0">
        <strong :id="`group-title-${group.id}`">{{ isHost ? 'You' : group.host.name }}</strong>{{ ' ' }}<span class="text-secondary">{{ isHost ? 'are' : 'is' }} looking for people to go with</span>{{ ' ' }}<span class="group-ago text-caption text-secondary">· {{ ago }}</span>
      </p>
      <span v-if="group.visibility === 'private'" class="group-badge">Private</span>
      <span v-if="isHost" class="group-badge group-badge--host">Hosting</span>
      <span v-else-if="group.myStatus === 'confirmed'" class="group-badge group-badge--in">You’re in</span>
      <span v-else-if="group.myStatus === 'pending'" class="group-badge">Request sent</span>
    </header>

    <p v-if="group.note" class="group-note">{{ group.note }}</p>

    <RouterLink v-if="event" :to="`/events/${event.id}/rsvp`" class="group-event cat-tint" :class="`cat-${category}`">
      <span class="group-event-art" aria-hidden="true"><EventArtwork :category="category" /></span>
      <span class="group-event-copy">
        <strong>{{ event.title }}</strong>
        <span class="text-meta">{{ formatEventTime(event) }}</span>
        <span class="text-meta">{{ event.venue?.name || 'Venue to be announced' }}</span>
      </span>
      <span class="group-event-go" aria-hidden="true">›</span>
    </RouterLink>

    <div class="group-foot">
      <div class="group-people">
        <span class="group-stack" aria-hidden="true">
          <span v-for="person in people.slice(0, 5)" :key="person.id" class="group-mini" :title="person.name"><img v-if="dinoFor(person.id)" class="dino-face" :src="dinoFor(person.id)" alt="">{{ dinoFor(person.id) ? '' : initials(person.name) }}</span>
        </span>
        <span class="text-meta"><strong><BumpValue :value="people.length" /> going</strong> · {{ full ? 'Full' : `${group.spotsLeft} ${group.spotsLeft === 1 ? 'spot' : 'spots'} left` }}</span>
      </div>
      <div class="group-actions">
        <RouterLink :to="pageLink" class="btn btn-outline-secondary btn-sm">
          {{ joined || isHost ? 'Open group' : 'View group' }}<span v-if="group.commentCount"> · {{ group.commentCount }} {{ group.commentCount === 1 ? 'message' : 'messages' }}</span>
        </RouterLink>
        <button v-if="!joined && !isHost" type="button" class="btn btn-primary btn-sm" :disabled="busy || full" @click="join">
          {{ busy ? 'Joining…' : full ? 'Full' : group.joinMode === 'approval' ? 'Ask to join' : 'Join group' }}
        </button>
      </div>
    </div>

    <div v-if="needsEventRsvp && event" class="group-rsvp-prompt" :class="{ 'reveal-down': justJoined }">
      <p class="m-0"><strong>{{ justJoined ? 'You’re in the group.' : 'One more step.' }}</strong> RSVP to {{ event.title }} so you have a spot at the event too.</p>
      <RouterLink :to="{ path: `/events/${event.id}/rsvp`, hash: event.spotsLeft > 0 || event.requiresApproval ? '#rsvp' : '#waitlist' }" class="btn btn-primary btn-sm">{{ eventRsvpLabel }}</RouterLink>
    </div>
    <p v-else-if="(joined || isHost) && group.myEventStatus" class="group-rsvp-done text-meta">You’re {{ group.myEventStatus === 'confirmed' ? 'going to the event' : group.myEventStatus === 'waitlisted' ? 'on the event’s waitlist' : group.myEventStatus === 'pending' ? 'waiting for the organiser to approve your RSVP' : 'holding an offer for the event' }}.</p>

    <p v-if="error" class="group-error" role="alert">{{ error }}</p>

  </article>
</template>

<style scoped>
.group-card { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--bookedz-border); border-radius: 20px; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.group-card.is-joined { border-color: color-mix(in srgb, var(--bookedz-primary) 45%, var(--bookedz-border)); }
.group-card.is-highlighted { animation: attention-once 1.2s var(--bookedz-ease) 200ms 1; }
.group-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.group-who { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.group-avatar,.group-mini { display: inline-grid; place-items: center; flex: none; border-radius: 50%; background: var(--bookedz-orange-soft); color: var(--bookedz-primary-dark); font-weight: 700; }
.dino-face { width: 100%; height: 100%; object-fit: contain; }
.group-avatar,.group-mini { overflow: hidden; }
.group-avatar { width: 40px; height: 40px; font-size: .9rem; }
.group-mini { width: 28px; height: 28px; font-size: .7rem; border: 2px solid var(--bookedz-surface); }
.group-badge { flex: none; padding: 3px 10px; border-radius: 99px; background: var(--bookedz-hover); color: var(--bookedz-muted); font-size: var(--text-caption); font-weight: 700; }
.group-badge--host { background: var(--bookedz-mango-soft); color: var(--bookedz-ink); }
.group-badge--in { background: var(--bookedz-teal-soft); color: var(--bookedz-teal-ink); }
.group-note { margin: 0; font-size: 1rem; line-height: 1.55; overflow-wrap: anywhere; }
.group-event { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 10px; border-radius: 14px; color: var(--bookedz-ink); text-decoration: none; transition: transform var(--bookedz-motion-fast) var(--bookedz-ease); }
.group-event:hover { color: var(--bookedz-ink); }
.group-event:hover .group-event-go { transform: translateX(3px); }
.group-event-art { width: 56px; height: 56px; overflow: hidden; border-radius: 10px; background: var(--bookedz-surface); }
.group-event-art :deep(svg) { width: 100%; height: 100%; }
.group-event-copy { display: grid; gap: 1px; min-width: 0; }
.group-event-copy strong { overflow-wrap: anywhere; }
.group-event-go { font-size: 1.5rem; color: var(--bookedz-primary-dark); transition: transform var(--bookedz-motion-fast) var(--bookedz-ease); }
.group-foot { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; }
.group-people { display: flex; align-items: center; gap: 10px; }
.group-stack { display: inline-flex; }
.group-stack .group-mini + .group-mini { margin-left: -8px; }
.group-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.group-actions .btn { min-height: 40px; }
.group-rsvp-prompt { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--bookedz-teal-soft); }
.group-rsvp-prompt .btn { min-height: 40px; }
.group-rsvp-done { margin: 0; color: var(--bookedz-teal-ink); }
.group-error { margin: 0; color: var(--bookedz-danger); font-size: .9rem; }
@media (prefers-reduced-motion: reduce) { .group-card.is-highlighted { animation: none; } }
</style>
