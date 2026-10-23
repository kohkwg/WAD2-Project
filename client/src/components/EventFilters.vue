<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CATEGORIES } from '@/lib/constants'

const props = defineProps({ modelValue: { type: Object, required: true } })
const emit = defineEmits(['update:modelValue'])
const expanded = ref(false)
const search = ref(props.modelValue.search || '')
let timer
watch(() => props.modelValue.search, value => {
  if (value !== search.value) {
    clearTimeout(timer)
    search.value = value || ''
  }
})
watch(search, value => {
  clearTimeout(timer)
  if (value === props.modelValue.search) return
  timer = setTimeout(() => update({ search: value }), 300)
})
onBeforeUnmount(() => clearTimeout(timer))
function flushSearch() {
  clearTimeout(timer)
  if (search.value !== (props.modelValue.search || '')) update({ search: search.value })
}
defineExpose({ flushSearch })

function update(patch) {
  emit('update:modelValue', { ...props.modelValue, ...patch, page: 1 })
}
const selectedCategories = computed(() => props.modelValue.categories?.length
  ? props.modelValue.categories
  : props.modelValue.category ? [props.modelValue.category] : [])
const categoryOptions = computed(() => [...new Set([...CATEGORIES, ...selectedCategories.value])])
function toggleCategory(category) {
  const selected = selectedCategories.value
  update({ category: '', categories: selected.includes(category)
    ? selected.filter(value => value !== category)
    : [...selected, category] })
}
function clearCategories() { update({ category: '', categories: [] }) }
const activeCount = computed(() => {
  const f = props.modelValue
  return [selectedCategories.value.length > 0, f.tag, f.dateFrom, f.dateTo, f.availableOnly, f.sort !== 'soonest'].filter(Boolean).length
})
function reset() {
  update({ category: '', categories: [], tag: '', dateFrom: '', dateTo: '', availableOnly: false, sort: 'soonest' })
}
</script>

<template>
  <form class="event-filters" role="search" @submit.prevent="flushSearch">
    <div class="search-toolbar">
      <div class="search-field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
        <label for="event-search" class="visually-hidden">Search by title, description or venue</label>
        <input id="event-search" v-model="search" type="search" name="event-search" autocomplete="off" class="form-control" placeholder="Try music, a venue, or an event…" />
      </div>
      <button type="button" class="btn filter-toggle" :class="{ 'is-active': expanded }" :aria-expanded="expanded" aria-controls="event-filter-panel" @click="expanded = !expanded">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="white" /><circle cx="15" cy="17" r="3" fill="white" /></svg>
        Filters <span v-if="activeCount" class="badge rounded-pill text-bg-primary">{{ activeCount }}</span>
      </button>
    </div>
    <Transition name="filter-panel">
      <div v-if="expanded" id="event-filter-panel" class="filter-panel">
        <fieldset class="category-fieldset"><legend>Categories</legend>    <div class="category-options" role="group" aria-label="Filter by category. Select one or more.">
      <button type="button" class="category-option" :class="{ 'is-selected': !selectedCategories.length }" :aria-pressed="!selectedCategories.length" @click="clearCategories">All</button>
      <button v-for="category in categoryOptions" :key="category" type="button" class="category-option" :class="{ 'is-selected': selectedCategories.includes(category) }" :aria-pressed="selectedCategories.includes(category)" @click="toggleCategory(category)">{{ category.charAt(0).toUpperCase() + category.slice(1) }}</button>
    </div>
    <p v-if="selectedCategories.length > 1" class="category-hint">Showing events matching any of your selected categories.</p>
        </fieldset>
        <div class="row g-3">
          <div class="col-12 col-md-6 col-lg-4">
            <label for="dateFrom" class="form-label small text-secondary">From date</label>
            <input id="dateFrom" name="dateFrom" autocomplete="off" :value="modelValue.dateFrom" type="date" class="form-control" @change="update({ dateFrom: $event.target.value })" />
          </div>
          <div class="col-12 col-md-6 col-lg-4">
            <label for="dateTo" class="form-label small text-secondary">To date</label>
            <input id="dateTo" name="dateTo" autocomplete="off" :value="modelValue.dateTo" type="date" class="form-control" @change="update({ dateTo: $event.target.value })" />
          </div>
          <div class="col-12 col-md-6 col-lg-4">
            <label for="sort" class="form-label small text-secondary">Sort by</label>
            <select id="sort" name="sort" autocomplete="off" :value="modelValue.sort" class="form-select" @change="update({ sort: $event.target.value })">
              <option value="soonest">Soonest</option>
              <option value="popular">Most popular</option>
            </select>
          </div>
          <div class="col-12 d-flex flex-wrap justify-content-between align-items-center gap-3 pt-2">
            <div class="form-check mb-0">
              <input id="available" name="available" autocomplete="off" :checked="modelValue.availableOnly" type="checkbox" class="form-check-input" @change="update({ availableOnly: $event.target.checked })" />
              <label for="available" class="form-check-label small">Only events with spots left</label>
            </div>
            <button type="button" class="btn btn-link btn-sm p-0" @click="reset">Clear filters</button>
          </div>
        </div>
      </div>
    </Transition>
  </form>
</template>

<style scoped>
.category-fieldset { min-width: 0; margin: 0 0 20px; }.category-fieldset legend { float: none; width: auto; font-size: .9rem; font-weight: 600; margin: 0; }.category-fieldset .category-options { flex-wrap: wrap; overflow: visible; }
.category-options { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; padding: 3px; }
.category-option { white-space: nowrap; flex-shrink: 0; min-height: 44px; padding: 8px 18px; border: 1px solid var(--bookedz-muted-border); border-radius: 999px; background: var(--bookedz-surface); color: var(--bookedz-muted); font-size: .875rem; font-weight: 550; transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease; }
.category-option:hover { background: var(--bookedz-hover); border-color: var(--bookedz-control-border); }
.category-option.is-selected { background: var(--bookedz-primary-dark); border-color: var(--bookedz-primary-dark); color: var(--bookedz-surface); }
.category-option:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 2px; }
.category-hint { margin: 8px 3px 0; font-size: .8rem; color: var(--bookedz-muted); }
@media (max-width: 767px) { .category-options { flex-wrap: nowrap; overflow-x: auto; } }
@media (prefers-reduced-motion: reduce) { .category-option { transition: none; } }
.search-toolbar { display: flex; gap: 12px; }
.search-field { position: relative; flex: 1; min-width: 0; }
.search-field svg { position: absolute; left: 20px; top: 16px; width: 22px; height: 22px; color: var(--bookedz-icon); pointer-events: none; }
.search-field input { height: 54px; padding-left: 56px; border-radius: 16px; font-size: .9rem; box-shadow: var(--bookedz-search-shadow); }
.filter-toggle { white-space: nowrap; display: flex; align-items: center; justify-content: center; gap: 9px; padding: 0 22px; background: var(--bookedz-surface); border: 1px solid var(--bookedz-muted-border); border-radius: 16px; }
.filter-toggle svg { width: 20px; height: 20px; }
.filter-toggle:hover, .filter-toggle.is-active { border-color: var(--bookedz-control-border); background: var(--bookedz-hover); }
.filter-panel { margin-top: 12px; padding: 24px; border: 1px solid var(--bookedz-muted-border); border-radius: 16px; background: var(--bookedz-surface); transform-origin: top; }
.filter-panel-enter-active, .filter-panel-leave-active { transition: opacity .18s ease, transform .18s ease; }
.filter-panel-enter-from, .filter-panel-leave-to { opacity: 0; transform: translateY(-8px); }
@media (max-width: 575px) {
  .search-field input { font-size: .9rem; height: 58px; padding-left: 42px; }
  .search-field svg { left: 13px; top: 18px; }
  .filter-toggle { padding: 0 12px; font-size: .9rem; gap: 5px; }
  .filter-toggle svg { display: none; }
  .filter-panel { padding: 18px; }
}
@media (prefers-reduced-motion: reduce) { .filter-panel-enter-active, .filter-panel-leave-active { transition: none; } }
</style>
