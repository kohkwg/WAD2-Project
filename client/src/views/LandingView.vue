<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import LandingWelcome from '../components/landing/LandingWelcome.vue'
import CountUp from '@/components/ui/CountUp.vue'
import { USING_SUPABASE, getCurrentUser, getUser, getMyRsvps, getSavedEvents, onAuthChange, signOut } from '@/utils/api'
import { formatEventTime } from '@/utils/helpers'
import { toast } from '@/composables/useToast'

// The landing page is the front door: signed-out visitors sign in or create an account here;
// signed-in people (and the demo account) see who they are and what's next.
const router = useRouter()
const checking = ref(true)
const session = ref(null) // { id, email } from auth
const profile = ref(null) // name and interests
const rsvps = ref([])
const savedCount = ref(0)
const signingOut = ref(false)
const loadError = ref('')

async function loadAccount() {
  loadError.value = ''
  try {
    session.value = await getCurrentUser()
  } catch {
    session.value = null
  }
  if (!session.value) { checking.value = false; return }
  try {
    const [me, mine, saved] = await Promise.all([getUser(), getMyRsvps(), getSavedEvents().catch(() => [])])
    profile.value = me
    rsvps.value = mine
    savedCount.value = saved.length
  } catch (error) {
    loadError.value = error.message
  } finally {
    checking.value = false
  }
}

let stopListening = () => {}
onMounted(() => {
  loadAccount()
  stopListening = onAuthChange(() => loadAccount())
})
onBeforeUnmount(() => stopListening())

const name = computed(() => profile.value?.name || session.value?.email?.split('@')[0] || 'there')
const firstName = computed(() => name.value.split(/\s+/)[0])
import { useMyDino } from '@/lib/myDino'
const { mySrc: myDinoSrc } = useMyDino()
const initials = computed(() => name.value.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase())
const now = Date.now()
const upcoming = computed(() => rsvps.value.filter((r) => ['confirmed', 'pending', 'waitlisted', 'offered'].includes(r.status) && new Date(r.event?.endTime || r.event?.startTime) > now))
const going = computed(() => upcoming.value.filter((r) => r.status === 'confirmed'))
const offers = computed(() => upcoming.value.filter((r) => r.status === 'offered'))
const nextPlan = computed(() => going.value[0] || null)
const greeting = computed(() => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
})

async function logOut() {
  signingOut.value = true
  try {
    await signOut()
    session.value = null
    profile.value = null
    toast('Signed out')
  } catch (error) {
    toast(error.message || 'Sign out failed. Please try again.', { tone: 'error' })
  } finally {
    signingOut.value = false
  }
}
function signedIn() {
  checking.value = true
  loadAccount()
}
</script>

<template>
  <div class="landing-page">
    <div v-if="checking" class="landing-checking" role="status">
      <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
      <span>Checking your account…</span>
    </div>

    <LandingWelcome v-else-if="!session" @signed-in="signedIn" />

    <section v-else class="account" aria-labelledby="account-title">
      <header class="account-head">
        <span class="account-avatar" aria-hidden="true"><img v-if="myDinoSrc" class="dino-face" :src="myDinoSrc" alt="">{{ myDinoSrc ? '' : initials }}</span>
        <div class="min-w-0">
          <p class="account-greeting">{{ greeting }},</p>
          <h1 id="account-title" class="page-title m-0">{{ firstName }}</h1>
          <p class="account-email text-meta">{{ session.email }}</p>
        </div>
      </header>

      <p v-if="!USING_SUPABASE" class="account-demo">
        <strong>Demo mode.</strong> You’re signed in as the sample account {{ name }}. Everything is stored in this browser only;
        use <em>Reset demo data</em> in the top bar to start over.
      </p>
      <p v-dismissible v-if="loadError" class="alert alert-warning">Some of your details couldn’t load: {{ loadError }}</p>

      <dl class="account-stats stagger-in">
        <div><dt>Going</dt><dd><CountUp :value="going.length" /></dd></div>
        <div><dt>All upcoming RSVPs</dt><dd><CountUp :value="upcoming.length" /></dd></div>
        <div><dt>Saved for later</dt><dd><CountUp :value="savedCount" /></dd></div>
      </dl>

      <RouterLink v-if="offers.length" to="/my-rsvps" class="account-offer attention-once">
        <strong>A spot opened up for {{ offers[0].event.title }}.</strong>
        <span>Confirm it in My RSVPs before it goes to the next person.</span>
      </RouterLink>

      <div class="account-grid">
        <section class="account-card" aria-labelledby="next-plan-title">
          <h2 id="next-plan-title" class="section-title">Your next plan</h2>
          <template v-if="nextPlan">
            <p class="account-next-title">{{ nextPlan.event.title }}</p>
            <p class="text-meta m-0">{{ formatEventTime(nextPlan.event) }}</p>
            <p class="text-meta">{{ nextPlan.event.venue?.name || 'Venue to be announced' }}</p>
            <RouterLink :to="`/events/${nextPlan.event.id}/rsvp`" class="btn btn-outline-secondary btn-sm">View event</RouterLink>
          </template>
          <template v-else>
            <p class="text-meta">Nothing confirmed yet. Find something to do this week.</p>
            <RouterLink to="/discover" class="btn btn-primary btn-sm">Explore events</RouterLink>
          </template>
        </section>

        <section class="account-card" aria-labelledby="interests-title">
          <h2 id="interests-title" class="section-title">Your interests</h2>
          <div v-if="profile?.interests?.length" class="account-interests">
            <span v-for="interest in profile.interests" :key="interest" class="account-interest cat-tint" :class="`cat-${interest}`">{{ interest.charAt(0).toUpperCase() + interest.slice(1) }}</span>
          </div>
          <p v-else class="text-meta">No interests picked yet.</p>
          <RouterLink v-if="USING_SUPABASE" to="/profile" class="btn btn-outline-secondary btn-sm">Edit profile</RouterLink>
          <p v-else class="text-caption text-secondary m-0">Profile editing is available in the live app.</p>
        </section>
      </div>

      <nav class="account-links" aria-label="Go to">
        <RouterLink to="/discover" class="btn btn-primary">Discover events</RouterLink>
        <RouterLink to="/my-rsvps" class="btn btn-outline-secondary">My RSVPs</RouterLink>
        <RouterLink to="/community" class="btn btn-outline-secondary">Community</RouterLink>
        <button v-if="USING_SUPABASE" type="button" class="btn btn-outline-secondary" :disabled="signingOut" @click="logOut">{{ signingOut ? 'Signing out…' : 'Sign out' }}</button>
      </nav>
    </section>
  </div>
</template>

<style scoped>
.landing-page { min-height: calc(100svh - 150px); padding: 28px 24px 40px; }
.landing-checking { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 40vh; color: var(--bookedz-muted); }
.account { max-width: 880px; margin: 0 auto; display: grid; gap: 18px; }
.account-head { display: flex; align-items: center; gap: 16px; }
.dino-face { width: 100%; height: 100%; object-fit: contain; }
.account-avatar { overflow: hidden; display: grid; place-items: center; flex: none; width: 64px; height: 64px; border-radius: 50%; background: var(--bookedz-orange-soft); color: var(--bookedz-primary-dark); font: 700 1.4rem var(--bookedz-heading); animation: pop-once var(--bookedz-motion-slip) var(--bookedz-ease-stamp); }
.min-w-0 { min-width: 0; }
.account-greeting { margin: 0; color: var(--bookedz-muted); }
.account-email { margin: 2px 0 0; color: var(--bookedz-muted); overflow-wrap: anywhere; }
.account-demo { margin: 0; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--bookedz-yellow) 60%, var(--bookedz-border)); border-radius: 14px; background: color-mix(in srgb, var(--bookedz-yellow) 18%, var(--bookedz-surface)); font-size: .95rem; }
.account-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0; }
.account-stats > div { display: grid; gap: 4px; padding: 14px 18px; border: 1px solid var(--bookedz-border); border-radius: 18px; background: var(--bookedz-surface); }
.account-stats dt { order: 2; color: var(--bookedz-muted); font-size: var(--text-small); font-weight: 500; }
.account-stats dd { order: 1; margin: 0; font: 600 1.6rem var(--bookedz-heading); }
.account-offer { display: grid; gap: 2px; padding: 14px 16px; border-radius: 16px; background: color-mix(in srgb, var(--bookedz-yellow) 30%, var(--bookedz-surface)); color: var(--bookedz-ink); text-decoration: none; }
.account-offer:hover { color: var(--bookedz-ink); }
.account-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.account-card { display: grid; align-content: start; gap: 8px; padding: 18px; border: 1px solid var(--bookedz-border); border-radius: 20px; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.account-card .section-title { margin: 0 0 4px; }
.account-card .btn { justify-self: start; min-height: 40px; }
.account-next-title { margin: 0; font-weight: 700; font-size: 1.1rem; overflow-wrap: anywhere; }
.account-interests { display: flex; flex-wrap: wrap; gap: 6px; }
.account-interest { padding: 4px 12px; border-radius: 99px; font-size: .88rem; font-weight: 600; }
.account-links { display: flex; flex-wrap: wrap; gap: 8px; }
.account-links .btn { min-height: 44px; }
@media (max-width: 767px) { .landing-page { padding: 18px 12px 32px; } .account-grid { grid-template-columns: 1fr; } .account-stats { gap: 8px; } .account-stats > div { padding: 12px; } }
@media (prefers-reduced-motion: reduce) { .account-avatar { animation: none; } }
</style>
