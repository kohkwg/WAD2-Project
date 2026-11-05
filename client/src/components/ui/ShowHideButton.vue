<script setup>
// a "show map ▾ / hide map ▴" button for sections that start folded away on the event page.
// the parent owns the open state (v-model) and the panel; this only names it for screen readers.


const expanded = defineModel({
  type: Boolean,
  default: false
});
defineProps({
  // id of the panel it opens
  controls: {
    type: String,
    required: true
  },
  // what it shows, e.g. "map"
  label: {
    type: String,
    required: true
  },
  count: {
    type: Number,
    default: null
  } // optional, e.g. "show groups (2)"
});
</script>

<template>
  <button type="button" class="show-hide" :aria-expanded="expanded" :aria-controls="controls"
    @click="expanded = !expanded">
    {{ expanded ? 'Hide' : 'Show' }} {{ label }}<template v-if="count != null"> ({{ count }})</template>
    <svg class="show-hide-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>
</template>

<style scoped>
.show-hide {
  display: inline-flex;
  align-items: center;
  gap: .4rem;
  min-height: 44px;
  padding: .4rem .9rem;
  border: 2px solid var(--bookedz-control-border);
  border-radius: 999px;
  background: var(--bookedz-surface);
  color: var(--bookedz-ink);
  font-size: .88rem;
  font-weight: 700;
  white-space: nowrap;
  transition: background-color var(--bookedz-motion-fast, 150ms) ease, border-color var(--bookedz-motion-fast, 150ms) ease;
}

.show-hide:hover {
  border-color: var(--bookedz-ink);
  background: var(--bookedz-hover);
}

.show-hide:focus-visible {
  outline: 3px solid var(--bookedz-focus);
  outline-offset: 2px;
}

.show-hide-chevron {
  width: 18px;
  height: 18px;
  transition: transform var(--bookedz-motion-fast, 150ms) ease;
}

.show-hide[aria-expanded='true'] .show-hide-chevron {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .show-hide,
  .show-hide-chevron {
    transition: none;
  }
}
</style>
