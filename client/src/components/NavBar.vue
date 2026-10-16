<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { USING_SUPABASE, getCurrentUser, onAuthChange, signOut, resetDemoData } from '../utils/api.js'

const router = useRouter()
const user = ref(null) // { id, email } of whoever is signed in
let stopListening = () => {}

onMounted(async () => {
  user.value = await getCurrentUser()
  // Keep the navbar up to date when they sign in or out
  stopListening = onAuthChange((newUser) => {
    user.value = newUser
  })
})

onUnmounted(() => stopListening())

async function logOut() {
  await signOut()
  router.push('/login')
}

function resetDemo() {
  resetDemoData()
  window.location.reload() // reload so every page reads the fresh demo data
}
</script>

<template>
  <!-- Placeholder navbar so the Feature 2 pages can be reached. Swap for the team's shared one. -->
  <nav class="navbar navbar-expand-lg bg-white border-bottom shadow-sm">
    <div class="container">
      <RouterLink class="navbar-brand fw-bold text-primary" to="/events">Bookedz</RouterLink>

      <!-- Hamburger button on small screens; data-bs-target must match the id below -->
      <button
        class="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#mainNav"
        aria-controls="mainNav"
        aria-expanded="false"
        aria-label="Toggle navigation"
      >
        <span class="navbar-toggler-icon"></span>
      </button>

      <div class="collapse navbar-collapse" id="mainNav">
        <!-- active-class="active": Bootstrap highlights the link of the page you are on -->
        <ul class="navbar-nav me-auto">
          <li class="nav-item">
            <RouterLink class="nav-link" active-class="active" to="/events">Events</RouterLink>
          </li>
          <li class="nav-item">
            <RouterLink class="nav-link" active-class="active" to="/my-rsvps">My RSVPs</RouterLink>
          </li>
          <li class="nav-item ms-lg-4">
            <span class="nav-link text-uppercase small fw-semibold text-secondary">Organiser</span>
          </li>
          <li class="nav-item">
            <RouterLink class="nav-link" active-class="active" to="/organiser/events">
              My events
            </RouterLink>
          </li>
          <li class="nav-item">
            <RouterLink class="nav-link" active-class="active" to="/organiser/events/new">
              Create event
            </RouterLink>
          </li>
        </ul>

        <!-- Supabase: real accounts -->
        <div v-if="USING_SUPABASE && user" class="d-flex align-items-center gap-2">
          <span class="small text-secondary">{{ user.email }}</span>
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="logOut">
            Sign out
          </button>
        </div>

        <!-- Mock: demo data in this browser -->
        <div v-else-if="!USING_SUPABASE" class="d-flex align-items-center gap-2">
          <span class="badge text-bg-warning" title="Add Supabase keys to client/.env to use the real database">
            Mock data
          </span>
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="resetDemo">
            Reset demo data
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>
