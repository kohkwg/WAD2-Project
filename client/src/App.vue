<script setup>
// BOILERPLATE: simple shared navbar from Feature 1. Denzel's App.vue/NavBar replaces this when merged.
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <nav class="navbar navbar-expand bg-white border-bottom shadow-sm px-3">
    <RouterLink class="navbar-brand fw-bold text-primary" to="/">Bookedz</RouterLink>
    <div class="navbar-nav">
      <RouterLink class="nav-link text-secondary" to="/">Home</RouterLink>
      <RouterLink class="nav-link text-secondary" to="/profile">Profile</RouterLink>
    </div>
  </nav>
  <RouterView />
</template>
