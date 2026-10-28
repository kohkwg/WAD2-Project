<script setup>
// A clearly marked stand-in for a part of OpenJio that is not built yet.
// Shows what will go here, who owns it and which stub or task it waits on.
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  waitingOn: { type: String, default: '' }, // e.g. "findSlots() in utils/planning/slotFinder.js"
  owner: { type: String, default: 'TBD' },
})
</script>

<template>
  <section class="placeholder-panel" :aria-label="title + ' (placeholder)'">
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
      <h3 class="h6 mb-0">{{ title }}</h3>
      <span class="badge text-bg-warning">Placeholder</span>
      <span class="badge text-bg-light">Owner: {{ owner }}</span>
    </div>
    <p v-if="description" class="small text-secondary mb-2">{{ description }}</p>
    <p v-if="waitingOn" class="small mb-2">Waiting on <code>{{ waitingOn }}</code></p>
    <slot />
  </section>
</template>

<style scoped>
.placeholder-panel { padding: 1rem 1.25rem; border: 1px dashed var(--bookedz-border, #e5ded2); border-radius: 16px; background: var(--bookedz-surface, #fffdfa); }
</style>
