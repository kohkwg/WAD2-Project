<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CELL_MINUTES } from '../../utils/groups.js'

// When2meet-style availability for one side of the event. Left column: your times; press
// and drag to paint (or unpaint) 15-minute cells, on a phone too. Right column: the group,
// darker where more people are free; the best slot is outlined. Tap a group cell to see who.
const props = defineProps({
  slot: { type: String, required: true }, // 'before' | 'after'
  cells: { type: Array, required: true }, // [{ start, free: [{ id, name, me }] }]
  myCells: { type: Array, default: null }, // [start ISO] or null if not marked yet
  memberCount: { type: Number, default: 1 },
  best: { type: Object, default: null }, // { start, end } when fitted
  disabled: Boolean,
})
const emit = defineEmits(['save'])

const mine = ref(new Set(props.myCells || []))
const painting = ref(null) // true = adding, false = removing
const focusIndex = ref(-1) // the group cell whose names are shown
const grid = ref(null)
watch(() => props.myCells, (cells) => { if (painting.value === null) mine.value = new Set(cells || []) })

const time = (iso) => new Intl.DateTimeFormat('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' }).format(new Date(iso))
const endOf = (iso) => new Date(new Date(iso).getTime() + CELL_MINUTES * 60000).toISOString()
const rowLabel = (iso) => (new Date(iso).getUTCMinutes() % 30 === 0 ? time(iso) : '')
const inBest = (iso) => props.best && iso >= props.best.start && iso < props.best.end
const level = (cell) => (props.memberCount ? cell.free.length / props.memberCount : 0)
const heat = (cell) => `color-mix(in srgb, var(--bookedz-teal-ink) ${Math.round(level(cell) * 85)}%, var(--bookedz-surface))`
const shown = computed(() => props.cells[focusIndex.value] || null)

let lastIndex = -1
// Paint this cell and any skipped since the last one (fast drags jump rows)
function paint(index) {
  if (!props.cells[index] || painting.value === null) return
  const from = lastIndex < 0 ? index : Math.min(lastIndex, index)
  const to = lastIndex < 0 ? index : Math.max(lastIndex, index)
  const next = new Set(mine.value)
  for (let i = from; i <= to; i++) painting.value ? next.add(props.cells[i].start) : next.delete(props.cells[i].start)
  mine.value = next
  lastIndex = index
}
function start(event, index) {
  if (props.disabled || (event.pointerType === 'mouse' && event.button !== 0)) return
  event.preventDefault()
  painting.value = !mine.value.has(props.cells[index].start)
  lastIndex = -1
  paint(index)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish, { once: true })
  window.addEventListener('pointercancel', finish, { once: true })
}
// Touch keeps pointer events on the first element, so find the cell under the finger
function move(event) {
  const el = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-paint-index]')
  if (el && grid.value?.contains(el)) paint(Number(el.dataset.paintIndex))
}
function finish() {
  window.removeEventListener('pointermove', move)
  if (painting.value === null) return
  painting.value = null
  save()
}
function save() { emit('save', [...mine.value].sort()) }
// Keyboard: Space or Enter toggles one cell (pointer clicks are handled by painting)
function toggle(event, index) {
  if (event.detail !== 0 || props.disabled) return
  const next = new Set(mine.value)
  const start = props.cells[index].start
  next.has(start) ? next.delete(start) : next.add(start)
  mine.value = next
  save()
}
function setAll(on) {
  mine.value = new Set(on ? props.cells.map((c) => c.start) : [])
  save()
}
onBeforeUnmount(() => window.removeEventListener('pointermove', move))
</script>

<template>
  <div class="painter">
    <div class="painter-head">
      <p class="painter-q m-0">{{ slot === 'before' ? 'When are you free before?' : 'When are you free after?' }}</p>
      <span class="painter-tools">
        <button type="button" class="btn btn-link btn-sm p-0" :disabled="disabled" @click="setAll(true)">All</button>
        <button type="button" class="btn btn-link btn-sm p-0" :disabled="disabled" @click="setAll(false)">{{ myCells?.length ? 'Clear' : 'I can’t make it' }}</button>
      </span>
    </div>
    <p class="painter-hint text-caption text-secondary m-0">Press and drag over your free times.</p>

    <div ref="grid" class="painter-grid" :class="{ 'is-painting': painting !== null }">
      <span class="painter-col-label" aria-hidden="true"></span>
      <span class="painter-col-label">You</span>
      <span class="painter-col-label">Group</span>
      <template v-for="(cell, i) in cells" :key="cell.start">
        <span class="painter-time tnum" aria-hidden="true">{{ rowLabel(cell.start) }}</span>
        <button
          type="button"
          class="painter-cell painter-cell--mine"
          :class="{ 'is-on': mine.has(cell.start), 'is-half': i % 2 === 1 }"
          :data-paint-index="i"
          :aria-pressed="mine.has(cell.start)"
          :aria-label="`${time(cell.start)} to ${time(endOf(cell.start))}: you’re ${mine.has(cell.start) ? 'free' : 'not free'}`"
          :disabled="disabled"
          @pointerdown="start($event, i)"
          @click="toggle($event, i)"
        ></button>
        <button
          type="button"
          class="painter-cell painter-cell--group"
          :class="{ 'is-best': inBest(cell.start), 'is-best-top': inBest(cell.start) && !inBest(cells[i - 1]?.start || ''), 'is-best-bottom': inBest(cell.start) && !inBest(cells[i + 1]?.start || ''), 'is-half': i % 2 === 1, 'is-focus': focusIndex === i }"
          :style="{ background: heat(cell) }"
          :aria-label="`${time(cell.start)}: ${cell.free.length} of ${memberCount} free`"
          @click="focusIndex = focusIndex === i ? -1 : i"
          @mouseenter="focusIndex = i"
          @focus="focusIndex = i"
        ></button>
      </template>
    </div>

    <p :key="focusIndex" class="painter-who text-caption m-0 reveal-down" aria-live="polite">
      <template v-if="shown">
        <strong class="tnum">{{ time(shown.start) }}:</strong>
        {{ shown.free.length ? `${shown.free.map((p) => (p.me ? 'You' : p.name.split(/\s+/)[0])).join(', ')} free` : 'Nobody free yet' }}
      </template>
      <template v-else>Point at the group column to see who’s free.</template>
    </p>
  </div>
</template>

<style scoped>
.painter { display: grid; gap: 6px; padding: 10px; border-radius: 12px; background: var(--bookedz-hover); }
.painter-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.painter-q { font-size: .92rem; font-weight: 600; }
.painter-tools { display: flex; gap: 12px; }
.painter-tools .btn { font-size: .82rem; }
.painter-grid { display: grid; grid-template-columns: auto 1fr 1fr; column-gap: 6px; user-select: none; -webkit-user-select: none; }
.painter-col-label { padding-bottom: 4px; color: var(--bookedz-muted); font-size: .75rem; font-weight: 700; text-align: center; }
.painter-time { align-self: start; min-width: 5.2em; margin-top: -0.55em; padding-right: 2px; color: var(--bookedz-muted); font-size: .72rem; text-align: right; }
.painter-cell { display: block; width: 100%; height: 22px; padding: 0; border: 0; border-top: 1px solid var(--bookedz-border); background: var(--bookedz-surface); }
.painter-cell.is-half { border-top-style: dotted; }
.painter-cell:focus-visible { outline: 2px solid var(--bookedz-primary); outline-offset: -2px; position: relative; z-index: 1; }
.painter-cell--mine { touch-action: none; cursor: pointer; transition: background-color var(--bookedz-motion-fast) var(--bookedz-ease); }
.painter-cell--mine.is-on { background: var(--bookedz-primary); animation: cell-pop var(--bookedz-motion-fast, .16s) var(--bookedz-ease-stamp, ease-out); }
@keyframes cell-pop { 0% { transform: scaleX(.86); } 100% { transform: none; } }
.painter-grid.is-painting .painter-cell--mine { cursor: ns-resize; }
.painter-cell--group { cursor: default; box-shadow: inset 2px 0 0 transparent, inset -2px 0 0 transparent; transition: background-color var(--bookedz-motion-normal, .24s) var(--bookedz-ease, ease), box-shadow var(--bookedz-motion-normal, .24s) var(--bookedz-ease, ease); }
.painter-cell--group.is-best { box-shadow: inset 2px 0 0 var(--bookedz-primary), inset -2px 0 0 var(--bookedz-primary); }
.painter-cell--group.is-best-top { box-shadow: inset 2px 0 0 var(--bookedz-primary), inset -2px 0 0 var(--bookedz-primary), inset 0 2px 0 var(--bookedz-primary); }
.painter-cell--group.is-best-bottom { box-shadow: inset 2px 0 0 var(--bookedz-primary), inset -2px 0 0 var(--bookedz-primary), inset 0 -2px 0 var(--bookedz-primary); }
.painter-cell--group.is-best-top.is-best-bottom { box-shadow: inset 0 0 0 2px var(--bookedz-primary); }
.painter-cell--group.is-focus { outline: 2px solid var(--bookedz-ink); outline-offset: -2px; position: relative; }
.painter-grid > .painter-cell:nth-last-child(-n + 2) { border-bottom: 1px solid var(--bookedz-border); }
.painter-who { min-height: 1.4em; color: var(--bookedz-muted); overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) { .painter-cell--mine, .painter-cell--group { transition: none; animation: none !important; } }
</style>
