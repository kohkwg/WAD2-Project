<script setup>
import { computed, defineAsyncComponent, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { subscribeSocialUpdates } from '../utils/profileSocial.js'
import ProfileView from './ProfileView.vue'
const GroupsPanel = defineAsyncComponent(() => import('../components/profile/GroupsPanel.vue'))
const FriendsPanel = defineAsyncComponent(() => import('../components/profile/FriendsPanel.vue'))
const route = useRoute()
const tab = computed(() => ['groups', 'friends'].includes(route.query.tab) ? route.query.tab : 'edit')
const friendsVisited = ref(false)
watch(tab, value => { if (value === 'friends') friendsVisited.value = true }, { immediate: true })
const updates = ref(0)
let stopUpdates = () => {}
onMounted(() => { stopUpdates = subscribeSocialUpdates(() => { updates.value++ }, () => tab.value !== 'edit') })
onBeforeUnmount(() => stopUpdates())
const groupsVisited = ref(false)
watch(tab, value => { if (value === 'groups') groupsVisited.value = true }, { immediate: true })
</script>

<template>
  <div class="account-page py-4 py-md-5">
    <header class="account-heading">
      <p class="text-body-secondary mb-2">Your Bookedz account</p>
      <h1>Your profile</h1>
      <p class="text-body-secondary">Keep your details current and make plans with your people.</p>
    </header>
    <nav class="account-nav mb-4" aria-label="Profile tools">
      <RouterLink :to="{ path: '/profile', query: { ...route.query, tab: 'edit' } }" :class="{ active: tab === 'edit' }" :aria-current="tab === 'edit' ? 'page' : undefined"><strong>Edit profile</strong><span>Your details and interests</span></RouterLink>
      <RouterLink :to="{ path: '/profile', query: { ...route.query, tab: 'groups' } }" :class="{ active: tab === 'groups' }" :aria-current="tab === 'groups' ? 'page' : undefined"><strong>Groups</strong><span>Invite friends and join your people</span></RouterLink>
      <RouterLink :to="{ path: '/profile', query: { ...route.query, tab: 'friends' } }" :class="{ active: tab === 'friends' }" :aria-current="tab === 'friends' ? 'page' : undefined"><strong>Friends</strong><span>Find people and add friends</span></RouterLink>
    </nav>
    <ProfileView v-show="tab === 'edit'" embedded />
    <FriendsPanel :visible="tab === 'friends'" :updates="updates" v-if="friendsVisited" v-show="tab === 'friends'" />
    <GroupsPanel :visible="tab === 'groups'" :updates="updates" v-if="groupsVisited" v-show="tab === 'groups'" />
  </div>
</template>

<style scoped>
.account-page { width: 100%; min-width: 0; }
.account-heading { margin-bottom: 2rem; }
.account-heading h1 { color: var(--bookedz-ink); font: 700 clamp(2rem, 5vw, 3rem)/1.1 var(--bookedz-heading); }
.account-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; padding: .45rem; border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-glass-solid); }
.account-nav a { display: grid; align-content: center; min-height: 58px; padding: .55rem .7rem; gap: .1rem; border: 1px solid transparent; border-radius: .75rem; color: var(--bookedz-muted); text-decoration: none; overflow-wrap: anywhere; }
.account-nav a:hover { background: var(--bookedz-glass-hover); color: var(--bookedz-ink); }
.account-nav a.active { border-color: var(--bookedz-border); background: var(--bookedz-surface); box-shadow: var(--bookedz-tab-shadow); color: var(--bookedz-primary-dark); }
.account-nav span { font-size: .8rem; color: var(--bookedz-muted); }
@media (max-width: 575px) { .account-nav { grid-template-columns: 1fr; } .account-nav span { font-size: .72rem; } }
</style>
