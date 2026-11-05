<script setup>
import BackLink from '../../components/ui/BackLink.vue';
// feature 3: the screen staff put at the entrance. shows a qr participants scan to
// check themselves in. the qr's secret changes every few minutes so a photo of it
// posted in a group chat stops working.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import QrCode from '@/components/checkin/QrCode.vue';
import { getCheckinSecret, getEvent, rotateCheckinSecret, venueCheckInUrl } from '@/utils/checkin';

// standalone routes read :eventid; manage event embeds this view and passes it in.

const props = defineProps({
  eventId: {
    type: String,
    default: ''
  },
  embedded: {
    type: Boolean,
    default: false
  }
});

const route = useRoute();

const eventId = props.eventId || route.params.eventId;

const event = ref(null);

const secret = ref('');

const rotatedAt = ref(0); // ms timestamp of the last rotation

const now = ref(Date.now());

const error = ref('');

// ===== huxley: core logic ===================================================
// rotation timer
// rotate_every_ms: how long one qr stays valid. shorter = a leaked photo is useful
//   for less time, but people mid-scan hit "expired" more often. 2 min is the middle.
// tick() runs every second:
//   - updates the countdown
//   - when time's up, calls rotate_checkin_secret and shows the new qr
//   - every sync_every_s seconds, re-reads the secret from the database. why: if
//     there are two entrance screens, each would otherwise rotate on its own and
//     invalidate the other's qr. re-reading means a screen only rotates when the
//     database's secret is old, and otherwise picks up the one the other screen made.
// `rotating` stops two rotations overlapping if the network is slow.
// the interval is cleared in onunmounted so it doesn't keep running (and keep
// rotating!) after staff leave the page.
// ============================================================================

const ROTATE_EVERY_MS = 2 * 60 * 1000;

const SYNC_EVERY_S = 15;

let timer = null;

let rotating = false;

let ticks = 0;

async function loadSecret() {
  const row = await getCheckinSecret(eventId);
  secret.value = row.checkin_secret;
  rotatedAt.value = new Date(row.rotated_at).getTime();
}

async function rotate() {
  if (rotating) return;
  rotating = true;
  try {
    secret.value = await rotateCheckinSecret(eventId);
    rotatedAt.value = Date.now();
    error.value = '';
  } catch (e) {
    error.value = e.message;
  } finally {
    rotating = false;
  }
}

async function tick() {
  now.value = Date.now();
  ticks++;
  if (ticks % SYNC_EVERY_S === 0) await loadSecret().catch(() => {});
  if (now.value - rotatedAt.value >= ROTATE_EVERY_MS) await rotate();
}

const secondsLeft = computed(() => Math.max(0, Math.ceil((ROTATE_EVERY_MS - (now.value - rotatedAt.value)) / 1000)));

const percentLeft = computed(() => secondsLeft.value * 1000 * 100 / ROTATE_EVERY_MS);

const countdown = computed(() => `${Math.floor(secondsLeft.value / 60)}:${String(secondsLeft.value % 60).padStart(2, '0')}`);

const qrValue = computed(() => secret.value ? venueCheckInUrl(eventId, secret.value) : '');

onMounted(async () => {
  try {
    const [e] = await Promise.all([getEvent(eventId), loadSecret()]);
    event.value = e;
    timer = setInterval(tick, 1000);
  } catch (e) {
    // rls hides event_secrets from non-staff, so .single() fails for them
    error.value = 'Only organisers and helpers for this event can show the venue QR.';
  }
});

onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="container venue-qr-page text-center">
    <BackLink
    v-if="!embedded"
    :to="`/organiser/events/${eventId}/manage`"
    class="small d-block text-start mb-3">&larr; Back</BackLink>

    <div v-dismissible v-if="error && !secret" class="alert alert-danger" role="alert">{{ error }}</div>

    <template v-else-if="secret">
      <span class="ticket-kicker">Entrance display</span>
    <h1 class="h3 mb-1">{{ event?.title }}</h1>
      <p class="lead mb-4">Scan to check in</p>

      <div class="venue-qr-stock align-items-center mx-auto">
        <QrCode :value="qrValue" :size="420" label="Venue check-in QR code" />
        <div class="w-100 mt-3">
          <div
            class="progress"
            role="progressbar"
            aria-label="Time until this code changes"
            :aria-valuenow="secondsLeft"
            aria-valuemin="0"
            :aria-valuemax="ROTATE_EVERY_MS / 1000"
            style="height: 6px"
          >
            <div class="progress-bar" :style="{ width: `${percentLeft}%` }"></div>
          </div>
          <p class="small text-body-secondary mt-2 mb-0">New code in {{ countdown }}</p>
        </div>
      </div>

      <div
      v-dismissible
      v-if="error"
      class="alert alert-warning mt-3 small">Couldn't refresh the code: {{ error }}</div>
      <p class="small text-body-secondary mt-3">
        No phone? Staff can scan your ticket at the check-in desk.
      </p>
    </template>

    <div v-else class="py-5">
      <div class="spinner-border" role="status">
      <span class="visually-hidden">Loading…</span></div>
    </div>
  </div>
</template>

<style scoped>
.venue-qr-page {
  max-width: 760px;
}

.venue-qr-page .ticket-kicker {
  margin-bottom: .5rem;
}

.venue-qr-stock {
  display: flex;
  width: min(100%,520px);
  padding: 1.5rem;
  border: 1px solid var(--bookedz-border,#e9ded3);
  border-radius: 24px;
  background: #fff;
  flex-direction: column;
  box-shadow: 0 12px 34px rgba(41,45,50,.08);
}

.venue-qr-page :deep(.qr-code) {
  width: min(420px,100%);
  padding: 12px;
  border: 1px solid #e9ded3;
  border-radius: 12px;
  background: #fff;
}

.venue-qr-page .progress {
  background: #e9ded3;
  border-radius: 999px;
}

.venue-qr-page .progress-bar {
  background: var(--bookedz-coral-dark,#9a3412);
  border-radius: 999px;
}

.venue-qr-page .alert {
  border-radius: 14px;
}

@media(max-width:575.98px) {
  .venue-qr-stock {
    padding: 1rem;
    border-radius: 18px;
  }
}
</style>
