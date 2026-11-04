<script setup>
import { RouterLink } from 'vue-router'
import HangoutWizard from '../components/hangout/HangoutWizard.vue'

// Community's hangout planner: find a time with friends, shape a plan and vote on stops.
</script>

<template>
  <div class="hangout-plan-page">
    <RouterLink to="/community" class="hangout-back">← Open jios</RouterLink>
    <HangoutWizard />
  </div>
</template>

<style scoped>
.hangout-back { display: inline-flex; align-items: center; min-height: 44px; margin-bottom: .5rem; color: var(--bookedz-primary-dark); font-weight: 600; text-decoration: none; }
.hangout-back:hover { text-decoration: underline; }
</style>
