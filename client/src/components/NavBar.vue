<script setup>
import dinoMark from '@/assets/brand/dino-mark.png'
import { dinoById } from '@/lib/dinos'
import { themePreference, setTheme } from '../lib/theme.js'
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { USING_SUPABASE, getCurrentUser, onAuthChange, signOut, resetDemoData } from '../utils/api.js'

const route = useRoute()
const router = useRouter()
const menuOpen = ref(false)
const menuToggle = ref(null)
const user = ref(null)
const userDino = computed(() => dinoById(user.value?.user_metadata?.dino))
const hasSession = computed(() => Boolean(user.value))
const accountName = computed(() => user.value?.email?.split('@')[0] || 'Your account')
const signingOut = ref(false)
const authError = ref('')
// Categories and Map are views inside Discover (its own links and Map/List switch), so all count as Discover
const isOnDiscover = computed(() => route.path === '/discover')
const isMyEvents = computed(() => route.path.startsWith('/organiser/events') && route.path !== '/organiser/events/new')
// Phones get a bottom tab bar for signed-in (and demo) users, except on bare invite pages
const showBottomTabs = computed(() => hasSession.value && !route.path.startsWith('/j/'))
// Laptops and desktops: the sidebar collapses to an icon rail. The choice is remembered;
// until someone picks, it starts collapsed below 1200px. main.css reads data-sidebar for the width.
const SIDEBAR_KEY = 'bookedz-sidebar'
const readSidebar = () => { try { return localStorage.getItem(SIDEBAR_KEY) } catch { return null } }
const collapsed = ref(readSidebar() ? readSidebar() === 'collapsed' : typeof window !== 'undefined' && window.innerWidth < 1200)
watch(collapsed, (value) => { document.documentElement.dataset.sidebar = value ? 'collapsed' : 'expanded' }, { immediate: true })
function toggleSidebar() {
  collapsed.value = !collapsed.value
  try { localStorage.setItem(SIDEBAR_KEY, collapsed.value ? 'collapsed' : 'expanded') } catch { /* private mode: not remembered */ }
}
const ICONS = {
  collapse: 'M14.5 7 9.5 12l5 5',
  // A door with an arrow leaving it, inside a circle
  signOut: 'M12 1.5a10.5 10.5 0 1 1 0 21 10.5 10.5 0 0 1 0-21ZM13.9 9.7V7.5H8.7v9h5.2v-2.2M11.5 12h6M15.6 10l2 2-2 2',
  discover: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10M10 20v-5h4v5',
  community: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM22 20v-2a4 4 0 0 0-3-3.9M15.5 3.7a3.5 3.5 0 0 1 0 6.6',
  rsvps: 'M4 6.5h16V20H4zM4 11h16M8 3.5v5M16 3.5v5',
  events: 'M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zM14 6v12',
}
// Theme icons. Auto: a small sun (top left) and moon (bottom right) split by a diagonal.
const THEME_ICONS = {
  system: 'M7 4.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4ZM7 2.4v1M7 10.6v1M2.4 7h1M10.6 7h1M3.75 3.75l.7.7M9.55 9.55l.7.7M3.75 10.25l.7-.7M9.55 4.45l.7-.7M19 5 5 19M17 12.5a4.5 4.5 0 1 0 4.5 4.5 4.5 4.5 0 0 1-4.5-4.5Z',
  light: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41',
  dark: 'M12 3a9 9 0 1 0 9 9A9 9 0 0 1 12 3Z',
}
const THEME_CYCLE = { system: { label: 'Auto', next: 'light' }, light: { label: 'Light', next: 'dark' }, dark: { label: 'Dark', next: 'system' } }
const cycleTheme = () => setTheme(THEME_CYCLE[themePreference.value].next)
// Says the current theme and what a press does, e.g. "Theme: Auto. Switch to Light"
const themeCycleLabel = computed(() => { const now = THEME_CYCLE[themePreference.value]; return `Theme: ${now.label}. Switch to ${THEME_CYCLE[now.next].label}` })
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
  try { await signOut(); user.value = null; await router.push('/') }
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
    <div id="mainNav" class="app-sidebar" :class="{ show: menuOpen, 'is-collapsed': collapsed }">
      <RouterLink class="sidebar-brand" to="/" aria-label="Dino" translate="no">
        <img class="brand-symbol" :src="dinoMark" alt="" aria-hidden="true">
        Dino
      </RouterLink>
      <ul class="sidebar-links">
        <li><RouterLink class="side-link" data-label="Discover" :class="{ active: isOnDiscover }" active-class="" exact-active-class="" to="/discover"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.discover" /></svg><span class="side-label">Discover</span></RouterLink></li>
        <li><RouterLink class="side-link" data-label="Community" active-class="active" to="/community"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.community" /></svg><span class="side-label">Community</span></RouterLink></li>
        <template v-if="hasSession">
          <li><RouterLink class="side-link" data-label="My RSVPs" active-class="active" to="/my-rsvps"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.rsvps" /></svg><span class="side-label">My RSVPs</span></RouterLink></li>
          <li><RouterLink class="side-link" data-label="My events" active-class="" :class="{ active: isMyEvents }" to="/organiser/events"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.events" /></svg><span class="side-label">My events</span></RouterLink></li>
        </template>
      </ul>
      <!-- The divider carries the desktop collapse toggle, centred on the sidebar's right edge.
           The button is fixed with no top, so it keeps its in-flow spot (the line) without being clipped. -->
      <div class="sidebar-divider">
        <button type="button" class="sidebar-collapse" :aria-expanded="!collapsed" aria-controls="mainNav" :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" :data-label="collapsed ? 'Expand' : 'Collapse'" @click="toggleSidebar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.collapse" /></svg>
        </button>
      </div>
      <ul class="sidebar-links sidebar-links--secondary">
        <li>
          <!-- Collapsed rail only: one button cycling Auto → Light → Dark; the dropdown below covers every other layout -->
          <button type="button" class="side-link sidebar-theme-cycle" :data-label="`Theme: ${THEME_CYCLE[themePreference].label}`" :aria-label="themeCycleLabel" @click="cycleTheme">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="THEME_ICONS[themePreference]" /></svg>
          </button>
          <!-- Expanded: the icon and "Theme" cycle Auto → Light → Dark; the dropdown still picks one directly -->
          <div class="theme-control sidebar-theme">
            <button type="button" class="sidebar-theme-toggle" :aria-label="themeCycleLabel" @click="cycleTheme"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="THEME_ICONS[themePreference]"/></svg><span>Theme</span></button>
            <label class="sidebar-theme-select"><span class="visually-hidden">Color theme</span><select :value="themePreference" name="color-theme" @change="setTheme($event.target.value)"><option value="system">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
          </div>
        </li>
      </ul>
      <div v-if="USING_SUPABASE && hasSession" class="sidebar-account">
        <RouterLink to="/profile" class="nav-profile" aria-label="Your profile"><span class="nav-avatar" aria-hidden="true"><img v-if="userDino" class="nav-avatar-dino" :src="userDino.src" alt="">{{ userDino ? '' : accountName.charAt(0).toUpperCase() }}</span><span class="sidebar-profile-copy"><strong>Profile</strong><span class="nav-account-name">{{ accountName }}</span></span></RouterLink>
        <button class="nav-quiet sidebar-sign-out" type="button" :disabled="signingOut" :data-label="signingOut ? 'Signing out…' : 'Sign out'" @click="logOut"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.signOut" /></svg><span class="side-label">{{ signingOut ? 'Signing out…' : 'Sign out' }}</span></button>
        <p v-dismissible v-if="authError" class="nav-auth-error" role="alert">{{ authError }}</p>
      </div>
      <!-- Demo mode has no profile page, but still says whose data is on screen. -->
      <div v-else-if="!USING_SUPABASE && user" class="sidebar-account">
        <p class="nav-profile nav-profile--demo m-0"><span class="nav-avatar" aria-hidden="true"><img v-if="userDino" class="nav-avatar-dino" :src="userDino.src" alt="">{{ userDino ? '' : accountName.charAt(0).toUpperCase() }}</span><span class="sidebar-profile-copy"><strong>{{ accountName }}</strong><span class="nav-account-name">Demo account</span></span></p>
      </div>
    </div>
    <header class="app-topbar" :class="{ 'app-topbar--minimal': USING_SUPABASE && hasSession }">
      <!-- Own icon: Bootstrap's .navbar-toggler-icon only has an image inside a .navbar (none in light mode here) -->
      <button ref="menuToggle" class="navbar-toggler" type="button" aria-controls="mainNav" :aria-expanded="menuOpen" aria-label="Toggle navigation" @click="menuOpen = !menuOpen"><svg class="toggler-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
      <RouterLink class="topbar-brand" to="/" aria-label="Dino home" translate="no"><img class="brand-symbol" :src="dinoMark" alt="" aria-hidden="true"> Dino</RouterLink>
      <div class="nav-account">
        <RouterLink v-if="USING_SUPABASE && !hasSession" to="/" class="nav-sign-in">Sign in <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 10h12m-4-4 4 4-4 4"/></svg></RouterLink>
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
.brand-symbol { width: 40px; height: 40px; object-fit: contain; }
.sidebar-links { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
/* Same spacing as before around the line: 6px divider margin + 6px flex gap above, 6px gap + 8px padding below */
.sidebar-divider { flex: 0 0 auto; margin-top: 6px; border-top: 1px solid var(--bookedz-border); }
.sidebar-links--secondary { padding-top: 8px; }
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
/* Icon centred under the avatar, label lined up with the profile name */
.sidebar-account .sidebar-sign-out { justify-content: flex-start; gap: 14px; padding-left: 14px; }
.sidebar-sign-out svg { flex: 0 0 22px; width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.sidebar-sign-out:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 2px; }
.sidebar-account .nav-auth-error { text-align: left; }
.app-topbar { position: sticky; top: 0; z-index: 1020; display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px 16px; min-height: 72px; padding: 12px clamp(12px, 3vw, 36px); background: color-mix(in srgb, var(--bookedz-canvas) 86%, transparent); }
@supports (backdrop-filter: blur(12px)) { .app-topbar { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); } }
.topbar-brand, .navbar-toggler { display: none; }
.nav-account { display: flex; align-items: center; gap: 10px; min-width: 0; }
.theme-control { display: inline-flex; align-items: center; gap: 4px; min-width: 0; margin: 0; color: var(--bookedz-muted); }.theme-control svg { width: 18px; height: 18px; }.theme-control select { min-height: 44px; max-width: 88px; padding: 8px 4px; border: 0; border-radius: 10px; background: transparent; color: inherit; font-size: .8rem; }.theme-control option { background: var(--bookedz-surface); color: var(--bookedz-ink); }
.sidebar-theme { display: flex; gap: 4px; min-height: 48px; padding: 0 12px 0 0; font-size: .875rem; }
/* Icon + "Theme" is one button filling the row up to the dropdown, styled like the links above */
.sidebar-theme-toggle { display: flex; flex: 1; align-items: center; gap: 12px; min-width: 0; min-height: 48px; padding: 0 8px 0 16px; border: 0; border-radius: 14px; background: transparent; color: inherit; font: inherit; text-align: left; transition: background-color .15s ease, color .15s ease; }
.sidebar-theme-toggle:hover { background: var(--bookedz-glass-hover); color: var(--bookedz-ink); }
.sidebar-theme svg { flex: 0 0 22px; width: 22px; height: 22px; }
.sidebar-theme-select { display: flex; align-items: center; margin: 0; }
.sidebar-account :focus-visible, .sidebar-theme select:focus-visible, .sidebar-theme-toggle:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 2px; }
@media(min-width:992px) { .app-topbar--minimal { display: none; } }
.nav-sign-in, .nav-quiet, .nav-profile { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 9px 15px; border: 0; border-radius: 14px; text-decoration: none; font-size: .875rem; font-weight: 600; white-space: nowrap; }
.nav-sign-in { background: var(--bookedz-primary); color: var(--bookedz-on-action); }
.nav-sign-in:hover { background: var(--bookedz-primary-hover); color: #fff; }
.nav-sign-in svg { width: 20px; height: 20px; }
.nav-quiet, .nav-profile { background: transparent; color: var(--bookedz-muted); }
.nav-quiet:hover, .nav-profile:hover { background: var(--bookedz-glass-hover); color: var(--bookedz-ink); }
.nav-profile { padding: 4px 8px; }
.nav-profile--demo { cursor: default; }
.nav-profile--demo:hover { background: transparent; color: var(--bookedz-muted); }
.nav-avatar-dino { width: 100%; height: 100%; object-fit: contain; }
.nav-avatar { display: grid; overflow: hidden; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--bookedz-glass-active); color: var(--bookedz-primary-dark); }
.nav-account-name { max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
.nav-auth-error { flex-basis: 100%; margin: 0; color: var(--bookedz-danger); font-size: .875rem; text-align: right; }
.navbar-toggler { width: 44px; height: 44px; padding: 9px; border-color: var(--bookedz-control-border); border-radius: 12px; color: var(--bookedz-ink); }
.toggler-icon { display: block; width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.sidebar-scrim { display: none; }
@media(max-width:991.98px) {
  .navbar-toggler { display: block; }
  .topbar-brand { display: inline-flex; margin-right: auto; font-size: 1.45rem; }
  .topbar-brand .brand-symbol { width: 32px; height: 32px; }
  .app-sidebar { width: min(280px, 86vw); transform: translateX(-100%); visibility: hidden; transition: transform .25s ease, visibility 0s linear .25s; box-shadow: none; }
  .app-sidebar.show { transform: none; visibility: visible; transition: transform .25s ease; box-shadow: 0 0 40px rgb(41 45 50 / 18%); }
  .sidebar-scrim { display: block; position: fixed; inset: 0; z-index: 1025; background: rgb(41 45 50 / 35%); }
  .nav-account-name { display: none; }
}
@media(max-width:575.98px) { .nav-quiet { padding-inline: 8px; } .theme-control select { max-width: 70px; } }
@media(prefers-reduced-motion:reduce) { .app-sidebar, .app-sidebar.show { transition: none; } }
/* Laptops and desktops: the collapse button turns the sidebar into an icon rail; labels show
   as tooltips on hover or keyboard focus. Width is --sidebar-w in main.css (data-sidebar). */
.sidebar-collapse { display: none; }
.sidebar-theme-cycle { display: none; width: 100%; border: 0; background: transparent; }
@media (min-width: 992px) {
  /* top stays auto: the static position is the divider line, and the -50% shift centres it there */
  .sidebar-collapse { position: fixed; left: var(--sidebar-w); z-index: 2; display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--bookedz-border); border-radius: 50%; background: var(--bookedz-surface); color: var(--bookedz-muted); transform: translate(-50%, -50%); transition: left var(--bookedz-motion-normal, .24s) var(--bookedz-ease, ease), background-color .15s ease, color .15s ease, border-color .15s ease; }
  .sidebar-collapse::before { content: ''; position: absolute; inset: -8px; border-radius: 50%; } /* 44px hit area */
  .sidebar-collapse svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform var(--bookedz-motion-normal, .24s) var(--bookedz-ease, ease); }
  .sidebar-collapse:hover { border-color: var(--bookedz-primary); background: var(--bookedz-glass-active); color: var(--bookedz-primary-dark); }
  .sidebar-collapse:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 2px; }
  .sidebar-collapse::after { content: attr(data-label); content: attr(data-label) / ""; position: absolute; left: calc(100% + 10px); top: 50%; padding: 5px 10px; border-radius: 8px; background: var(--bookedz-ink); color: var(--bookedz-surface); font-size: .8rem; font-weight: 600; white-space: nowrap; pointer-events: none; opacity: 0; transform: translate(-4px, -50%); transition: opacity var(--bookedz-motion-fast, .16s) var(--bookedz-ease, ease), transform var(--bookedz-motion-fast, .16s) var(--bookedz-ease, ease); }
  .sidebar-collapse:hover::after, .sidebar-collapse:focus-visible::after { opacity: 1; transform: translate(0, -50%); }
  /* Where supported, anchor to the line so the button also follows it when a short window scrolls the sidebar */
  @supports (anchor-name: --a) {
    .sidebar-divider { anchor-name: --bookedz-sidebar-divider; }
    .sidebar-collapse { position-anchor: --bookedz-sidebar-divider; top: anchor(top); position-visibility: anchors-visible; }
  }
  .app-sidebar { transition: width var(--bookedz-motion-normal, .24s) var(--bookedz-ease, ease), padding var(--bookedz-motion-normal, .24s) var(--bookedz-ease, ease); overflow-x: hidden; }
  .side-label { transition: opacity var(--bookedz-motion-fast, .16s) var(--bookedz-ease, ease); white-space: nowrap; }
  .app-sidebar.is-collapsed { padding: 18px 10px 12px; overflow: visible; }
  .is-collapsed .sidebar-brand { justify-content: center; margin: 0 0 18px; gap: 0; font-size: 0; }
  .is-collapsed .side-link { position: relative; justify-content: center; gap: 0; padding: 10px 0; }
  .is-collapsed .side-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); opacity: 0; }
  .is-collapsed .sidebar-collapse svg { transform: rotate(180deg); }
  /* Tooltips: the empty alt text (/ "") keeps them out of accessible names, so a label is not read twice */
  .is-collapsed .side-link::after { content: attr(data-label); content: attr(data-label) / ""; position: absolute; left: calc(100% + 10px); top: 50%; z-index: 5; padding: 5px 10px; border-radius: 8px; background: var(--bookedz-ink); color: var(--bookedz-surface); font-size: .8rem; font-weight: 600; white-space: nowrap; pointer-events: none; opacity: 0; transform: translate(-4px, -50%); transition: opacity var(--bookedz-motion-fast, .16s) var(--bookedz-ease, ease), transform var(--bookedz-motion-fast, .16s) var(--bookedz-ease, ease); }
  .is-collapsed .side-link:hover::after, .is-collapsed .side-link:focus-visible::after { opacity: 1; transform: translate(0, -50%); }
  .is-collapsed .sidebar-theme { display: none; }
  .is-collapsed .sidebar-theme-cycle { display: flex; }
  .is-collapsed .sidebar-account .nav-profile { justify-content: center; padding: 6px 0; }
  .is-collapsed .sidebar-profile-copy { display: none; }
  .is-collapsed .sidebar-account .sidebar-sign-out { position: relative; justify-content: center; gap: 0; padding-inline: 0; }
  .is-collapsed .sidebar-sign-out::after { content: attr(data-label); content: attr(data-label) / ""; position: absolute; left: calc(100% + 10px); top: 50%; z-index: 5; padding: 5px 10px; border-radius: 8px; background: var(--bookedz-ink); color: var(--bookedz-surface); font-size: .8rem; font-weight: 600; white-space: nowrap; pointer-events: none; opacity: 0; transform: translate(-4px, -50%); transition: opacity var(--bookedz-motion-fast, .16s) var(--bookedz-ease, ease), transform var(--bookedz-motion-fast, .16s) var(--bookedz-ease, ease); }
  .is-collapsed .sidebar-sign-out:hover::after, .is-collapsed .sidebar-sign-out:focus-visible::after { opacity: 1; transform: translate(0, -50%); }
}
@media (prefers-reduced-motion: reduce) { .app-sidebar, .side-label, .sidebar-collapse, .sidebar-collapse svg, .sidebar-collapse::after, .side-link::after, .sidebar-sign-out::after { transition: none !important; } }
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
