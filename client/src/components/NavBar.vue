<script setup>
import { themePreference, setTheme } from '../lib/theme.js'
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { USING_SUPABASE, getCurrentUser, onAuthChange, signOut, resetDemoData } from '../utils/api.js'

const route = useRoute()
const router = useRouter()
const menuOpen = ref(false)
const menuToggle = ref(null)
const user = ref(null)
const hasSession = computed(() => Boolean(user.value))
const accountName = computed(() => user.value?.email?.split('@')[0] || 'Your account')
const signingOut = ref(false)
const authError = ref('')
let stopListening = () => {}
let disposed = false
let authRevision = 0
onMounted(async () => {
  stopListening = onAuthChange(nextUser => { authRevision++; user.value = nextUser })
  const revision = authRevision
  try {
    const currentUser = await getCurrentUser()
    if (!disposed && revision === authRevision) user.value = currentUser
  } catch { /* Anonymous navigation remains usable when session lookup fails. */ }
})
onUnmounted(() => { disposed = true; stopListening() })
watch(() => route.fullPath, (_path, previous) => {
  if (previous !== '/') menuOpen.value = false
})
function closeMenu() {
  if (!menuOpen.value) return
  menuOpen.value = false
  menuToggle.value?.focus()
}
async function logOut() {
  signingOut.value = true
  authError.value = ''
  try { await signOut(); user.value = null; await router.push('/login') }
  catch { authError.value = 'Sign out failed. Please try again.' }
  finally { signingOut.value = false }
}
function resetDemo() {
  if (!window.confirm('Reset demo data? This removes saved events, RSVPs and organiser work in this browser.')) return
  resetDemoData()
  window.location.reload()
}
</script>

<template>
  <nav class="navbar navbar-expand-lg app-navbar" aria-label="Main navigation" @keydown.esc="closeMenu">
    <div class="container nav-glass">
      <RouterLink class="navbar-brand" to="/discover" aria-label="OpenJio" translate="no">
        <svg class="brand-symbol" viewBox="0 0 32 36" fill="none" aria-hidden="true"><path d="M4 4h15a9 9 0 0 1 0 18H4V4Z" fill="currentColor"/><path d="M4 14h15a9 9 0 0 1 0 18H4V14Z" fill="currentColor"/><path d="m11 17 4 4 8-9" stroke="var(--bookedz-surface)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        OpenJio
      </RouterLink>
      <button ref="menuToggle" class="navbar-toggler" type="button" aria-controls="mainNav" :aria-expanded="menuOpen" aria-label="Toggle navigation" @click="menuOpen = !menuOpen"><span class="navbar-toggler-icon"></span></button>
      <div id="mainNav" class="collapse navbar-collapse" :class="{ show: menuOpen }">
        <ul class="navbar-nav me-auto">
          <li class="nav-item"><RouterLink class="nav-link" active-class="active" to="/discover">Discover</RouterLink></li>
          <template v-if="hasSession">
            <li class="nav-item"><RouterLink class="nav-link" active-class="active" to="/hangouts">Hangouts</RouterLink></li>
            <li class="nav-item"><RouterLink class="nav-link" active-class="active" to="/my-rsvps">My RSVPs</RouterLink></li>
            <li class="nav-item"><RouterLink class="nav-link" active-class="" :class="{ active: route.path.startsWith('/organiser/events') && route.path !== '/organiser/events/new' }" to="/organiser/events">My events</RouterLink></li>
          </template>
        </ul>
        <div class="nav-account">
          <label class="theme-control"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9A9 9 0 0 1 12 3Z"/></svg><span class="visually-hidden">Color theme</span><select :value="themePreference" name="color-theme" @change="setTheme($event.target.value)"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
          <RouterLink v-if="hasSession" to="/organiser/events/new" class="nav-create" active-class="active"><span aria-hidden="true">+</span> Create event</RouterLink>
          <template v-if="USING_SUPABASE && hasSession">
            <RouterLink to="/profile" class="nav-profile" aria-label="Your profile"><span class="nav-avatar" aria-hidden="true">{{ accountName.charAt(0).toUpperCase() }}</span><span class="nav-account-name">{{ accountName }}</span></RouterLink>
            <button class="nav-quiet" type="button" :disabled="signingOut" @click="logOut">{{ signingOut ? 'Signing out…' : 'Sign out' }}</button>
          </template>
          <RouterLink v-else-if="USING_SUPABASE" to="/login" class="nav-sign-in">Sign in <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 10h12m-4-4 4 4-4 4"/></svg></RouterLink>
          <button v-else type="button" class="nav-quiet" @click="resetDemo">Reset demo data</button>
        </div>
        <p v-if="authError" class="nav-auth-error" role="alert">{{ authError }}</p>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.app-navbar { position: sticky; top: 0; padding: 12px 24px; min-height: 88px; border: 0; background: transparent; }
.app-navbar > .nav-glass { max-width: 1440px; min-height: 64px; gap: 24px; padding: 8px 20px; border: 1px solid var(--bookedz-glass-border); border-radius: 24px; background: var(--bookedz-glass-solid); box-shadow: var(--bookedz-glass-shadow); }
@supports (backdrop-filter: blur(20px)) { .app-navbar > .nav-glass { background: var(--bookedz-glass); backdrop-filter: blur(20px) saturate(1.35); -webkit-backdrop-filter: blur(20px) saturate(1.35); } }
.app-navbar .navbar-brand { margin: 0 24px 0 0; font-size: 1.65rem; font-weight: 700; letter-spacing: -.06em; color: var(--bookedz-ink) !important; }
.app-navbar .nav-link { position: relative; padding: 11px 15px; color: var(--bookedz-muted); border-radius: 14px; font-size: .9rem; font-weight: 550; }
.app-navbar .nav-link:hover,.nav-quiet:hover,.nav-profile:hover { background: var(--bookedz-glass-hover); color: var(--bookedz-ink); }
.app-navbar .nav-link.active { background: var(--bookedz-glass-active); color: var(--bookedz-primary-dark); font-weight: 650; }
.theme-control { display: inline-flex; align-items: center; gap: 4px; min-width: 0; margin: 0; color: var(--bookedz-muted); }.theme-control svg { width: 18px; height: 18px; }.theme-control select { min-height: 44px; max-width: 88px; padding: 8px 4px; border: 0; border-radius: 10px; background: transparent; color: inherit; font-size: .8rem; }.theme-control option { background: var(--bookedz-surface); color: var(--bookedz-ink); }
.nav-account { display: flex; align-items: center; gap: 10px; min-width: 0; }
.nav-create,.nav-sign-in,.nav-quiet,.nav-profile { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 9px 15px; border: 0; border-radius: 14px; text-decoration: none; font-size: .875rem; font-weight: 600; white-space: nowrap; }
.nav-create,.nav-sign-in { background: var(--bookedz-ink); color: var(--bookedz-surface); }
.nav-create:hover,.nav-sign-in:hover,.nav-create.active { background: var(--bookedz-primary-dark); color: var(--bookedz-surface); }
.nav-create > span { font-size: 1.25rem; line-height: 1; }
.nav-sign-in svg { width: 20px; height: 20px; }
.nav-quiet,.nav-profile { background: transparent; color: var(--bookedz-muted); }
.nav-profile { padding: 4px 8px; }
.nav-avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--bookedz-glass-active); color: var(--bookedz-primary-dark); }
.nav-account-name { max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
.nav-auth-error { margin: 0; padding: 8px; color: var(--bookedz-danger); font-size: .875rem; }
.navbar-toggler { width: 44px; height: 44px; padding: 7px; border-color: var(--bookedz-border); border-radius: 12px; }
@media(max-width:1199px) { .nav-account-name { display: none; }.app-navbar .navbar-brand { margin-right: 0; }.nav-account { gap: 4px; } }
@media(max-width:991.98px) {
 .app-navbar { padding: 10px 16px; }.app-navbar > .nav-glass { padding: 9px 14px; border-radius: 22px; }
 .app-navbar .navbar-collapse { padding: 12px 0 4px; border-top: 1px solid var(--bookedz-border); margin-top: 8px; max-height: calc(100svh - 130px); overflow-y: auto; overscroll-behavior: contain; }
 .navbar-nav { gap: 4px; }.nav-account { border-top: 1px solid var(--bookedz-border); padding-top: 12px; margin-top: 12px; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
 .nav-account-name { display: inline; }.nav-create { margin-right: auto; }
}
@media(prefers-reduced-transparency:reduce) { .app-navbar > .nav-glass { background: var(--bookedz-glass-solid); backdrop-filter: none; } }
</style>
