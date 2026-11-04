<script setup>
import { computed, nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EventArtwork from '../EventArtwork.vue'
import BumpValue from '../ui/BumpValue.vue'
import { joinHangout, cancelRsvp, getJioComments, addJioComment, deleteJioComment } from '../../utils/api.js'
import { formatEventTime } from '../../utils/helpers.js'
import { toast } from '../../composables/useToast'

// One open jio: who is going to which event, spots left, Join/Leave and a short comment thread.
// After joining, it offers a one-tap step to RSVP to the event itself (its own rules still apply).
const props = defineProps({ jio: { type: Object, required: true }, highlight: Boolean })
const emit = defineEmits(['changed'])
const busy = ref(false)
const confirmLeave = ref(false)
const justJoined = ref(false)
const showComments = ref(false)
const comments = ref([])
const commentsLoaded = ref(false)
const draft = ref('')
const posting = ref(false)
const error = ref('')

const event = computed(() => props.jio.event)
const category = computed(() => event.value?.category || '')
const joined = computed(() => ['confirmed', 'pending'].includes(props.jio.myStatus))
const isHost = computed(() => props.jio.myStatus === 'host')
const full = computed(() => props.jio.spotsLeft <= 0)
const people = computed(() => [props.jio.host, ...props.jio.members])
const initials = (name) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
const ago = computed(() => {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(props.jio.createdAt)) / 60000))
  return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1440)}d ago`
})
const eventRsvpLabel = computed(() => (event.value?.requiresApproval ? 'Request a spot' : event.value?.spotsLeft > 0 ? 'RSVP' : 'Join waitlist'))
// Offer the event RSVP to members who don't have one yet
const needsEventRsvp = computed(() => (joined.value || isHost.value) && !props.jio.myEventStatus)

async function join() {
  busy.value = true
  error.value = ''
  try {
    const rsvp = await joinHangout({ eventId: props.jio.id })
    justJoined.value = true
    toast(rsvp?.status === 'pending' ? 'Request sent to the host' : 'You joined the jio')
    emit('changed')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
async function leave() {
  if (!props.jio.myRsvpId) return
  busy.value = true
  error.value = ''
  try {
    await cancelRsvp(props.jio.myRsvpId)
    confirmLeave.value = false
    justJoined.value = false
    toast('You left the jio')
    emit('changed')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
async function toggleComments() {
  showComments.value = !showComments.value
  if (showComments.value && !commentsLoaded.value) {
    try { comments.value = await getJioComments(props.jio.id) } catch (e) { error.value = e.message }
    commentsLoaded.value = true
  }
}
async function postComment() {
  if (!draft.value.trim() || posting.value) return
  posting.value = true
  error.value = ''
  try {
    await addJioComment(props.jio.id, draft.value)
    draft.value = ''
    comments.value = await getJioComments(props.jio.id)
    emit('changed')
    await nextTick()
  } catch (e) {
    error.value = e.message
  } finally {
    posting.value = false
  }
}
async function removeComment(comment) {
  try {
    await deleteJioComment(comment.id)
    comments.value = comments.value.filter((c) => c.id !== comment.id)
    emit('changed')
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <article :id="`jio-${jio.id}`" class="jio-card lift-on-hover" :class="{ 'is-highlighted': highlight, 'is-joined': joined || isHost }" :aria-labelledby="`jio-title-${jio.id}`">
    <header class="jio-head">
      <span class="jio-avatar" aria-hidden="true">{{ initials(jio.host.name) }}</span>
      <p class="jio-who m-0">
        <strong :id="`jio-title-${jio.id}`">{{ isHost ? 'You' : jio.host.name }}</strong>{{ ' ' }}<span class="text-secondary">{{ isHost ? 'are' : 'is' }} going and looking for company</span>{{ ' ' }}<span class="jio-ago text-caption text-secondary">· {{ ago }}</span>
      </p>
      <span v-if="isHost" class="jio-badge jio-badge--host">Hosting</span>
      <span v-else-if="jio.myStatus === 'confirmed'" class="jio-badge jio-badge--in">You’re in</span>
      <span v-else-if="jio.myStatus === 'pending'" class="jio-badge">Request sent</span>
    </header>

    <p v-if="jio.note" class="jio-note">{{ jio.note }}</p>

    <RouterLink v-if="event" :to="`/events/${event.id}/rsvp`" class="jio-event cat-tint" :class="`cat-${category}`">
      <span class="jio-event-art" aria-hidden="true"><EventArtwork :category="category" /></span>
      <span class="jio-event-copy">
        <strong>{{ event.title }}</strong>
        <span class="text-meta">{{ formatEventTime(event) }}</span>
        <span class="text-meta">{{ event.venue?.name || 'Venue to be announced' }}</span>
      </span>
      <span class="jio-event-go" aria-hidden="true">›</span>
    </RouterLink>

    <div class="jio-foot">
      <div class="jio-people">
        <span class="jio-stack" aria-hidden="true">
          <span v-for="person in people.slice(0, 5)" :key="person.id" class="jio-mini" :title="person.name">{{ initials(person.name) }}</span>
        </span>
        <span class="text-meta"><strong><BumpValue :value="people.length" /> going</strong> · {{ full ? 'Full' : `${jio.spotsLeft} ${jio.spotsLeft === 1 ? 'spot' : 'spots'} left` }}</span>
      </div>
      <div class="jio-actions">
        <button type="button" class="btn btn-outline-secondary btn-sm" :aria-expanded="showComments" :aria-controls="`jio-comments-${jio.id}`" @click="toggleComments">
          Chat<span v-if="jio.commentCount"> ({{ jio.commentCount }})</span>
        </button>
        <template v-if="isHost">
          <RouterLink :to="`/events/${jio.id}/rsvp`" class="btn btn-outline-secondary btn-sm">Plan the day</RouterLink>
        </template>
        <template v-else-if="joined">
          <template v-if="confirmLeave">
            <button type="button" class="btn btn-outline-danger btn-sm" :disabled="busy" @click="leave">Leave</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" @click="confirmLeave = false">Stay</button>
          </template>
          <template v-else>
            <RouterLink v-if="jio.myStatus === 'confirmed'" :to="`/events/${jio.id}/rsvp`" class="btn btn-outline-secondary btn-sm">See the plan</RouterLink>
            <button type="button" class="btn btn-outline-secondary btn-sm" @click="confirmLeave = true">Leave jio</button>
          </template>
        </template>
        <button v-else type="button" class="btn btn-primary btn-sm" :disabled="busy || full" @click="join">
          {{ busy ? 'Joining…' : full ? 'Full' : jio.joinMode === 'approval' ? 'Ask to join' : 'Join jio' }}
        </button>
      </div>
    </div>

    <div v-if="needsEventRsvp && event" class="jio-rsvp-prompt" :class="{ 'reveal-down': justJoined }">
      <p class="m-0"><strong>{{ justJoined ? 'You’re in the jio.' : 'One more step.' }}</strong> RSVP to {{ event.title }} so you have a spot at the event too.</p>
      <RouterLink :to="{ path: `/events/${event.id}/rsvp`, hash: event.spotsLeft > 0 || event.requiresApproval ? '#rsvp' : '#waitlist' }" class="btn btn-primary btn-sm">{{ eventRsvpLabel }}</RouterLink>
    </div>
    <p v-else-if="(joined || isHost) && jio.myEventStatus" class="jio-rsvp-done text-meta">You’re {{ jio.myEventStatus === 'confirmed' ? 'going to the event' : jio.myEventStatus === 'waitlisted' ? 'on the event’s waitlist' : jio.myEventStatus === 'pending' ? 'waiting for the organiser to approve your RSVP' : 'holding an offer for the event' }}.</p>

    <p v-if="error" class="jio-error" role="alert">{{ error }}</p>

    <section v-if="showComments" :id="`jio-comments-${jio.id}`" class="jio-comments reveal-down" :aria-label="`Chat for ${event?.title || 'this jio'}`">
      <ul v-if="comments.length" class="list-unstyled m-0 stagger-in">
        <li v-for="comment in comments" :key="comment.id" class="jio-comment">
          <span class="jio-mini" aria-hidden="true">{{ initials(comment.name) }}</span>
          <p class="m-0"><strong>{{ comment.mine ? 'You' : comment.name }}</strong>{{ ' ' }}{{ comment.text }}</p>
          <button v-if="comment.mine" type="button" class="btn btn-link btn-sm p-0 ms-auto text-secondary" @click="removeComment(comment)">Delete</button>
        </li>
      </ul>
      <p v-else-if="commentsLoaded" class="text-meta text-secondary m-0">No messages yet. Say where to meet or ask a question.</p>
      <form class="jio-comment-form" @submit.prevent="postComment">
        <label class="visually-hidden" :for="`jio-comment-${jio.id}`">Message</label>
        <input :id="`jio-comment-${jio.id}`" v-model="draft" class="form-control form-control-sm" maxlength="280" autocomplete="off" placeholder="Write a message…" />
        <button type="submit" class="btn btn-primary btn-sm" :disabled="!draft.trim() || posting">Send</button>
      </form>
    </section>
  </article>
</template>

<style scoped>
.jio-card { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--bookedz-border); border-radius: 20px; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.jio-card.is-joined { border-color: color-mix(in srgb, var(--bookedz-primary) 45%, var(--bookedz-border)); }
.jio-card.is-highlighted { animation: attention-once 1.2s var(--bookedz-ease) 200ms 1; }
.jio-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.jio-who { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.jio-avatar,.jio-mini { display: inline-grid; place-items: center; flex: none; border-radius: 50%; background: var(--bookedz-orange-soft); color: var(--bookedz-primary-dark); font-weight: 700; }
.jio-avatar { width: 40px; height: 40px; font-size: .9rem; }
.jio-mini { width: 28px; height: 28px; font-size: .7rem; border: 2px solid var(--bookedz-surface); }
.jio-badge { flex: none; padding: 3px 10px; border-radius: 99px; background: var(--bookedz-hover); color: var(--bookedz-muted); font-size: var(--text-caption); font-weight: 700; }
.jio-badge--host { background: var(--bookedz-mango-soft); color: var(--bookedz-ink); }
.jio-badge--in { background: var(--bookedz-teal-soft); color: var(--bookedz-teal-ink); }
.jio-note { margin: 0; font-size: 1rem; line-height: 1.55; overflow-wrap: anywhere; }
.jio-event { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 10px; border-radius: 14px; color: var(--bookedz-ink); text-decoration: none; transition: transform var(--bookedz-motion-fast) var(--bookedz-ease); }
.jio-event:hover { color: var(--bookedz-ink); }
.jio-event:hover .jio-event-go { transform: translateX(3px); }
.jio-event-art { width: 56px; height: 56px; overflow: hidden; border-radius: 10px; background: var(--bookedz-surface); }
.jio-event-art :deep(svg) { width: 100%; height: 100%; }
.jio-event-copy { display: grid; gap: 1px; min-width: 0; }
.jio-event-copy strong { overflow-wrap: anywhere; }
.jio-event-go { font-size: 1.5rem; color: var(--bookedz-primary-dark); transition: transform var(--bookedz-motion-fast) var(--bookedz-ease); }
.jio-foot { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; }
.jio-people { display: flex; align-items: center; gap: 10px; }
.jio-stack { display: inline-flex; }
.jio-stack .jio-mini + .jio-mini { margin-left: -8px; }
.jio-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.jio-actions .btn { min-height: 40px; }
.jio-rsvp-prompt { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--bookedz-teal-soft); }
.jio-rsvp-prompt .btn { min-height: 40px; }
.jio-rsvp-done { margin: 0; color: var(--bookedz-teal-ink); }
.jio-error { margin: 0; color: var(--bookedz-danger); font-size: .9rem; }
.jio-comments { display: grid; gap: 10px; padding-top: 10px; border-top: 1px solid var(--bookedz-border); }
.jio-comment { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; font-size: .92rem; }
.jio-comment p { overflow-wrap: anywhere; }
.jio-comment-form { display: flex; gap: 8px; }
.jio-comment-form .form-control { min-height: 40px; }
@media (prefers-reduced-motion: reduce) { .jio-card.is-highlighted { animation: none; } }
</style>
