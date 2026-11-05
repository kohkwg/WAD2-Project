<script setup>
// placeholder shapes shown while content loads, so the layout does not jump when it arrives.
defineProps({
  count: {
    type: Number,
    default: 4
  },
  // row | card
  variant: {
    type: String,
    default: 'row'
  },
  label: {
    type: String,
    default: 'Loading…'
  }
});
</script>

<template>
  <div class="skeleton-list" :class="`skeleton-list--${variant}`" role="status" aria-live="polite">
    <span class="visually-hidden">{{ label }}</span>
    <div v-for="n in count" :key="n" class="skeleton-item" aria-hidden="true"
      :style="{ '--skeleton-delay': `${(n - 1) * 80}ms` }">
      <span class="skeleton-block skeleton-media"></span>
      <span class="skeleton-lines">
        <span class="skeleton-block skeleton-line skeleton-line--title"></span>
        <span class="skeleton-block skeleton-line"></span>
        <span class="skeleton-block skeleton-line skeleton-line--short"></span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.skeleton-list {
  display: grid;
  gap: 10px;
}

.skeleton-list--card {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 18px;
}

.skeleton-item {
  display: grid;
  grid-template-columns: 66px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--dino-border);
  border-radius: 13px;
  background: var(--dino-surface);
}

.skeleton-list--card .skeleton-item {
  grid-template-columns: 1fr;
  padding: 0 0 16px;
  overflow: hidden;
  border-radius: 18px;
}

.skeleton-media {
  width: 66px;
  height: 66px;
  border-radius: 9px;
}

.skeleton-list--card .skeleton-media {
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  border-radius: 0;
}

.skeleton-list--card .skeleton-lines {
  padding: 0 16px;
}

.skeleton-lines {
  display: grid;
  gap: 8px;
}

.skeleton-line {
  height: 10px;
  border-radius: 5px;
}

.skeleton-line--title {
  width: 70%;
  height: 14px;
}

.skeleton-line--short {
  width: 40%;
}

.skeleton-block {
  display: block;
  background: linear-gradient(90deg, var(--dino-hover) 0%, color-mix(in srgb, var(--dino-hover) 45%, var(--dino-surface)) 50%, var(--dino-hover) 100%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s var(--dino-ease) infinite;
  animation-delay: var(--skeleton-delay, 0ms);
}

@keyframes skeleton-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -100% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-block {
    animation: none;
  }
}
</style>
