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
// Categories and Map are views inside Discover (its own links and Map/List switch), so all count as Discover
const isOnDiscover = computed(() => route.path === '/discover')
const isMyEvents = computed(() => route.path.startsWith('/organiser/events') && route.path !== '/organiser/events/new')
// Phones get a bottom tab bar for signed-in (and demo) users, except on bare invite pages
const showBottomTabs = computed(() => hasSession.value && !route.path.startsWith('/j/'))
const ICONS = {
  discover: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10M10 20v-5h4v5',
  community: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM22 20v-2a4 4 0 0 0-3-3.9M15.5 3.7a3.5 3.5 0 0 1 0 6.6',
  rsvps: 'M4 6.5h16V20H4zM4 11h16M8 3.5v5M16 3.5v5',
  events: 'M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zM14 6v12',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
}
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
watch(() => [route.fullPath, route.matched.length], (_next, previous) => {
  // Initial route resolution must not close a menu the visitor just opened.
  if (previous[1] > 0) menuOpen.value = false
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
  <nav class="app-navbar" aria-label="Main navigation" @keydown.esc="closeMenu">
    <div v-if="menuOpen" class="sidebar-scrim" aria-hidden="true" @click="closeMenu"></div>
    <div id="mainNav" class="app-sidebar" :class="{ show: menuOpen }">
      <RouterLink class="sidebar-brand" to="/" aria-label="Bookedz" translate="no">
        <svg class="brand-symbol" viewBox="0 0 32 36" fill="none" aria-hidden="true"><path d="M4 4h15a9 9 0 0 1 0 18H4V4Z" fill="currentColor"/><path d="M4 14h15a9 9 0 0 1 0 18H4V14Z" fill="currentColor"/><path d="m11 17 4 4 8-9" stroke="var(--bookedz-surface)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Bookedz
      </RouterLink>
      <ul class="sidebar-links">
        <li><RouterLink class="side-link" :class="{ active: isOnDiscover }" active-class="" exact-active-class="" to="/discover"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.discover" /></svg>Discover</RouterLink></li>
        <li><RouterLink class="side-link" active-class="active" to="/community"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.community" /></svg>Community</RouterLink></li>
        <template v-if="hasSession">
          <li><RouterLink class="side-link" active-class="active" to="/my-rsvps"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.rsvps" /></svg>My RSVPs</RouterLink></li>
          <li><RouterLink class="side-link" active-class="" :class="{ active: isMyEvents }" to="/organiser/events"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.events" /></svg>My events</RouterLink></li>
        </template>
      </ul>
      <ul class="sidebar-links sidebar-links--secondary">
        <li v-if="hasSession && USING_SUPABASE"><RouterLink class="side-link" active-class="active" to="/profile"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.settings" /></svg>Settings</RouterLink></li>
        <li><label class="theme-control sidebar-theme"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9A9 9 0 0 1 12 3Z"/></svg><span aria-hidden="true">Theme</span><span class="visually-hidden">Color theme</span><select :value="themePreference" name="color-theme" @change="setTheme($event.target.value)"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></li>
      </ul>
      <div v-if="USING_SUPABASE && hasSession" class="sidebar-account">
        <RouterLink to="/profile" class="nav-profile" aria-label="Your profile"><span class="nav-avatar" aria-hidden="true">{{ accountName.charAt(0).toUpperCase() }}</span><span class="sidebar-profile-copy"><strong>Profile</strong><span class="nav-account-name">{{ accountName }}</span></span></RouterLink>
        <button class="nav-quiet sidebar-sign-out" type="button" :disabled="signingOut" @click="logOut">{{ signingOut ? 'Signing out…' : 'Sign out' }}</button>
        <p v-if="authError" class="nav-auth-error" role="alert">{{ authError }}</p>
      </div>
    </div>
    <header class="app-topbar" :class="{ 'app-topbar--minimal': USING_SUPABASE && hasSession }">
      <!-- Own icon: Bootstrap's .navbar-toggler-icon only has an image inside a .navbar (none in light mode here) -->
      <button ref="menuToggle" class="navbar-toggler" type="button" aria-controls="mainNav" :aria-expanded="menuOpen" aria-label="Toggle navigation" @click="menuOpen = !menuOpen"><svg class="toggler-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
      <RouterLink class="topbar-brand" to="/" aria-label="Bookedz home" translate="no"><svg class="brand-symbol" viewBox="0 0 32 36" fill="none" aria-hidden="true"><path d="M4 4h15a9 9 0 0 1 0 18H4V4Z" fill="currentColor"/><path d="M4 14h15a9 9 0 0 1 0 18H4V14Z" fill="currentColor"/><path d="m11 17 4 4 8-9" stroke="var(--bookedz-surface)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg> Bookedz</RouterLink>
      <div class="nav-account">
        <RouterLink v-if="USING_SUPABASE && !hasSession" to="/login" class="nav-sign-in">Sign in <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 10h12m-4-4 4 4-4 4"/></svg></RouterLink>
        <button v-else-if="!USING_SUPABASE" type="button" class="nav-quiet" @click="resetDemo">Reset demo data</button>
      </div>
    </header>
  </nav>
  <!-- Phones: the four main destinations at thumb reach; ☰ keeps everything else. A separate
       landmark, so "Main navigation" still holds one link per destination -->
  <nav v-if="showBottomTabs" class="bottom-tabs" aria-label="Quick links">
    <RouterLink class="bottom-tab" :class="{ active: isOnDiscover }" active-class="" exact-active-class="" to="/discover"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.discover" /></svg>Discover</RouterLink>
    <RouterLink class="bottom-tab" active-class="active" to="/community"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.community" /></svg>Community</RouterLink>
    <RouterLink class="bottom-tab" active-class="active" to="/my-rsvps"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.rsvps" /></svg>My RSVPs</RouterLink>
    <RouterLink class="bottom-tab" active-class="" :class="{ active: isMyEvents }" to="/organiser/events"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.events" /></svg>My events</RouterLink>
  </nav>
</template>

<style scoped>
.app-navbar { display: contents; }
.app-sidebar { position: fixed; inset: 0 auto 0 0; z-index: 1030; width: var(--sidebar-w); display: flex; flex-direction: column; gap: 6px; padding: 24px 14px 16px; overflow-y: auto; overscroll-behavior: contain; background: var(--bookedz-surface); border-right: 1px solid var(--bookedz-border); }
.sidebar-brand, .topbar-brand { display: inline-flex; align-items: center; gap: .5rem; color: var(--bookedz-ink); font-family: var(--bookedz-heading); font-size: 1.65rem; font-weight: 700; letter-spacing: -.06em; text-decoration: none; }
.sidebar-brand { margin: 0 0 22px 10px; }
.brand-symbol { width: 32px; height: 36px; color: var(--bookedz-primary); }
.sidebar-links { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.sidebar-links--secondary { margin-top: 12px; padding-top: 14px; border-top: 1px solid var(--bookedz-border); }
.side-link { display: flex; align-items: center; gap: 14px; min-height: 48px; padding: 10px 16px; border-radius: 14px; color: var(--bookedz-muted); font-size: .92rem; font-weight: 550; text-decoration: none; transition: background-color .15s ease, color .15s ease; }
.side-link svg { flex: 0 0 22px; width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.side-link:hover { background: var(--bookedz-glass-hover); color: var(--bookedz-ink); }
.side-link.active { background: var(--bookedz-glass-active); color: var(--bookedz-primary-dark); font-weight: 650; }
.side-link:focus-visible, .topbar-brand:focus-visible, .sidebar-brand:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 2px; }
.sidebar-account { display: grid; gap: 6px; margin-top: auto; padding-top: 18px; border-top: 1px solid var(--bookedz-border); }
.sidebar-account .nav-profile { justify-content: flex-start; padding: 8px; }
.sidebar-profile-copy { display: grid; gap: 2px; min-width: 0; }
.sidebar-profile-copy strong { color: var(--bookedz-ink); font-weight: 650; }
.sidebar-account .nav-account-name { display: block; max-width: 140px; font-size: .8rem; font-weight: 400; }
.sidebar-account .sidebar-sign-out { justify-content: flex-start; padding-left: 50px; }
.sidebar-account .nav-auth-error { text-align: left; }
.app-topbar { position: sticky; top: 0; z-index: 1020; display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px 16px; min-height: 72px; padding: 12px clamp(12px, 3vw, 36px); background: color-mix(in srgb, var(--bookedz-canvas) 86%, transparent); }
@supports (backdrop-filter: blur(12px)) { .app-topbar { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); } }
.topbar-brand, .navbar-toggler { display: none; }
.nav-account { display: flex; align-items: center; gap: 10px; min-width: 0; }
.theme-control { display: inline-flex; align-items: center; gap: 4px; min-width: 0; margin: 0; color: var(--bookedz-muted); }.theme-control svg { width: 18px; height: 18px; }.theme-control select { min-height: 44px; max-width: 88px; padding: 8px 4px; border: 0; border-radius: 10px; background: transparent; color: inherit; font-size: .8rem; }.theme-control option { background: var(--bookedz-surface); color: var(--bookedz-ink); }
.sidebar-theme { display: flex; gap: 12px; min-height: 48px; padding: 0 12px 0 16px; font-size: .875rem; }
.sidebar-theme svg { flex: 0 0 22px; width: 22px; height: 22px; }
.sidebar-theme select { margin-left: auto; }
.sidebar-account :focus-visible, .sidebar-theme select:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 2px; }
@media(min-width:992px) { .app-topbar--minimal { display: none; } }
.nav-sign-in, .nav-quiet, .nav-profile { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 9px 15px; border: 0; border-radius: 14px; text-decoration: none; font-size: .875rem; font-weight: 600; white-space: nowrap; }
.nav-sign-in { background: var(--bookedz-ink); color: var(--bookedz-surface); }
.nav-sign-in:hover { background: var(--bookedz-primary-dark); color: var(--bookedz-surface); }
.nav-sign-in svg { width: 20px; height: 20px; }
.nav-quiet, .nav-profile { background: transparent; color: var(--bookedz-muted); }
.nav-quiet:hover, .nav-profile:hover { background: var(--bookedz-glass-hover); color: var(--bookedz-ink); }
.nav-profile { padding: 4px 8px; }
.nav-avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--bookedz-glass-active); color: var(--bookedz-primary-dark); }
.nav-account-name { max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
.nav-auth-error { flex-basis: 100%; margin: 0; color: var(--bookedz-danger); font-size: .875rem; text-align: right; }
.navbar-toggler { width: 44px; height: 44px; padding: 9px; border-color: var(--bookedz-control-border); border-radius: 12px; color: var(--bookedz-ink); }
.toggler-icon { display: block; width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.sidebar-scrim { display: none; }
@media(max-width:991.98px) {
  .navbar-toggler { display: block; }
  .topbar-brand { display: inline-flex; margin-right: auto; font-size: 1.45rem; }
  .topbar-brand .brand-symbol { width: 26px; height: 30px; }
  .app-sidebar { width: min(280px, 86vw); transform: translateX(-100%); visibility: hidden; transition: transform .25s ease, visibility 0s linear .25s; box-shadow: none; }
  .app-sidebar.show { transform: none; visibility: visible; transition: transform .25s ease; box-shadow: 0 0 40px rgb(41 45 50 / 18%); }
  .sidebar-scrim { display: block; position: fixed; inset: 0; z-index: 1025; background: rgb(41 45 50 / 35%); }
  .nav-account-name { display: none; }
}
@media(max-width:575.98px) { .nav-quiet { padding-inline: 8px; } .theme-control select { max-width: 70px; } }
@media(prefers-reduced-motion:reduce) { .app-sidebar, .app-sidebar.show { transition: none; } }
/* Laptops: a slim rail with each icon's short label underneath (no hover needed) gives the page
   ~156px more room; from 1200px the full sidebar returns. The width is --sidebar-w in main.css. */
@media (min-width: 992px) and (max-width: 1199.98px) {
  .app-sidebar { padding: 18px 8px 12px; }
  .sidebar-brand { justify-content: center; margin: 0 0 18px; gap: 0; font-size: 0; }
  .side-link { flex-direction: column; justify-content: center; gap: 4px; min-height: 60px; padding: 8px 2px; font-size: .7rem; line-height: 1.15; text-align: center; }
  .side-link svg { flex-basis: auto; }
  .sidebar-theme { flex-direction: column; justify-content: center; gap: 2px; padding: 8px 2px; font-size: .7rem; }
  .sidebar-theme select { margin: 0; max-width: 100%; font-size: .7rem; }
  .sidebar-account .nav-profile { flex-direction: column; justify-content: center; gap: 4px; padding: 6px 2px; }
  .sidebar-profile-copy { text-align: center; font-size: .7rem; }
  .sidebar-account .nav-account-name { display: none; }
  .sidebar-account .sidebar-sign-out { justify-content: center; padding-inline: 2px; font-size: .7rem; white-space: normal; }
}
/* Phones: fixed tab bar; main.css pads the page by --bottom-nav-h so nothing hides behind it */
.bottom-tabs { display: none; }
@media (max-width: 767.98px) {
  .bottom-tabs { position: fixed; inset: auto 0 0; z-index: 1020; display: grid; grid-auto-columns: minmax(0, 1fr); grid-auto-flow: column; gap: 4px; padding: 6px 6px calc(6px + env(safe-area-inset-bottom)); border-top: 1px solid var(--bookedz-border); background: color-mix(in srgb, var(--bookedz-surface) 94%, transparent); }
  @supports (backdrop-filter: blur(12px)) { .bottom-tabs { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); } }
  .bottom-tab { display: grid; align-content: center; justify-items: center; gap: 2px; min-height: 52px; padding: 4px 2px; border-radius: 12px; color: var(--bookedz-muted); font-size: .72rem; font-weight: 600; line-height: 1.15; text-align: center; text-decoration: none; }
  .bottom-tab svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .bottom-tab.active { color: var(--bookedz-primary-dark); background: var(--bookedz-glass-active); font-weight: 700; }
  .bottom-tab:focus-visible { outline: 3px solid var(--bookedz-focus); outline-offset: -3px; }
}
</style>
