<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import dinoMark from '@/assets/brand/dino-mark.png';
import donutO from '@/assets/brand/dino-donut-o.png';
import { dinoById } from '@/lib/dinos';
import { themePreference, setTheme } from '../lib/theme.js';
import { USING_SUPABASE, getCurrentUser, onAuthChange, signOut, resetDemoData } from '../utils/api.js';

const SIDEBAR_KEY = 'bookedz-sidebar';
// svg shapes used for the navigation icons.

const ICONS = {
  signIn: 'M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4',
  collapse: 'M14.5 7 9.5 12l5 5',
  // a door with an arrow leaving it, inside a circle
  signOut: 'M12 1.5a10.5 10.5 0 1 1 0 21 10.5 10.5 0 0 1 0-21ZM13.9 9.7V7.5H8.7v9h5.2v-2.2M11.5 12h6M15.6 10l2 2-2 2',
  home: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10M10 20v-5h4v5',
  // a compass: a circle with a needle
  discover: 'M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19ZM15.8 8.2l-1.9 5.7-5.7 1.9 1.9-5.7z',
  community: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM22 20v-2a4 4 0 0 0-3-3.9M15.5 3.7a3.5 3.5 0 0 1 0 6.6',
  profile: 'M20 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 19.5V21M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  rsvps: 'M4 6.5h16V20H4zM4 11h16M8 3.5v5M16 3.5v5',
  events: 'M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zM14 6v12'
};
// icons for the light and dark themes.

const THEME_ICONS = {
  light: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41',
  dark: 'M12 3a9 9 0 1 0 9 9A9 9 0 0 1 12 3Z'
};
// set the next theme when the theme button is clicked: light and dark swap.

const THEME_CYCLE = {
  light: {
    label: 'Light',
    next: 'dark'
  },
  dark: {
    label: 'Dark',
    next: 'light'
  }
};

const route = useRoute();

const router = useRouter();

// state

const menuOpen = ref(false);

const menuToggle = ref(null);

const user = ref(null);

const signingOut = ref(false);

// opens the sign-in section of the home page, then returns here once signed in
const signInLink = computed(() => ({
  path: '/',
  query: { redirect: route.fullPath },
  hash: '#join-dino'
}));

const authError = ref('');

// show the user's avatar and account name.
// use the email before "@" as the name.

const userDino = computed(() => dinoById(user.value?.user_metadata?.dino));

const hasSession = computed(() => Boolean(user.value));

const accountName = computed(() => user.value?.email?.split('@')[0] || 'Your account');

const accountInitial = computed(() => {
  return userDino.value ? '' : accountName.value.charAt(0).toUpperCase();
});
// highlight discover when the user is on the discover page.

const isOnDiscover = computed(() => route.path === '/discover');
// highlight organise on organiser pages, except create event.

const isMyEvents = computed(() => {
  return route.path.startsWith('/organiser/events') && route.path !== '/organiser/events/new';
});

// show mobile navigation for signed-in users.
// hide it on old invite-link pages.

const showBottomTabs = computed(() => hasSession.value && !route.path.startsWith('/j/'));

// read the saved sidebar setting.
// return null if browser storage is unavailable.

function readSidebar() {
  try {
    return localStorage.getItem(SIDEBAR_KEY);
  } catch {
    return null;
  }
}
// use the saved sidebar setting if one exists.
// otherwise, start with the sidebar collapsed.

function startsCollapsed() {
  const saved = readSidebar();
  if (saved) {
    return saved === 'collapsed';
  }
  return true;
}

const collapsed = ref(startsCollapsed());
// update the page's sidebar setting when it changes.
// main.css uses this setting to control the sidebar width.

watch(collapsed, value => {
  document.documentElement.dataset.sidebar = value ? 'collapsed' : 'expanded';
}, {
  immediate: true
});
// expand or collapse the sidebar.
// save the choice so it stays the same after a refresh.

function toggleSidebar() {
  collapsed.value = !collapsed.value;
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed.value ? 'collapsed' : 'expanded');
  } catch {
    // private mode: not remembered
  }
}

// theme button: switches between light and dark

const themeLabel = computed(() => THEME_CYCLE[themePreference.value].label);

const themeIconPath = computed(() => THEME_ICONS[themePreference.value]);

// change the theme: light ⇄ dark.

const themeCycleLabel = computed(() => {
  const now = THEME_CYCLE[themePreference.value];
  return `Theme: ${now.label}. Switch to ${THEME_CYCLE[now.next].label}`;
});

function cycleTheme() {
  setTheme(THEME_CYCLE[themePreference.value].next);
}

// listen for sign-in and sign-out changes.

let stopListening = () => {};
// track whether this component has been removed from the page.

let disposed = false;

let authRevision = 0;

onMounted(async () => {
  stopListening = onAuthChange(nextUser => {
    authRevision++;
    user.value = nextUser;
  });
  const revision = authRevision;
  try {
    const currentUser = await getCurrentUser();
    // use this result only if the component is still active
    // and no newer account change has happened.
    if (!disposed && revision === authRevision) {
      user.value = currentUser;
    }
  } catch {
    // visitors can still browse if the account check fails.
  }
});

onUnmounted(() => {
  // stop listening when this component is removed.
  disposed = true;
  stopListening();
});

// close the mobile menu after navigating

watch(() => [route.fullPath, route.matched.length], (_next, previous) => {
  // initial route resolution must not close a menu the visitor just opened.
  if (previous[1] > 0) {
    menuOpen.value = false;
  }
});

function closeMenu() {
  if (!menuOpen.value) {
    return;
  }
  menuOpen.value = false;
  menuToggle.value?.focus();
}

async function logOut() {
  signingOut.value = true;
  authError.value = '';
  try {
    await signOut();
    user.value = null;
    await router.push('/');
  } catch {
    authError.value = 'Sign out failed. Please try again.';
  } finally {
    signingOut.value = false;
  }
}

function resetDemo() {
  const message = 'Reset demo data? This removes saved events, RSVPs and organiser work in this browser.';
  if (!window.confirm(message)) {
    return;
  }
  resetDemoData();
  window.location.reload();
}
</script>

<template>
  <nav class="app-navbar" aria-label="Main navigation" @keydown.esc="closeMenu">
    <div v-if="menuOpen" class="sidebar-scrim" aria-hidden="true" @click="closeMenu"></div>

    <div id="mainNav" class="app-sidebar" :class="{ show: menuOpen, 'is-collapsed': collapsed }">
      <RouterLink class="sidebar-brand" to="/" aria-label="Dino" translate="no">
        <img class="brand-symbol" :src="dinoMark" alt="" aria-hidden="true" />
        <span class="brand-word" aria-hidden="true">
          Din<img class="brand-o" :src="donutO" alt="" aria-hidden="true" />
        </span>
      </RouterLink>

      <ul class="sidebar-links">
        <li>
          <RouterLink class="side-link" data-label="Home" active-class="" exact-active-class="active" to="/">
            <svg viewBox="0 0 24 24" aria-hidden="true">
            <path :d="ICONS.home" /></svg>
            <span class="side-label">Home</span>
          </RouterLink>
        </li>

        <li>
          <RouterLink
            class="side-link"
            data-label="Discover"
            :class="{ active: isOnDiscover }"
            active-class=""
            exact-active-class=""
            to="/discover"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
            <path :d="ICONS.discover" /></svg>
            <span class="side-label">Discover</span>
          </RouterLink>
        </li>

        <li>
          <RouterLink
            class="side-link"
            data-label="Community"
            active-class="active"
            to="/community"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
            <path :d="ICONS.community" /></svg>
            <span class="side-label">Community</span>
          </RouterLink>
        </li>

        <template v-if="hasSession">
          <li>
            <RouterLink
              class="side-link"
              data-label="Plans"
              active-class="active"
              to="/my-rsvps"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
              <path :d="ICONS.rsvps" /></svg>
              <span class="side-label">Plans</span>
            </RouterLink>
          </li>

          <li>
            <RouterLink
              class="side-link"
              data-label="Organise"
              active-class=""
              :class="{ active: isMyEvents }"
              to="/organiser/events"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
              <path :d="ICONS.events" /></svg>
              <span class="side-label">Organise</span>
            </RouterLink>
          </li>
        </template>
      </ul>

      <!-- the divider carries the desktop collapse toggle, centred on the sidebar's right edge.
           the button is fixed with no top, so it keeps its in-flow spot (the line)
           without being clipped. -->
      <div class="sidebar-divider">
        <button
          type="button"
          class="sidebar-collapse"
          :aria-expanded="!collapsed"
          aria-controls="mainNav"
          :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          :data-label="collapsed ? 'Expand' : 'Collapse'"
          @click="toggleSidebar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
          <path :d="ICONS.collapse" /></svg>
        </button>
      </div>

      <ul class="sidebar-links sidebar-links--secondary">
        <li>
          <!-- collapsed rail only: one button switching between light and dark.
               the button below covers every other layout -->
          <button
            type="button"
            class="side-link sidebar-theme-cycle"
            :data-label="`Theme: ${themeLabel}`"
            :aria-label="themeCycleLabel"
            @click="cycleTheme"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
            <path :d="themeIconPath" /></svg>
          </button>

          <!-- expanded: the icon and "theme" switch between light and dark -->
          <div class="theme-control sidebar-theme">
            <button
              type="button"
              class="sidebar-theme-toggle"
              :aria-label="themeCycleLabel"
              @click="cycleTheme"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path :d="themeIconPath" />
              </svg>
              <span>Theme</span>
              <span class="sidebar-theme-state">{{ themeLabel }}</span>
            </button>
          </div>
        </li>
      </ul>

      <div v-if="USING_SUPABASE && hasSession" class="sidebar-account">
        <RouterLink to="/profile" class="nav-profile" aria-label="Your profile">
          <span class="nav-avatar" aria-hidden="true">
            <img v-if="userDino" class="nav-avatar-dino" :src="userDino.src" alt="" />{{ accountInitial }}
          </span>
          <span class="sidebar-profile-copy">
            <strong>Profile</strong>
            <span class="nav-account-name">{{ accountName }}</span>
          </span>
        </RouterLink>

        <button
          class="nav-quiet sidebar-sign-out"
          type="button"
          :disabled="signingOut"
          :data-label="signingOut ? 'Signing out…' : 'Sign out'"
          @click="logOut"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
          <path :d="ICONS.signOut" /></svg>
          <span class="side-label">{{ signingOut ? 'Signing out…' : 'Sign out' }}</span>
        </button>

        <p v-if="authError" v-dismissible class="nav-auth-error" role="alert">{{ authError }}</p>
      </div>

      <!-- Signed out from 992px: the top bar is hidden there, so Sign in sits where the account would.
           Smaller screens keep it in the top bar beside the menu button. -->
      <div v-else-if="USING_SUPABASE && route.path !== '/'" class="sidebar-account sidebar-account--signed-out">
        <RouterLink :to="signInLink" class="side-link sidebar-sign-in" data-label="Sign in" active-class="" exact-active-class="">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.signIn" /></svg>
          <span class="side-label">Sign in</span>
        </RouterLink>
      </div>

      <!-- demo mode has no profile page, but still says whose data is on screen. -->
      <div v-else-if="!USING_SUPABASE && user" class="sidebar-account">
        <p class="nav-profile nav-profile--demo m-0">
          <span class="nav-avatar" aria-hidden="true">
            <img v-if="userDino" class="nav-avatar-dino" :src="userDino.src" alt="" />{{ accountInitial }}
          </span>
          <span class="sidebar-profile-copy">
            <strong>{{ accountName }}</strong>
            <span class="nav-account-name">Demo account</span>
          </span>
        </p>
      </div>
    </div>

    <header
      class="app-topbar"
      :class="{
        'has-tabs': showBottomTabs,
        'app-topbar--minimal': USING_SUPABASE,
      }"
    >
      <!-- own icon: bootstrap's .navbar-toggler-icon only has an image inside a .navbar
           (none in light mode here) -->
      <button
        ref="menuToggle"
        class="navbar-toggler"
        type="button"
        aria-controls="mainNav"
        :aria-expanded="menuOpen"
        aria-label="Toggle navigation"
        @click="menuOpen = !menuOpen"
      >
        <svg class="toggler-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <RouterLink class="topbar-brand" to="/" aria-label="Dino home" translate="no">
        <img class="brand-symbol" :src="dinoMark" alt="" aria-hidden="true" />
        <span class="brand-word" aria-hidden="true">
          Din<img class="brand-o" :src="donutO" alt="" aria-hidden="true" />
        </span>
      </RouterLink>

      <div class="nav-account">
        <RouterLink
          v-if="USING_SUPABASE && !hasSession && route.path !== '/'"
          :to="signInLink"
          class="nav-sign-in"
        >
          Sign in
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path d="M3 10h12m-4-4 4 4-4 4" />
          </svg>
        </RouterLink>

        <button v-else-if="!USING_SUPABASE" type="button" class="nav-quiet" @click="resetDemo">
          Reset demo data
        </button>
      </div>
    </header>
  </nav>

  <!-- phones: the four main destinations at thumb reach; the menu button keeps everything else.
       a separate landmark, so "main navigation" still holds one link per destination -->
  <nav v-if="showBottomTabs" class="bottom-tabs" aria-label="Quick links">
    <RouterLink class="bottom-tab" active-class="" exact-active-class="active" to="/">
      <svg viewBox="0 0 24 24" aria-hidden="true">
      <path :d="ICONS.home" /></svg>
      Home
    </RouterLink>

    <RouterLink
      class="bottom-tab"
      :class="{ active: isOnDiscover }"
      active-class=""
      exact-active-class=""
      to="/discover"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
      <path :d="ICONS.discover" /></svg>
      Discover
    </RouterLink>

    <RouterLink class="bottom-tab" active-class="active" to="/community">
      <svg viewBox="0 0 24 24" aria-hidden="true">
      <path :d="ICONS.community" /></svg>
      Community
    </RouterLink>

    <RouterLink class="bottom-tab" active-class="active" to="/my-rsvps">
      <svg viewBox="0 0 24 24" aria-hidden="true">
      <path :d="ICONS.rsvps" /></svg>
      Plans
    </RouterLink>

    <RouterLink
      class="bottom-tab"
      active-class=""
      :class="{ active: isMyEvents }"
      to="/organiser/events"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
      <path :d="ICONS.events" /></svg>
      Organise
    </RouterLink>

    <RouterLink class="bottom-tab" active-class="active" to="/profile">
      <img v-if="userDino" class="bottom-tab-dino" :src="userDino.src" alt="" />
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
      <path :d="ICONS.profile" /></svg>
      Profile
    </RouterLink>
  </nav>
</template>

<style scoped>
.app-navbar {
  display: contents;
}

/* sidebar */

.app-sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 1030;
  width: var(--sidebar-w);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 24px 14px 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bookedz-surface);
  border-right: 1px solid var(--bookedz-border);
}

/* brand */

.sidebar-brand,
.topbar-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--bookedz-ink);
  font-family: var(--bookedz-heading);
  font-size: 1.65rem;
  font-weight: 700;
  letter-spacing: -0.06em;
  text-decoration: none;
}

.sidebar-brand {
  margin: 0 0 22px 10px;
}

.brand-word {
  display: inline-flex;
  align-items: center;
  font-size: 1.3em;
  line-height: 1;
}

.brand-o {
  width: auto;
  height: 0.78em;
  margin-left: 0.04em;
  object-fit: contain;
  transform: translateY(0.04em);
}

.brand-symbol {
  width: 40px;
  height: 40px;
  object-fit: contain;
}

/* links */

.sidebar-links {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* same spacing as before around the line: 6px divider margin + 6px flex gap above,
   6px gap + 8px padding below */

.sidebar-divider {
  flex: 0 0 auto;
  margin-top: 6px;
  border-top: 1px solid var(--bookedz-border);
}

.sidebar-links--secondary {
  padding-top: 8px;
}

.side-link {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 48px;
  padding: 10px 16px;
  border-radius: 14px;
  color: var(--bookedz-muted);
  font-size: 0.92rem;
  font-weight: 550;
  text-decoration: none;
  transition: background-color 0.15s ease,
    color 0.15s ease;
}

.side-link svg {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.side-link:hover {
  background: var(--bookedz-glass-hover);
  color: var(--bookedz-ink);
}

.side-link.active {
  background: var(--bookedz-glass-active);
  color: var(--bookedz-primary-dark);
  font-weight: 650;
}

.side-link:focus-visible,
.topbar-brand:focus-visible,
.sidebar-brand:focus-visible {
  outline: 3px solid var(--bookedz-primary-dark);
  outline-offset: 2px;
}

/* account area at the bottom of the sidebar */

.sidebar-account {
  display: grid;
  gap: 6px;
  margin-top: auto;
  padding-top: 18px;
  border-top: 1px solid var(--bookedz-border);
}

/* Same fill as the top bar's Sign in button */
.side-link.sidebar-sign-in {
  background: var(--bookedz-primary);
  color: var(--bookedz-on-action);
  font-weight: 650;
}

.side-link.sidebar-sign-in:hover {
  background: var(--bookedz-primary-hover);
  color: #fff;
}

@media (max-width: 991.98px) {
  .sidebar-account--signed-out {
    display: none;
  }
}

.sidebar-account .nav-profile {
  justify-content: flex-start;
  padding: 8px;
}

.sidebar-profile-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.sidebar-profile-copy strong {
  color: var(--bookedz-ink);
  font-weight: 650;
}

.sidebar-account .nav-account-name {
  display: block;
  max-width: 140px;
  font-size: 0.8rem;
  font-weight: 400;
}

/* icon centred under the avatar, label lined up with the profile name */

.sidebar-account .sidebar-sign-out {
  justify-content: flex-start;
  gap: 14px;
  padding-left: 14px;
}

.sidebar-sign-out svg {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sidebar-sign-out:focus-visible {
  outline: 3px solid var(--bookedz-primary-dark);
  outline-offset: 2px;
}

.sidebar-account .nav-auth-error {
  text-align: left;
}

/* top bar */

.app-topbar {
  position: sticky;
  top: 0;
  z-index: 1020;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px 16px;
  min-height: 72px;
  padding: 12px clamp(12px, 3vw, 36px);
  background: color-mix(in srgb, var(--bookedz-canvas) 86%, transparent);
}

@supports (backdrop-filter: blur(12px)) {
  .app-topbar {
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
}

.topbar-brand,
.navbar-toggler {
  display: none;
}

.nav-account {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* theme button in the sidebar */

.theme-control {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  margin: 0;
  color: var(--bookedz-muted);
}

.theme-control svg {
  width: 18px;
  height: 18px;
}

.sidebar-theme {
  display: flex;
  gap: 4px;
  min-height: 48px;
  padding: 0 12px 0 0;
  font-size: 0.875rem;
}

/* icon + "theme" is one button filling the row, styled like the links above */

.sidebar-theme-toggle {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 48px;
  padding: 0 8px 0 16px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  transition: background-color 0.15s ease,
    color 0.15s ease;
}

.sidebar-theme-toggle:hover {
  background: var(--bookedz-glass-hover);
  color: var(--bookedz-ink);
}

.sidebar-theme svg {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
}

.sidebar-theme-state {
  margin-left: auto;
  color: var(--bookedz-muted);
  font-size: 0.8125rem;
}

.sidebar-account :focus-visible,
.sidebar-theme-toggle:focus-visible {
  outline: 3px solid var(--bookedz-primary-dark);
  outline-offset: 2px;
}

@media (min-width: 992px) {
  .app-topbar--minimal {
    display: none;
  }
}

/* sign in, quiet buttons and the profile link */

.nav-sign-in,
.nav-quiet,
.nav-profile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 9px 15px;
  border: 0;
  border-radius: 14px;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
}

.nav-sign-in {
  background: var(--bookedz-primary);
  color: var(--bookedz-on-action);
}

.nav-sign-in:hover {
  background: var(--bookedz-primary-hover);
  color: #fff;
}

.nav-sign-in svg {
  width: 20px;
  height: 20px;
}

.nav-quiet,
.nav-profile {
  background: transparent;
  color: var(--bookedz-muted);
}

.nav-quiet:hover,
.nav-profile:hover {
  background: var(--bookedz-glass-hover);
  color: var(--bookedz-ink);
}

.nav-profile {
  padding: 4px 8px;
}

.nav-profile--demo {
  cursor: default;
}

.nav-profile--demo:hover {
  background: transparent;
  color: var(--bookedz-muted);
}

.nav-avatar-dino {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform: scale(1.3);
}

/* a dino shows whole, not cropped to the circle and its background */

.nav-avatar:has(.nav-avatar-dino) {
  overflow: visible;
  background: none;
}

.nav-avatar {
  display: grid;
  overflow: hidden;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--bookedz-glass-active);
  color: var(--bookedz-primary-dark);
}

.nav-account-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-auth-error {
  flex-basis: 100%;
  margin: 0;
  color: var(--bookedz-danger);
  font-size: 0.875rem;
  text-align: right;
}

/* menu button (phones and tablets) */

.navbar-toggler {
  width: 44px;
  height: 44px;
  padding: 9px;
  border-color: var(--bookedz-control-border);
  border-radius: 12px;
  color: var(--bookedz-ink);
}

.toggler-icon {
  display: block;
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.sidebar-scrim {
  display: none;
}

.bottom-tab-dino {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

@media (max-width: 767.98px) {
  .app-topbar.has-tabs .navbar-toggler {
    display: none;
  }
}

/* phones and tablets: the sidebar slides in over the page */

@media (max-width: 991.98px) {
  .navbar-toggler {
    display: block;
  }
  .topbar-brand {
    display: inline-flex;
    margin-right: auto;
    font-size: 1.45rem;
  }
  .topbar-brand .brand-symbol {
    width: 32px;
    height: 32px;
  }
  .app-sidebar {
    width: min(280px, 86vw);
    transform: translateX(-100%);
    visibility: hidden;
    transition: transform 0.25s ease,
      visibility 0s linear 0.25s;
    box-shadow: none;
  }
  .app-sidebar.show {
    transform: none;
    visibility: visible;
    transition: transform 0.25s ease;
    box-shadow: 0 0 40px rgb(41 45 50 / 18%);
  }
  .sidebar-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 1025;
    background: rgb(41 45 50 / 35%);
  }
  .nav-account-name {
    display: none;
  }
}

@media (max-width: 575.98px) {
  .nav-quiet {
    padding-inline: 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-sidebar,
  .app-sidebar.show {
    transition: none;
  }
}

/* laptops and desktops: the collapse button turns the sidebar into an icon rail; labels show
   as tooltips on hover or keyboard focus. width is --sidebar-w in main.css (data-sidebar). */

.sidebar-collapse {
  display: none;
}

.sidebar-theme-cycle {
  display: none;
  width: 100%;
  border: 0;
  background: transparent;
}

@media (min-width: 992px) {
  /* top stays auto: the static position is the divider line,
     and the -50% shift centres it there */
  .sidebar-collapse {
    position: fixed;
    left: var(--sidebar-w);
    z-index: 2;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--bookedz-border);
    border-radius: 50%;
    background: var(--bookedz-surface);
    color: var(--bookedz-muted);
    transform: translate(-50%, -50%);
    transition: left var(--bookedz-motion-normal, 0.24s) var(--bookedz-ease, ease),
      background-color 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }
  /* 44px hit area */
  .sidebar-collapse::before {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: 50%;
  }
  .sidebar-collapse svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform var(--bookedz-motion-normal, 0.24s) var(--bookedz-ease, ease);
  }
  .sidebar-collapse:hover {
    border-color: var(--bookedz-primary);
    background: var(--bookedz-glass-active);
    color: var(--bookedz-primary-dark);
  }
  .sidebar-collapse:focus-visible {
    outline: 3px solid var(--bookedz-primary-dark);
    outline-offset: 2px;
  }
  /* tooltip bubble: shared by the collapse button and the collapsed-rail links.
     the empty alt text (/ "") keeps it out of accessible names, so a label is not read twice */
  .sidebar-collapse::after,
  .is-collapsed .side-link::after,
  .is-collapsed .sidebar-sign-out::after {
    content: attr(data-label);
    content: attr(data-label) / '';
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    padding: 5px 10px;
    border-radius: 8px;
    background: var(--bookedz-ink);
    color: var(--bookedz-surface);
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transform: translate(-4px, -50%);
    transition: opacity var(--bookedz-motion-fast, 0.16s) var(--bookedz-ease, ease),
      transform var(--bookedz-motion-fast, 0.16s) var(--bookedz-ease, ease);
  }
  .is-collapsed .side-link::after,
  .is-collapsed .sidebar-sign-out::after {
    z-index: 5;
  }
  .sidebar-collapse:hover::after,
  .sidebar-collapse:focus-visible::after,
  .is-collapsed .side-link:hover::after,
  .is-collapsed .side-link:focus-visible::after,
  .is-collapsed .sidebar-sign-out:hover::after,
  .is-collapsed .sidebar-sign-out:focus-visible::after {
    opacity: 1;
    transform: translate(0, -50%);
  }
  /* where supported, anchor to the line so the button also follows it
     when a short window scrolls the sidebar */
  @supports (anchor-name: --a) {
    .sidebar-divider {
      anchor-name: --bookedz-sidebar-divider;
    }
    .sidebar-collapse {
      position-anchor: --bookedz-sidebar-divider;
      top: anchor(top);
      position-visibility: anchors-visible;
    }
  }
  .app-sidebar {
    transition: width var(--bookedz-motion-normal, 0.24s) var(--bookedz-ease, ease),
      padding var(--bookedz-motion-normal, 0.24s) var(--bookedz-ease, ease);
    overflow-x: hidden;
  }
  .side-label {
    transition: opacity var(--bookedz-motion-fast, 0.16s) var(--bookedz-ease, ease);
    white-space: nowrap;
  }
  /* collapsed icon rail */
  .app-sidebar.is-collapsed {
    padding: 18px 10px 12px;
    overflow: visible;
  }
  .is-collapsed .sidebar-brand {
    justify-content: center;
    margin: 0 0 18px;
    gap: 0;
    font-size: 0;
  }
  .is-collapsed .side-link {
    position: relative;
    justify-content: center;
    gap: 0;
    padding: 10px 0;
  }
  .is-collapsed .side-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    opacity: 0;
  }
  .is-collapsed .sidebar-collapse svg {
    transform: rotate(180deg);
  }
  .is-collapsed .sidebar-theme {
    display: none;
  }
  .is-collapsed .sidebar-theme-cycle {
    display: flex;
  }
  .is-collapsed .sidebar-account .nav-profile {
    justify-content: center;
    padding: 6px 0;
  }
  .is-collapsed .sidebar-profile-copy {
    display: none;
  }
  .is-collapsed .sidebar-account .sidebar-sign-out {
    position: relative;
    justify-content: center;
    gap: 0;
    padding-inline: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-sidebar,
  .side-label,
  .sidebar-collapse,
  .sidebar-collapse svg,
  .sidebar-collapse::after,
  .side-link::after,
  .sidebar-sign-out::after {
    transition: none !important;
  }
}

/* phones: fixed tab bar; main.css pads the page by --bottom-nav-h
   so nothing hides behind it */

.bottom-tabs {
  display: none;
}

@media (max-width: 767.98px) {
  .bottom-tabs {
    position: fixed;
    inset: auto 0 0;
    z-index: 1020;
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: 4px;
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--bookedz-border);
    background: color-mix(in srgb, var(--bookedz-surface) 94%, transparent);
  }
  @supports (backdrop-filter: blur(12px)) {
    .bottom-tabs {
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
  }
  .bottom-tab {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 2px;
    min-height: 52px;
    padding: 4px 2px;
    border-radius: 12px;
    color: var(--bookedz-muted);
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1.15;
    text-align: center;
    text-decoration: none;
  }
  .bottom-tab svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .bottom-tab.active {
    color: var(--bookedz-primary-dark);
    background: var(--bookedz-glass-active);
    font-weight: 700;
  }
  .bottom-tab:focus-visible {
    outline: 3px solid var(--bookedz-focus);
    outline-offset: -3px;
  }
}
</style>