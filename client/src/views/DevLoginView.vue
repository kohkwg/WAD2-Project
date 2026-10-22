<script setup>
// BOILERPLATE (dev only): sign in with a Supabase email/password user, then list
// links to every check-in page for the events you're on. Login isn't a graded
// feature; this exists so we can test Feature 3 before the real auth pages merge.
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const user = ref(null)
const staffEvents = ref([]) // events I'm an organiser/helper on
const myRegistrations = ref([]) // events I've registered for

async function loadMyEvents() {
  const uid = user.value.id
  const [staff, regs] = await Promise.all([
    supabase.from('event_members').select('event_id, member_role, events(title)').eq('user_id', uid),
    supabase.from('registrations').select('event_id, status, events(title)').eq('user_id', uid),
  ])
  staffEvents.value = staff.data ?? []
  myRegistrations.value = regs.data ?? []
}

async function signIn() {
  busy.value = true
  error.value = ''
  const { data, error: err } = await supabase.auth.signInWithPassword({
    email: email.value.trim(),
    password: password.value,
  })
  busy.value = false
  if (err) {
    error.value = err.message
    return
  }
  user.value = data.user
  if (route.query.redirect) return router.replace(String(route.query.redirect))
  await loadMyEvents()
}

async function signOut() {
  await supabase.auth.signOut()
  user.value = null
  staffEvents.value = []
  myRegistrations.value = []
}

onMounted(async () => {
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    user.value = data.session.user
    await loadMyEvents()
  }
})
</script>

<template>
  <main class="container py-4" style="max-width: 640px">
    <h1 class="h3 mb-1">Bookedz</h1>
    <p class="text-body-secondary small mb-4">Dev sign-in for testing check-in. Not part of the demo.</p>

    <form v-if="!user" class="card card-body" @submit.prevent="signIn">
      <div v-if="route.query.redirect" class="alert alert-info py-2 small">Sign in to continue.</div>
      <div class="mb-3">
        <label for="email" class="form-label">Email</label>
        <input id="email" v-model="email" type="email" class="form-control" autocomplete="username" required />
      </div>
      <div class="mb-3">
        <label for="password" class="form-label">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          class="form-control"
          autocomplete="current-password"
          required
        />
      </div>
      <div v-if="error" class="alert alert-danger py-2" role="alert">{{ error }}</div>
      <button class="btn btn-primary w-100" :disabled="busy">
        <span v-if="busy" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Sign in
      </button>
    </form>

    <template v-else>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <span class="small">Signed in as <strong>{{ user.email }}</strong></span>
        <button class="btn btn-outline-secondary btn-sm" @click="signOut">Sign out</button>
      </div>

      <h2 class="h6 text-uppercase text-body-secondary">Events I run</h2>
      <p v-if="!staffEvents.length" class="small text-body-secondary">None.</p>
      <div v-for="e in staffEvents" :key="e.event_id" class="card card-body mb-2">
        <div class="fw-semibold">
          {{ e.events?.title }} <span class="badge text-bg-secondary ms-1">{{ e.member_role }}</span>
        </div>
        <div class="d-flex flex-wrap gap-2 mt-2">
          <RouterLink class="btn btn-sm btn-primary" :to="`/organiser/events/${e.event_id}/check-in`">
            Check-in station
          </RouterLink>
          <RouterLink class="btn btn-sm btn-outline-primary" :to="`/organiser/events/${e.event_id}/venue-qr`">
            Venue QR
          </RouterLink>
          <RouterLink class="btn btn-sm btn-outline-primary" :to="`/organiser/events/${e.event_id}/attendance`">
            Attendance
          </RouterLink>
        </div>
      </div>

      <h2 class="h6 text-uppercase text-body-secondary mt-4">My registrations</h2>
      <p v-if="!myRegistrations.length" class="small text-body-secondary">None.</p>
      <div v-for="r in myRegistrations" :key="r.event_id" class="card card-body mb-2">
        <div class="fw-semibold">
          {{ r.events?.title }} <span class="badge text-bg-light border ms-1">{{ r.status }}</span>
        </div>
        <div class="d-flex flex-wrap gap-2 mt-2">
          <RouterLink class="btn btn-sm btn-primary" :to="`/events/${r.event_id}/ticket`">My ticket</RouterLink>
          <RouterLink class="btn btn-sm btn-outline-primary" :to="`/events/${r.event_id}/check-in`">
            Scan venue QR
          </RouterLink>
        </div>
      </div>
    </template>
  </main>
</template>
