<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { getEventOnlineAccess } from '../../utils/api.js';

// the backend decides whether this viewer can open the meeting link
// check again when their registration changes or the reveal time arrives

const props = defineProps({
  eventId: {
    type: String,
    required: true
  },
  isOrganiser: Boolean,
  refreshKey: {
    type: String,
    default: ''
  }
});

const access = ref(null);

const loading = ref(true);

const error = ref('');

let request = 0;

let revealTimer;

async function load() {
  const ticket = ++request;
  clearTimeout(revealTimer);
  loading.value = true;
  error.value = '';
  try {
    const result = await getEventOnlineAccess(props.eventId);
    if (ticket !== request) return;
    access.value = result;

    // check again at the reveal time when it is within the next day
    const wait = Date.parse(result?.revealAt) - Date.now();
    if (result?.hasLink && !result.url && wait > 0 && wait < 864e5) {
      revealTimer = setTimeout(load, wait + 1000);
    }
  } catch (failure) {
    if (ticket === request) error.value = failure.message || 'Could not load the online link.';
  } finally {
    if (ticket === request) loading.value = false;
  }
}

watch(() => [props.eventId, props.refreshKey], load, {
  immediate: true
});

// ignore unfinished requests and stop the timer when leaving

onBeforeUnmount(() => {
  request++;
  clearTimeout(revealTimer);
});

const revealLabel = computed(() => {
  const reveal = new Date(access.value?.revealAt);
  return Number.isNaN(reveal.getTime()) ? '' : new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(reveal);
});

const revealed = computed(() => Date.parse(access.value?.revealAt) <= Date.now());
</script>

<template>
  <!-- show the join button only when the backend returns a link -->
  <section v-if="access?.url" class="online-link is-ready" aria-labelledby="online-link-heading">
    <h2 id="online-link-heading" class="online-link-heading">Online event</h2>
    <a class="btn event-cta online-link-open" :href="access.url" target="_blank" rel="noopener noreferrer">
      Join online<span class="visually-hidden"> (opens in a new tab)</span>
    </a>
    <p class="online-link-url">{{ access.url }}</p>
    <p v-if="isOrganiser" class="online-link-note mb-0">
      {{ revealed ? 'Confirmed attendees can open this link now.' : `Confirmed attendees can open it from
      ${revealLabel}.` }}
    </p>
  </section>
  <div v-else class="online-link">
    <span class="venue-label">Where</span>
    <p class="venue-name">
    <span aria-hidden="true">⌖</span> Online</p>
    <p v-if="loading" class="online-link-note" role="status">Checking the online link…</p>
    <p v-else-if="error" class="online-link-note text-danger" role="alert">
      {{ error }}
      <button type="button" class="btn btn-sm btn-outline-danger ms-1" @click="load">Try again</button>
    </p>
    <p v-else-if="access?.hasLink" class="online-link-note" role="status">
      {{ revealed ? 'The link is shared with confirmed attendees.' : `The link appears here on ${revealLabel} for
      confirmed attendees.` }}
    </p>
    <p v-else class="online-link-note">The organiser hasn't added the link yet. It will appear here for confirmed
      attendees.</p>
  </div>
</template>

<style scoped>
/* keep the panel the same size as the venue card */

.online-link {
  margin-bottom: .9rem;
  padding: .85rem 1rem;
  border-radius: 15px;
  background: color-mix(in srgb, var(--bookedz-yellow) 20%, var(--bookedz-surface));
}

.online-link.is-ready {
  padding: 1rem;
  border: 1px solid var(--bookedz-border);
  background: color-mix(in srgb, var(--bookedz-mint) 18%, var(--bookedz-surface));
}

.venue-label {
  color: var(--bookedz-muted);
  font-size: .8rem;
  font-weight: 650;
}

.venue-name {
  margin: .15rem 0 0;
  color: var(--bookedz-ink);
  font-weight: 750;
}

.venue-name span {
  color: var(--bookedz-primary-dark);
}

.online-link-heading {
  margin: 0 0 .5rem;
  color: var(--bookedz-ink);
  font-size: 1rem;
  font-weight: 700;
}

.online-link-open {
  min-height: 44px;
}

.online-link-url {
  margin: .5rem 0 0;
  color: var(--bookedz-muted);
  font-size: .85rem;
  overflow-wrap: anywhere;
}

.online-link-note {
  margin: .15rem 0 0;
  color: var(--bookedz-muted);
  font-size: .9rem;
}

.is-ready .online-link-note {
  margin-top: .5rem;
}
</style>
