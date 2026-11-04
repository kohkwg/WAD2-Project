<script setup>
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ProfileView from './ProfileView.vue'

// Friends moved to Community (a side panel there), so old ?tab=friends links go there.
// The profile groups tab was removed; Go together groups live in Community.
const route = useRoute()
const router = useRouter()
if (route.query.tab === 'friends') router.replace({ path: '/community', hash: '#friends' })
else if (route.query.tab) router.replace({ path: '/profile' })
</script>

<template>
  <div class="account-page py-4 py-md-5">
    <header class="account-heading">
      <p class="text-body-secondary mb-2">Your Bookedz account</p>
      <h1>Your profile</h1>
      <p class="text-body-secondary">Keep your details and interests current. Friends are in <RouterLink to="/community#friends">Community</RouterLink>.</p>
    </header>
    <ProfileView embedded />
  </div>
</template>

<style scoped>
.account-page { width: 100%; min-width: 0; }
.account-heading { margin-bottom: 2rem; }
.account-heading h1 { color: var(--bookedz-ink); font: 700 clamp(2rem, 5vw, 3rem)/1.1 var(--bookedz-heading); }
.account-heading a { color: inherit; font-weight: 700; }
</style>
