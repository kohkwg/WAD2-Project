<script setup>
import { nextTick, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import NavBar from './components/NavBar.vue'

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
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <NavBar />
  <main id="main-content" ref="main" class="container app-main" tabindex="-1">
    <RouterView />
  </main>
</template>
