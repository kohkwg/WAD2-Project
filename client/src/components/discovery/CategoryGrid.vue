<script setup>
import EventArtwork from '../EventArtwork.vue'
defineProps({ categories: { type: Array, required: true }, label: { type: String, default: 'Event categories' }, directory: { type: Boolean, default: false } })
</script>

<template>
  <nav :aria-label="label">
    <ul class="category-directory-grid" :class="{ 'category-directory-grid--expanded': directory }">
      <li v-for="category in categories" :key="category">
        <RouterLink :to="{ path: '/discover', query: { category } }" class="category-directory-link">
          <span class="category-directory-icon" aria-hidden="true"><EventArtwork :category="category" /></span>
          <span class="category-directory-label">{{ category.charAt(0).toUpperCase() + category.slice(1) }}</span>
          <span class="category-directory-arrow" aria-hidden="true">↗</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.category-directory-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; margin: 0; padding: 0; list-style: none; }
.category-directory-link { display: flex; align-items: center; gap: .85rem; min-height: 82px; padding: .85rem 1rem; border: 1px solid var(--bookedz-border); border-radius: 16px; color: var(--bookedz-ink); background: var(--bookedz-surface); box-shadow: 0 1px 2px rgb(41 45 50 / 4%), 0 4px 14px rgb(41 45 50 / 3%); text-decoration: none; transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease; }
.category-directory-link:hover { border-color: var(--bookedz-primary-dark); box-shadow: 0 2px 4px rgb(41 45 50 / 5%), 0 8px 20px rgb(41 45 50 / 7%); }
@media(hover:hover) { .category-directory-link:hover { transform: translateY(-1px); } }
.category-directory-link:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 3px; }
.category-directory-icon { flex: 0 0 46px; width: 46px; height: 46px; overflow: hidden; border-radius: 12px; }
.category-directory-icon :deep(svg) { width: 100%; height: 100%; }
.category-directory-label { min-width: 0; overflow-wrap: anywhere; font-weight: 650; }
.category-directory-arrow { margin-left: auto; color: var(--bookedz-muted); }
.category-directory-grid--expanded { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.category-directory-grid--expanded .category-directory-link { position: relative; min-height: 112px; padding: 1.1rem 1.3rem; gap: 1.2rem; border-radius: 20px; background: var(--bookedz-surface); }
.category-directory-grid--expanded .category-directory-icon { flex-basis: 72px; width: 72px; height: 72px; border-radius: 18px; }
.category-directory-grid--expanded .category-directory-label { font-family: var(--bookedz-heading); font-size: 1.2rem; }
@media(min-width:992px) {
  .category-directory-grid:not(.category-directory-grid--expanded) { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; }
  .category-directory-grid:not(.category-directory-grid--expanded) .category-directory-link { position: relative; flex-direction: column; align-items: stretch; gap: .6rem; min-height: 0; height: 100%; padding: .6rem .6rem .8rem; border-radius: 18px; }
  .category-directory-grid:not(.category-directory-grid--expanded) .category-directory-icon { flex-basis: auto; width: 100%; height: 76px; border-radius: 12px; }
  .category-directory-grid:not(.category-directory-grid--expanded) .category-directory-icon :deep(svg) { object-fit: cover; }
  .category-directory-grid:not(.category-directory-grid--expanded) .category-directory-label { padding-right: 1.6rem; padding-left: .2rem; font-size: .9rem; }
  .category-directory-grid:not(.category-directory-grid--expanded) .category-directory-arrow { position: absolute; right: .85rem; bottom: .8rem; }
}
@media(max-width:767px) { .category-directory-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .category-directory-link { padding: .7rem; gap: .55rem; } }
@media(max-width:575px) { .category-directory-grid--expanded .category-directory-link { flex-direction: column; align-items: flex-start; gap: .8rem; padding: 1rem; min-height: 146px; } .category-directory-grid--expanded .category-directory-icon { flex-basis: 56px; width: 56px; height: 56px; border-radius: 14px; } .category-directory-grid--expanded .category-directory-label { font-size: 1.05rem; } .category-directory-grid--expanded .category-directory-arrow { position: absolute; right: 1rem; top: 1rem; } }
@media(max-width:399px) { .category-directory-icon { flex-basis: 36px; width: 36px; height: 36px; } .category-directory-arrow { display: none; } }
@media(prefers-reduced-motion:reduce) { .category-directory-link { transition: none; } .category-directory-link:hover { transform: none; } }
</style>
