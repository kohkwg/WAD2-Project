<script setup>
import { nextTick, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
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
  <NavBar />
  <main id="main-content" ref="main" class="container app-main" :class="{ 'app-main--discover': route.path === '/discover' }" tabindex="-1">
    <RouterView />
  </main>
  <footer class="app-footer">
    <div class="container"><div><strong>Bookedz</strong><span class="ms-3">A little island. A lot to discover.</span></div><span>Explore Singapore. Make a little room for something new.</span></div>
  </footer>
</template>
