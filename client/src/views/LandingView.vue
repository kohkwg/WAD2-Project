<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import LandingWelcome from '../components/landing/LandingWelcome.vue';
import AccountDashboard from '../components/landing/AccountDashboard.vue';
import { getCurrentUser, getUser, getMyRsvps, getSavedEvents, onAuthChange } from '@/utils/api';

// the landing page is the front door: signed-out visitors sign in or create an account here;
// signed-in people (and the demo account) see who they are and what's next.

const checking = ref(true);

const session = ref(null); // { id, email } from auth

const profile = ref(null); // name and interests

const rsvps = ref([]);

const saved = ref([]);

const loadError = ref('');

let active = true,
  accountRequest = 0;

async function loadAccount() {
  const ticket = ++accountRequest;
  loadError.value = '';
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }
  if (!active || ticket !== accountRequest) return;
  if (session.value?.id !== user?.id) {
    profile.value = null;
    rsvps.value = [];
    saved.value = [];
  }
  session.value = user;
  if (!user) {
    checking.value = false;
    return;
  }
  const results = await Promise.allSettled([getUser(), getMyRsvps(), getSavedEvents()]);
  if (!active || ticket !== accountRequest) return;
  const [me, mine, savedEvents] = results;
  if (me.status === 'fulfilled') profile.value = me.value;
  if (mine.status === 'fulfilled') rsvps.value = mine.value;
  if (savedEvents.status === 'fulfilled') saved.value = savedEvents.value;
  const failed = ['profile', 'RSVPs', 'saved events'].filter((_, index) => results[index].status === 'rejected');
  loadError.value = failed.length ? `Could not refresh your ${failed.join(', ')}.` : '';
  checking.value = false;
}

let stopListening = () => {};

onMounted(() => {
  loadAccount();
  stopListening = onAuthChange(() => loadAccount());
});

onBeforeUnmount(() => {
  active = false;
  accountRequest++;
  stopListening();
});

// coming straight from the sign-in form earns a little celebration on the dashboard avatar

const justJoined = ref(false);

function signedIn() {
  justJoined.value = true;
  checking.value = true;
  loadAccount();
}
</script>

<template>
  <div class="landing-page">
    <div v-if="checking" class="landing-checking" role="status">
      <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
      <span>Checking your account…</span>
    </div>

    <LandingWelcome v-else-if="!session" @signed-in="signedIn" />

    <AccountDashboard
      v-else
      :session="session"
      :profile="profile"
      :rsvps="rsvps"
      :saved="saved"
      :load-error="loadError"
      :just-joined="justJoined"
      @refresh="loadAccount"
    />
  </div>
</template>

<style scoped>
.landing-page {
  min-height: calc(100svh - 150px);
  padding: 28px var(--page-gutter) 40px;
}

.landing-checking {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 40vh;
  color: var(--bookedz-muted);
}

@media (max-width: 767px) {
  .landing-page {
    padding: 18px var(--page-gutter) 32px;
  }
}
</style>
