<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { CELL_MS } from '../../utils/hangoutSlots.js'

// Days × 30-minute cells. Edit mode paints the viewer's own free cells (pointer, touch
// or keyboard); overlap mode is read-only and shows aggregate counts only.
const props = defineProps({
  days: { type: Array, required: true }, // Singapore day starts (ms)
  modelValue: { type: Set, default: () => new Set() }, // selected cell starts (ms)
  mode: { type: String, default: 'edit' }, // 'edit' | 'overlap'
  tool: { type: String, default: 'paint' }, // paint | erase | scroll (drags scroll; no painting)
  counts: { type: Map, default: () => new Map() }, // cell start → free count (overlap)
  responders: { type: Number, default: 0 },
  highlight: { type: Object, default: null }, // { start, end } to outline
  label: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue', 'change-start'])
const FIRST_ROW_HOUR = 7
const ROWS = (24 - FIRST_ROW_HOUR) * 2
const rows = Array.from({ length: ROWS }, (_, i) => FIRST_ROW_HOUR * 3600000 + i * CELL_MS)
const focus = ref({ row: 2 * (11 - FIRST_ROW_HOUR), col: 0 })
const gridEl = ref(null)
let dragging = false

const dayLabel = d => new Date(d).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
const timeLabel = offset => { const h = Math.floor(offset / 3600000), m = (offset % 3600000) / 60000; return `${String(h).padStart(2, '0')}:${m ? '30' : '00'}` }
const cellStart = (col, row) => props.days[col] + rows[row]
const isSelected = (col, row) => props.modelValue.has(cellStart(col, row))
const inHighlight = (col, row) => props.highlight && cellStart(col, row) >= props.highlight.start && cellStart(col, row) < props.highlight.end
const countAt = (col, row) => props.counts.get(cellStart(col, row)) || 0
const heat = (col, row) => props.responders ? countAt(col, row) / props.responders : 0
const cellLabel = (col, row) => {
  const when = `${dayLabel(props.days[col])}, ${timeLabel(rows[row])} to ${timeLabel(rows[row] + CELL_MS)}`
  return props.mode === 'edit' ? `${when}, ${isSelected(col, row) ? 'free' : 'not marked'}` : `${when}, ${countAt(col, row)} of ${props.responders} free`
}

function apply(col, row, value) {
  const start = cellStart(col, row)
  if (props.modelValue.has(start) === value) return
  const next = new Set(props.modelValue)
  if (value) next.add(start)
  else next.delete(start)
  emit('update:modelValue', next)
}
function pointerDown(event, col, row) {
  if (props.mode !== 'edit' || props.tool === 'scroll') return
  event.preventDefault()
  emit('change-start')
  dragging = true
  focus.value = { row, col }
  apply(col, row, props.tool === 'paint')
  gridEl.value?.setPointerCapture?.(event.pointerId)
}
function pointerMove(event) {
  if (!dragging) return
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cell]')
  if (!cell || !gridEl.value?.contains(cell)) return
  apply(Number(cell.dataset.col), Number(cell.dataset.row), props.tool === 'paint')
}
function pointerUp() { dragging = false }
window.addEventListener('pointerup', pointerUp)
onBeforeUnmount(() => window.removeEventListener('pointerup', pointerUp))

async function keydown(event) {
  const { row, col } = focus.value
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
  if (moves[event.key]) {
    event.preventDefault()
    const [dr, dc] = moves[event.key]
    focus.value = { row: Math.min(ROWS - 1, Math.max(0, row + dr)), col: Math.min(props.days.length - 1, Math.max(0, col + dc)) }
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    focus.value = { row: event.key === 'Home' ? 0 : ROWS - 1, col }
  } else if ((event.key === ' ' || event.key === 'Enter') && props.mode === 'edit') {
    event.preventDefault()
    emit('change-start')
    apply(col, row, !isSelected(col, row))
    return
  } else return
  await nextTick()
  gridEl.value?.querySelector(`[data-col="${focus.value.col}"][data-row="${focus.value.row}"]`)?.focus()
}
watch(() => props.days.length, length => { if (focus.value.col >= length) focus.value = { ...focus.value, col: 0 } })
const columns = computed(() => `4.2rem repeat(${props.days.length}, minmax(3.4rem, 1fr))`)
</script>

<template>
  <div class="grid-scroll">
    <div ref="gridEl" class="availability-grid" :class="[`availability-grid--${mode}`, `tool-${tool}`]" role="grid" :aria-label="label" :aria-readonly="mode !== 'edit'" :style="{ gridTemplateColumns: columns }" @pointermove="pointerMove" @keydown="keydown">
      <div role="row" class="grid-row grid-row--head">
        <span role="columnheader" class="corner"><span class="visually-hidden">Time</span></span>
        <span v-for="d in days" :key="d" role="columnheader" class="day-head">{{ dayLabel(d) }}</span>
      </div>
      <div v-for="(offset, row) in rows" :key="offset" role="row" class="grid-row">
        <span role="rowheader" class="time-head" :class="{ 'time-head--hour': offset % 3600000 === 0 }">{{ offset % 3600000 === 0 ? timeLabel(offset) : '' }}<span v-if="offset % 3600000" class="visually-hidden">{{ timeLabel(offset) }}</span></span>
        <span v-for="(d, col) in days" :key="d" role="gridcell" class="cell"
          :data-cell="''" :data-col="col" :data-row="row"
          :tabindex="focus.row === row && focus.col === col ? 0 : -1"
          :aria-selected="mode === 'edit' ? isSelected(col, row) : undefined"
          :aria-label="cellLabel(col, row)"
          :class="{ 'is-free': mode === 'edit' && isSelected(col, row), 'is-highlight': inHighlight(col, row), 'is-hour': offset % 3600000 === 0 }"
          :style="mode === 'overlap' ? { '--heat': heat(col, row) } : null"
          @pointerdown="pointerDown($event, col, row)" @focus="focus = { row, col }">
          <span v-if="mode === 'overlap' && countAt(col, row)" class="count" aria-hidden="true">{{ countAt(col, row) }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid-scroll { max-height: 34rem; overflow: auto; border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-control); background: var(--bookedz-surface); overscroll-behavior: contain; }
.availability-grid { display: grid; min-width: max-content; user-select: none; }
.grid-row { display: contents; }
.corner,.day-head { position: sticky; top: 0; z-index: 2; background: var(--bookedz-glass-solid); border-bottom: 1px solid var(--bookedz-border); }
.corner { left: 0; z-index: 3; }
.day-head { padding: 8px 4px; font-size: .75rem; font-weight: 700; text-align: center; white-space: nowrap; }
.time-head { position: sticky; left: 0; z-index: 1; padding: 0 8px; background: var(--bookedz-surface); font-size: .7rem; color: var(--bookedz-muted); font-variant-numeric: tabular-nums; line-height: 1; transform: translateY(-.35rem); }
.cell { position: relative; height: 22px; border-left: 1px solid var(--bookedz-border); border-top: 1px dashed color-mix(in srgb, var(--bookedz-border) 60%, transparent); cursor: pointer; }
.cell.is-hour { border-top-style: solid; border-top-color: var(--bookedz-border); }
.availability-grid--edit:not(.tool-scroll) .cell { touch-action: none; }
.tool-scroll .cell { cursor: default; }
.availability-grid--edit .cell:hover { background: var(--bookedz-hover); }
.cell.is-free { background: var(--bookedz-teal); }
.cell.is-free::after { content: ''; position: absolute; inset: 7px 45%; border-radius: 2px; background: rgb(255 255 255 / 55%); }
.availability-grid--edit .cell.is-free:hover { background: color-mix(in srgb, var(--bookedz-teal) 80%, var(--bookedz-ink)); }
.tool-erase .cell { cursor: cell; }
.availability-grid--overlap .cell { cursor: default; background: color-mix(in srgb, var(--bookedz-teal) calc(var(--heat, 0) * 85%), transparent); }
.cell.is-highlight { box-shadow: inset 2px 0 0 var(--bookedz-fill), inset -2px 0 0 var(--bookedz-fill); }
.count { position: absolute; inset: 0; display: grid; place-items: center; font-size: .65rem; font-weight: 800; color: var(--bookedz-ink); font-variant-numeric: tabular-nums; }
.cell:focus-visible { outline: 3px solid var(--bookedz-focus); outline-offset: -3px; z-index: 1; }
</style>
