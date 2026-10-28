<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { normalizeDiscoveryFilters } from '@/lib/discoveryFilters'

const invalidCustomRange = computed(() =>
  selected.value.when === 'pick_dates' &&
  (!selected.value.dateFrom ||
   !selected.value.dateTo ||
   selected.value.dateFrom > selected.value.dateTo)
)

function updateDate(field, value) {
  flushSearch()
  emit('update:modelValue', {
    ...selected.value,
    [field]: value,
  })
}


const props = defineProps({
  modelValue: { type: Object, required: true }, search: { type: String, default: '' },
  total: { type: Number, default: null }, loading: Boolean, error: { type: String, default: '' }, showActive: Boolean,
})
const emit = defineEmits(['update:modelValue', 'update:search', 'show', 'retry', 'pick-dates'])
const root = ref(null)
const searchInput = ref(null)
const toggle = ref(null)
const expanded = ref(false)
const search = ref(props.search)
let timer
watch(() => props.search, value => { if (value !== search.value) { clearTimeout(timer); search.value = value } })
watch(search, value => {
  clearTimeout(timer)
  if (value !== props.search) timer = setTimeout(flushSearch, 250)
})
function flushSearch() {
  clearTimeout(timer)
  if (search.value !== props.search) emit('update:search', search.value)
}
defineExpose({ flushSearch })
const selected = computed(() => normalizeDiscoveryFilters(props.modelValue))
const whenOptions = [
  { value: 'today', label: 'Today', icon: 'M8 3v4m8-4v4M4 10h16M5 5h14v15H5zM8 14h3' },
  { value: 'weekend', label: 'This weekend', icon: 'M4 10h16M5 5h14v15H5zM8 3v4m8-4v4m-8 8 2 2 5-5' },
  { value: 'week', label: 'This week', icon: 'M4 10h16M5 5h14v15H5zM8 3v4m8-4v4M8 14h1m3 0h1m3 0h1' },
  { value: 'pick_dates', label: 'Pick dates', icon: 'M8 3v4m8-4v4M4 10h16M5 5h14v15H5zM9 15h6m-3-3v6' },
]
const extraOptions = [{ value: 'spots_left', label: 'Spots left', icon: 'M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4zM15 7v2m0 6v2' }]
const categoryOptions = [
  { value: 'tech', label: 'Tech', icon: 'M4 5h16v12H4zM8 21h8m-4-4v4' },
  { value: 'music', label: 'Music', icon: 'M9 17V5l11-2v12M9 8l11-2M9 17a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm11-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z' },
  { value: 'sports', label: 'Sports', icon: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 5-5 13 0 18m0-18c5 5 5 13 0 18' },
  { value: 'arts', label: 'Arts', icon: 'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h3a6 6 0 0 0 0-10zM7 9h.01M10 6h.01M16 7h.01' },
  { value: 'food', label: 'Food', icon: 'M4 3v7a3 3 0 0 0 6 0V3M7 3v18M19 21V3c-4 0-5 9-2 10h2' },
  { value: 'volunteering', label: 'Volunteering', icon: 'M12 20 4 12a5 5 0 0 1 8-7 5 5 0 0 1 8 7z' },
]
const groups = computed(() => [
  { key: 'when', label: 'When', options: whenOptions },
  { key: 'extras', label: 'Good to know', options: extraOptions },
  { key: 'categories', label: 'Category', options: categoryOptions },
])
function isSelected(group, value) { return group === 'when' ? selected.value.when === value : selected.value[group].includes(value) }
function choose(group, value) {
  flushSearch()
  const next = { ...selected.value }
  next[group] = group === 'when' ? (next.when === value ? '' : value)
    : next[group].includes(value) ? next[group].filter(item => item !== value) : [...next[group], value]
  emit('update:modelValue', next)
  if (group === 'when' && next.when === 'pick_dates') emit('pick-dates')
}
const activeCount = computed(() => Number(Boolean(selected.value.when)) + selected.value.extras.length + selected.value.categories.length)
const activeChips = computed(() => groups.value.flatMap(group => {
  const options = group.key === 'categories'
    ? [...group.options, ...selected.value.categories.filter(value => !group.options.some(option => option.value === value)).map(value => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))]
    : group.options
  return options.filter(option => isSelected(group.key, option.value)).map(option => ({ ...option, group: group.key }))
}))
function clearAll() { flushSearch(); emit('update:modelValue', normalizeDiscoveryFilters()) }
async function removeChip(chip) { choose(chip.group, chip.value); await nextTick(); searchInput.value?.focus({ preventScroll: true }) }
async function clearSearch() { search.value = ''; flushSearch(); await nextTick(); searchInput.value?.focus() }
function close(restoreFocus = false) { expanded.value = false; if (restoreFocus) nextTick(() => toggle.value?.focus()) }
function outside(event) { if (expanded.value && !root.value?.contains(event.target)) close() }
function escape(event) { if (event.key === 'Escape' && expanded.value) { event.preventDefault(); event.stopPropagation(); close(true) } }
function showEvents() {
  if (invalidCustomRange.value) return
  flushSearch()
  close()
  emit('show')
}
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape) })
onBeforeUnmount(() => { clearTimeout(timer); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) })
</script>

<template>
  <form ref="root" class="event-filters" role="search" @submit.prevent="showEvents">
    <div class="search-wrap">
      <div class="search-toolbar">
        <div class="search-field">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
          <label for="event-search" class="visually-hidden">Search by title, description or venue</label>
          <input id="event-search" ref="searchInput" v-model="search" type="search" autocomplete="off" placeholder="Search events, activities or places…" />
          <button v-if="search" type="button" class="clear-search" aria-label="Clear search" @click="clearSearch">×</button>
        </div>
        <button ref="toggle" type="button" class="filter-toggle" :class="{ 'is-active': activeCount > 0 }" :aria-expanded="expanded" aria-controls="event-filter-panel" @click="expanded = !expanded">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></svg>
          Filters 
        </button>
      </div>
      <div v-if="expanded" id="event-filter-panel" class="filter-panel" role="region" aria-label="Event filters">
       <header class="panel-heading">
  <strong>Filters</strong>
  <button type="button" class="close-panel"
    aria-label="Close filters" @click="close(true)">×</button>
</header>

<fieldset class="filter-section">
  <legend>When</legend>
  <div class="date-segments">
    <button type="button" :aria-pressed="!selected.when"
      @click="selected.when && choose('when', selected.when)">
      Anytime
    </button>
    <button v-for="option in whenOptions" :key="option.value"
      type="button" :aria-pressed="isSelected('when', option.value)"
      @click="choose('when', option.value)">
      {{ option.label }}
    </button>
  </div>
<div v-if="selected.when === 'pick_dates'" class="calendar-hook">
  <div class="custom-date-range">
    <label>
      From
      <input
        type="date"
        :value="selected.dateFrom"
        @change="updateDate('dateFrom', $event.target.value)"
      >
    </label>
    <label>
      To
      <input
        type="date"
        :value="selected.dateTo"
        :min="selected.dateFrom || undefined"
        @change="updateDate('dateTo', $event.target.value)"
      >
    </label>
  </div>
  <p v-if="selected.dateFrom && selected.dateTo &&
           selected.dateFrom > selected.dateTo" role="alert">
    End date must be on or after the start date.
  </p>
</div>
</fieldset>

<fieldset class="filter-section">
  <legend>Category</legend>
  <div class="category-grid">
    <label v-for="option in categoryOptions" :key="option.value">
      <input type="checkbox"
        :checked="isSelected('categories', option.value)"
        @change="choose('categories', option.value)">
      {{ option.label }}
    </label>
  </div>
</fieldset>

<label class="availability-row">
  Only events with spots left
  <input class="availability-switch" type="checkbox" role="switch"
    :checked="isSelected('extras', 'spots_left')"
    @change="choose('extras', 'spots_left')">
</label>
        <p v-if="error" class="count-error" role="alert">Couldn’t load the event count. <button type="button" @click="emit('retry')">Try again</button></p>
        <footer class="filter-footer">
          <button type="button" class="clear-all" @click="clearAll">Clear all</button>
          <button type="submit" class="show-events" :disabled="loading || Boolean(error) || total === null || invalidCustomRange">{{ loading ? 'Finding events…' : total === null ? 'Show events' : `Show ${total} events` }}</button>
        </footer>
      </div>
    </div>
    <div v-if="showActive && activeChips.length" class="active-filters" aria-label="Active filters">
      <button v-for="chip in activeChips" :key="`${chip.group}-${chip.value}`" type="button" class="active-filter" :aria-label="`Remove ${chip.label} filter`" @click="removeChip(chip)">{{ chip.label }} <span aria-hidden="true">×</span></button>
    </div>
  </form>
</template>

<style scoped>
.event-filters, .search-wrap { width: 100%; min-width: 0; }
.search-wrap { position: relative; }
.search-toolbar, .filter-panel { box-sizing: border-box; border: 1px solid var(--bookedz-control-border); border-radius: 18px; background: var(--bookedz-surface); }
.search-toolbar { display: flex; align-items: stretch; gap: 6px; padding: 6px; box-shadow: var(--bookedz-search-shadow); }
.search-field { display: flex; align-items: center; position: relative; flex: 1; min-width: 0; }
.search-field > svg { position: absolute; left: 12px; width: 22px; height: 22px; pointer-events: none; color: var(--bookedz-muted); }
svg { flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.search-field input { width: 100%; min-width: 0; height: 56px; border: 0; border-radius: 12px; padding: 8px 40px 8px 42px; background: transparent; color: var(--bookedz-ink); font: inherit; font-size: 1rem; }
.search-field input::-webkit-search-cancel-button { display: none; }
.clear-search { position: absolute; right: 0; width: 40px; height: 44px; border: 0; border-radius: 12px; background: transparent; color: var(--bookedz-muted); font-size: 1.4rem; }
.filter-toggle { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; padding: 8px 14px; border: 0; border-radius: 12px; background: var(--bookedz-glass-active); color: var(--bookedz-ink); font-size: .9rem; font-weight: 650; }
.filter-toggle svg { width: 20px; height: 20px; }
.filter-toggle.is-active { background: var(--bookedz-primary-dark); color: #fff; }
.filter-count { display: grid; place-items: center; min-width: 20px; height: 20px; padding-inline: 4px; border-radius: 99px; background: rgb(255 255 255 / 22%); font-size: .75rem; }
.filter-panel { position: absolute; z-index: 30; top: calc(100% + 8px); left: 0; width: 100%; padding: 22px; box-shadow: var(--bookedz-search-shadow); max-height: min(620px, 75svh); overflow-y: auto; overflow-x: hidden; }
.filter-section { display: block; float: none; min-width: 0; margin: 0 0 22px; padding: 0; border: 0; }
.filter-section legend { float: none; width: auto; margin: 0 0 12px; font-size: .95rem; font-weight: 700; color: var(--bookedz-ink); }
.filter-options { display: flex; flex-wrap: wrap; gap: 8px; }
.filter-chip { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; max-width: 100%; padding: 8px 12px; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-canvas); color: var(--bookedz-ink); font-size: .85rem; font-weight: 550; }
.filter-chip svg { width: 18px; height: 18px; }
.filter-chip:hover { border-color: var(--bookedz-primary-dark); }
.filter-chip[aria-pressed="true"] { background: var(--bookedz-primary-dark); border-color: var(--bookedz-primary-dark); color: #fff; }
.filter-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; border-top: 1px solid var(--bookedz-border); padding-top: 16px; }
.clear-all { min-height: 44px; padding: 8px 0; border: 0; background: transparent; color: var(--bookedz-muted); text-decoration: underline; text-underline-offset: 3px; font-size: .875rem; }
.show-events { min-height: 44px; padding: 10px 16px; border: 1px solid var(--bookedz-ink); border-radius: 12px; background: var(--bookedz-ink); color: var(--bookedz-surface); font-weight: 650; font-size: .875rem; }
.show-events:disabled { opacity: .6; cursor: wait; }
.calendar-hook p, .count-error { margin: 12px 0 0; font-size: .8rem; color: var(--bookedz-muted); }
.count-error { margin-bottom: 16px; }.count-error button { border: 0; background: transparent; color: var(--bookedz-primary-dark); text-decoration: underline; }
.active-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.active-filter { min-height: 44px; padding: 7px 12px; border: 1px solid var(--bookedz-control-border); border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-size: .85rem; }.active-filter span { margin-left: 8px; }
button:focus-visible, input:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 3px; }
@media(max-width:575px) { .filter-panel { padding: 18px; }.filter-toggle { padding-inline: 10px; gap: 5px; }.filter-toggle svg { width: 17px; height: 17px; } }
.search-toolbar, .filter-panel { border-radius: 8px; }
.filter-toggle { border-radius: 5px; }
.filter-panel { padding: 22px; }
.panel-heading {
  display: flex; align-items: center;
  justify-content: space-between; margin-bottom: 22px;
}
.close-panel {
  border: 0; background: transparent; color: var(--bookedz-muted);
  font-size: 24px; padding: 0 5px; cursor: pointer;
}
.date-segments {
  display: flex; gap: 2px; padding: 3px; border-radius: 6px;
  background: var(--bookedz-canvas);
}
.date-segments button {
  flex: 1; min-width: 0; border: 0; border-radius: 4px;
  padding: 9px 5px; background: transparent;
  color: var(--bookedz-ink); font: inherit; font-size: 12px;
  cursor: pointer;
}
.date-segments button[aria-pressed="true"] {
  background: var(--bookedz-surface);
  color: var(--bookedz-primary-dark);
  box-shadow: 0 1px 4px rgb(0 0 0 / 10%);
  font-weight: 650;
}
.category-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px;
}
.category-grid label {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0; color: var(--bookedz-ink); cursor: pointer;
}
.category-grid input {
  width: 16px; height: 16px; margin: 0;
  accent-color: var(--bookedz-primary-dark);
}
.availability-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 18px 0; color: var(--bookedz-ink);
  border-top: 1px solid var(--bookedz-border); cursor: pointer;
}
.availability-switch {
  appearance: none; position: relative; flex-shrink: 0;
  width: 34px; height: 20px; margin: 0;
  border-radius: 20px; background: var(--bookedz-muted);
  cursor: pointer;
}
.availability-switch::before {
  content: ""; position: absolute; top: 3px; left: 3px;
  width: 14px; height: 14px; border-radius: 50%; background: #fff;
}
.availability-switch:checked { background: var(--bookedz-primary-dark); }
.availability-switch:checked::before { transform: translateX(14px); }
.show-events {
  border-radius: 5px; background: var(--bookedz-primary-dark);
  border-color: var(--bookedz-primary-dark); color: #fff;
}
.active-filter { border-radius: 4px; }
.custom-date-range {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}

.custom-date-range label {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--bookedz-ink);
  font-size: .875rem;
}

.custom-date-range input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--bookedz-control-border);
  border-radius: 6px;
  background: var(--bookedz-surface);
  color: var(--bookedz-ink);
  font: inherit;
}
</style>
