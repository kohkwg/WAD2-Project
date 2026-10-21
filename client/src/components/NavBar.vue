<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { USING_SUPABASE, getCurrentUser, onAuthChange, signOut, resetDemoData } from '../utils/api.js'

const route = useRoute()
const router = useRouter()
const menuOpen = ref(false)
const user = ref(null)
let stopListening = () => {}
onMounted(async () => {
  if (USING_SUPABASE) user.value = await getCurrentUser()
  stopListening = onAuthChange((nextUser) => { user.value = nextUser })
})
onUnmounted(() => stopListening())
watch(() => route.fullPath, () => { menuOpen.value = false })

async function logOut() {
  await signOut()
  router.push('/login')
}

function resetDemo() {
  if (!window.confirm('Reset demo data? This removes saved events, RSVPs and organiser work in this browser.')) return
  resetDemoData()
  window.location.reload() // reload so every page reads the fresh demo data
}
</script>

<template>
  <nav class="navbar navbar-expand-lg app-navbar" aria-label="Main navigation">
    <div class="container">
      <RouterLink class="navbar-brand fw-bold text-primary" to="/events">Bookedz</RouterLink>

      <button
        class="navbar-toggler"
        type="button"
        aria-controls="mainNav"
        :aria-expanded="menuOpen"
        aria-label="Toggle navigation"
        @click="menuOpen = !menuOpen"
      >
        <span class="navbar-toggler-icon"></span>
      </button>

      <div class="collapse navbar-collapse" :class="{ show: menuOpen }" id="mainNav">
        <!-- active-class="active": Bootstrap highlights the link of the page you are on -->
        <ul class="navbar-nav me-auto">
          <li class="nav-item">
            <RouterLink class="nav-link" active-class="active" to="/events">Events</RouterLink>
          </li>
          <li class="nav-item">
            <RouterLink class="nav-link" active-class="active" to="/my-rsvps">My RSVPs</RouterLink>
          </li>
          <li class="nav-item ms-lg-4">
            <span class="nav-section-label">Organiser</span>
          </li>
          <li class="nav-item">
            <RouterLink class="nav-link" active-class="" :class="{ active: route.path.startsWith('/organiser/events') && route.path !== '/organiser/events/new' }" to="/organiser/events">
              My events
            </RouterLink>
          </li>
          <li class="nav-item">
            <RouterLink class="nav-link" active-class="active" to="/organiser/events/new">
              Create event
            </RouterLink>
          </li>
        </ul>

        <div v-if="USING_SUPABASE && user" class="d-flex align-items-center gap-2">
          <span class="small text-secondary">{{ user.email }}</span>
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="logOut">Sign out</button>
        </div>
        <RouterLink v-else-if="USING_SUPABASE" to="/login" class="btn btn-outline-primary btn-sm">Sign in</RouterLink>
        <button v-else type="button" class="btn btn-outline-secondary btn-sm" @click="resetDemo">Reset demo data</button>
      </div>
    </div>
  </nav>
</template>
