<script setup>
import { nextTick, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import NavBar from './components/NavBar.vue'
import ScrollExperience from './components/ScrollExperience.vue'
import ToastHost from './components/ui/ToastHost.vue'

const route = useRoute()
const main = ref(null)
watch(() => route.meta.title, title => {
  document.title = title ? `${title} · Dino` : 'Dino'
}, { immediate: true })
watch(() => route.path, async () => {
  await nextTick()
  main.value?.focus({ preventScroll: true })
})
</script>

<template>
  <ScrollExperience />
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <div class="app-shell">
  <NavBar />
  <main id="main-content" ref="main" class="container app-main" :class="{ 'app-main--discover': route.path === '/discover' || route.path === '/', 'app-main--profile': route.path === '/profile', 'app-main--my-events': route.path === '/organiser/events', 'app-main--community': route.path === '/community', 'app-main--my-rsvps': route.path === '/my-rsvps', 'app-main--group': route.path.startsWith('/groups/'), 'app-main--event': /^\/events\/[^/]+\/rsvp\/?$/.test(route.path) }" tabindex="-1">
    <!-- Keyed by path so each page fades in; opacity only, so sticky and fixed children keep working. -->
    <div :key="route.path" class="route-view"><RouterView /></div>
  </main>
  <footer class="app-footer">
    <div class="container"><div><RouterLink to="/" class="footer-home-link" aria-label="Bookedz home">Bookedz</RouterLink><span class="ms-3">A little island. A lot to discover.</span></div><span class="footer-tagline">Explore Singapore. Make a little room for something new.</span></div>
  </footer>
  </div>
  <ToastHost />
</template>

<style scoped>
.app-main.app-main--profile, .app-main.app-main--my-events, .app-main.app-main--community, .app-main.app-main--my-rsvps, .app-main.app-main--event, .app-main.app-main--group { max-width: 100%; }
.footer-home-link { color: inherit; font-weight: 700; text-decoration: none; }
.footer-home-link:hover { text-decoration: underline; }
.footer-home-link:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 4px; }
</style>
