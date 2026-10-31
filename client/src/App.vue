<script setup>
import { nextTick, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import NavBar from './components/NavBar.vue'
import ScrollExperience from './components/ScrollExperience.vue'

const route = useRoute()
const main = ref(null)
watch(() => route.meta.title, title => {
  document.title = title ? `${title} · Bookedz` : 'Bookedz'
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
  <main id="main-content" ref="main" class="container app-main" :class="{ 'app-main--discover': route.path === '/discover' || route.path === '/' }" tabindex="-1">
    <RouterView />
  </main>
  <footer class="app-footer">
    <div class="container"><div><RouterLink to="/" class="footer-home-link" aria-label="Bookedz home">Bookedz</RouterLink><span class="ms-3">A little island. A lot to discover.</span></div><span>Explore Singapore. Make a little room for something new.</span></div>
  </footer>
  </div>
</template>

<style scoped>
.footer-home-link { color: inherit; font-weight: 700; text-decoration: none; }
.footer-home-link:hover { text-decoration: underline; }
.footer-home-link:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 4px; }
</style>
