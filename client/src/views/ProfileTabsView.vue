<script setup>
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ref } from 'vue';
import ProfileView from './ProfileView.vue';
import { USING_SUPABASE, signOut } from '@/utils/api';

// friends moved to community (a side panel there), so old ?tab=friends links go there.
// the profile groups tab was removed; go together groups live in community.

const route = useRoute();

const router = useRouter();
if (route.query.tab === 'friends') router.replace({
  path: '/community',
  hash: '#friends'
});else if (route.query.tab) router.replace({
  path: '/profile'
});

// phones have no sidebar (the bottom bar replaced the menu), so sign out lives here too.

const signingOut = ref(false);

const signOutError = ref('');

async function leave() {
  signingOut.value = true;
  signOutError.value = '';
  try {
    await signOut();
    await router.push('/');
  } catch {
    signOutError.value = 'Sign out failed. Please try again.';
  } finally {
    signingOut.value = false;
  }
}
</script>

<template>
  <div class="account-page">
    <header class="account-heading">
      <p class="text-body-secondary mb-2">Your Dino account</p>
      <h1>Your profile</h1>
      <p class="text-body-secondary">Keep your details and interests current. Friends are in <RouterLink to="/community#friends">Community</RouterLink>.</p>
    </header>
    <ProfileView embedded />
    <div v-if="USING_SUPABASE" class="account-signout d-md-none">
      <button
      type="button"
      class="btn btn-outline-secondary"
      :disabled="signingOut"
      @click="leave">{{ signingOut ? 'Signing out…' : 'Sign out' }}</button>
      <p v-if="signOutError" class="text-danger mt-2 mb-0" role="alert">{{ signOutError }}</p>
    </div>
  </div>
</template>

<style scoped>
.account-page {
  width: 100%;
  min-width: 0;
}

.account-heading {
  margin-bottom: 2rem;
}

.account-signout {
  margin-top: 1.5rem;
}

.account-signout .btn {
  width: 100%;
  min-height: 44px;
}

.account-heading h1 {
  color: var(--bookedz-ink);
  font: 700 clamp(2rem, 5vw, 3rem)/1.1 var(--bookedz-heading);
}

.account-heading a {
  color: inherit;
  font-weight: 700;
}
</style>
