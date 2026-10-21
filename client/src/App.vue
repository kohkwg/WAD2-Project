<script setup>
import { RouterView } from 'vue-router'
import NavBar from './components/NavBar.vue'
</script>

<template>
  <NavBar />
  <main class="container py-4">
    <!-- The router puts the current page here -->
    <RouterView />
  </main>
</template>
