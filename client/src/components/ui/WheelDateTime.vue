<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useAttrs, useId, watch } from 'vue';

// a date and time field with scrolling wheels (day, month, year, hour, minute, am/pm) instead of
// the browser's typed segments. the value is the same "yyyy-mm-ddthh:mm" string a
// <input type="datetime-local"> uses, so it drops in with v-model. each wheel is also a spin button:
// focus it and use the up and down arrow keys (or page up and page down).
defineOptions({
  inheritAttrs: false
});

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  // only decides where an empty field starts
  min: {
    type: String,
    default: ''
  },
  clearable: Boolean,
  // opens the panel as a fixed layer placed from the field's position, for fields inside a scrolling
  // table or box that would otherwise clip or scroll the panel
  fixed: Boolean,
  placeholder: {
    type: String,
    default: 'Pick a date and time'
  }
});

const emit = defineEmits(['update:modelValue', 'close']);
// the page's class belongs on the wrapper; id and aria-* belong on the button that opens the wheels

const attrs = useAttrs();

const buttonAttrs = computed(() => Object.fromEntries(Object.entries(attrs).filter(([name]) => name !== 'class')));

const ITEM = 40; // px per row; the css uses the same number

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = n => String(n).padStart(2, '0');

const panelId = useId();

const open = ref(false);

const root = ref(null);

const trigger = ref(null);

const wheels = ref({});

const panel = ref(null);

const panelStyle = ref({});

// fixed mode: sit under the field (or above it when there is no room below), kept inside the viewport

function placePanel() {
  if (!props.fixed || !trigger.value || !panel.value) return;
  const field = trigger.value.getBoundingClientRect();
  const width = Math.min(380, window.innerWidth - 32);
  const height = panel.value.offsetHeight;
  const left = Math.max(16, Math.min(field.left, window.innerWidth - width - 16));
  let top = field.bottom + 8;
  if (top + height > window.innerHeight - 16 && field.top - 8 - height > 8) top = field.top - 8 - height;
  top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
  panelStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`
  };
}

// a fixed panel would drift away from its field, so scrolling or resizing the page closes it

function onPageMove(event) {
  if (panel.value && event.target instanceof Node && panel.value.contains(event.target)) return;
  close(false);
}

// pull the parts out of a "yyyy-mm-ddthh:mm" string; null when it isn't one

function parse(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!match) return null;
  return {
    year: +match[1],
    month: +match[2],
    day: +match[3],
    hour24: +match[4],
    minute: +match[5]
  };
}

function startingPoint() {
  const fromMin = parse(props.min);
  if (fromMin) return fromMin;
  const soon = new Date(Date.now() + 3600e3);
  return {
    year: soon.getFullYear(),
    month: soon.getMonth() + 1,
    day: soon.getDate(),
    hour24: soon.getHours(),
    minute: 0
  };
}

const parts = computed(() => parse(props.modelValue));

const shown = computed(() => parts.value || startingPoint());

const thisYear = new Date().getFullYear();

const years = computed(() => {
  const first = Math.min(thisYear, shown.value.year);
  const last = Math.max(thisYear + 5, shown.value.year);
  return Array.from({
    length: last - first + 1
  }, (_, index) => first + index);
});

const daysInMonth = computed(() => new Date(shown.value.year, shown.value.month, 0).getDate());

const hour12 = computed(() => shown.value.hour24 % 12 || 12);

const isPm = computed(() => shown.value.hour24 >= 12);

const columns = computed(() => [{
  key: 'day',
  label: 'Day',
  items: Array.from({
    length: daysInMonth.value
  }, (_, i) => String(i + 1)),
  index: shown.value.day - 1
}, {
  key: 'month',
  label: 'Month',
  items: MONTHS,
  index: shown.value.month - 1
}, {
  key: 'year',
  label: 'Year',
  items: years.value.map(String),
  index: years.value.indexOf(shown.value.year)
}, {
  key: 'hour',
  label: 'Hour',
  items: Array.from({
    length: 12
  }, (_, i) => String(i + 1)),
  index: hour12.value - 1
}, {
  key: 'minute',
  label: 'Minute',
  items: Array.from({
    length: 60
  }, (_, i) => pad(i)),
  index: shown.value.minute
}, {
  key: 'period',
  label: 'AM/PM',
  items: ['AM', 'PM'],
  index: isPm.value ? 1 : 0
}]);

const label = computed(() => {
  const p = parts.value;
  if (!p) return '';
  const when = new Date(p.year, p.month - 1, p.day, p.hour24, p.minute);
  return when.toLocaleString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
});

function commit(next) {
  // Limit the day, because the new month can have fewer days.
  const day = Math.min(next.day, new Date(next.year, next.month, 0).getDate());
  emit('update:modelValue', `${next.year}-${pad(next.month)}-${pad(day)}T${pad(next.hour24)}:${pad(next.minute)}`);
}
// choose row `index` on one wheel

function choose(key, index) {
  const column = columns.value.find(c => c.key === key);
  const row = Math.max(0, Math.min(column.items.length - 1, index));
  const next = {
    ...shown.value
  };
  if (key === 'day') next.day = row + 1;else if (key === 'month') next.month = row + 1;else if (key === 'year') next.year = years.value[row];else if (key === 'hour') next.hour24 = (row + 1) % 12 + (isPm.value ? 12 : 0);else if (key === 'minute') next.minute = row;else next.hour24 = next.hour24 % 12 + (row === 1 ? 12 : 0);
  commit(next);
}

// keep each wheel's scroll position matching the value (without feeding back into it)

let quiet = false;

let quietTimer;

function syncWheels(smooth = false) {
  quiet = true;
  clearTimeout(quietTimer);
  for (const column of columns.value) {
    const el = wheels.value[column.key];
    if (el) el.scrollTo({
      top: Math.max(0, column.index) * ITEM,
      behavior: smooth ? 'smooth' : 'instant'
    });
  }
  quietTimer = setTimeout(() => {
    quiet = false;
  }, smooth ? 450 : 80);
}

const settle = {};

/**
 * Choose the row at the wheel position after the scroll stops.
 * @param {string} key The column key of the wheel.
 */
function onScroll(key) {
  if (quiet) return;
  clearTimeout(settle[key]);
  settle[key] = setTimeout(() => {
    const el = wheels.value[key];
    if (!el) return;
    const row = Math.round(el.scrollTop / ITEM);
    const column = columns.value.find(c => c.key === key);
    if (row !== column.index) choose(key, row);
  }, 90);
}

function onKey(event, column) {
  const step = {
    ArrowUp: -1,
    ArrowDown: 1,
    PageUp: -5,
    PageDown: 5
  }[event.key];
  if (step != null) {
    event.preventDefault();
    choose(column.key, column.index + step);
  } else if (event.key === 'Home') {
    event.preventDefault();
    choose(column.key, 0);
  } else if (event.key === 'End') {
    event.preventDefault();
    choose(column.key, column.items.length - 1);
  }
}

// month or year changes can shorten the day list, so re-align after the list re-renders

watch(columns, async () => {
  if (open.value) {
    await nextTick();
    syncWheels(true);
  }
});

async function toggle() {
  if (open.value) return close();
  open.value = true;
  if (!parts.value) commit(startingPoint()); // an empty field starts on a sensible time
  await nextTick();
  placePanel();
  syncWheels();
  document.addEventListener('pointerdown', outside, true);
  if (props.fixed) {
    window.addEventListener('scroll', onPageMove, true);
    window.addEventListener('resize', onPageMove);
  }
}

function close(refocus = true) {
  const wasOpen = open.value;
  open.value = false;
  document.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('scroll', onPageMove, true);
  window.removeEventListener('resize', onPageMove);
  if (refocus) trigger.value?.focus();
  if (wasOpen) emit('close');
}

function outside(event) {
  if (root.value && !root.value.contains(event.target)) close(false);
}

function onEscape(event) {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation();
    close();
  }
}

function clear() {
  emit('update:modelValue', '');
  close();
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('scroll', onPageMove, true);
  window.removeEventListener('resize', onPageMove);
  clearTimeout(quietTimer);
});
</script>

<template>
  <div ref="root" class="wheel-field" :class="attrs.class" @keydown="onEscape">
    <button
      ref="trigger"
      type="button"
      class="form-control wheel-trigger"
      :class="{ 'is-placeholder': !label }"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      v-bind="buttonAttrs"
      @click="toggle"
    >
      <span>{{ label || placeholder }}</span>
      <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2"/>
      <path d="M4 10h16M9 3v4M15 3v4"/></svg>
    </button>

    <div
      v-if="open"
      :id="panelId"
      ref="panel"
      class="wheel-panel"
      :class="{ 'wheel-panel--fixed': fixed }"
      :style="fixed ? panelStyle : undefined"
      role="dialog"
      aria-label="Choose date and time">
      <div class="wheel-cols">
        <div v-for="column in columns" :key="column.key" class="wheel-col" :class="`wheel-col--${column.key}`">
          <span class="wheel-label">{{ column.label }}</span>
          <div
            :ref="(el) => { if (el) wheels[column.key] = el }"
            class="wheel"
            role="spinbutton"
            tabindex="0"
            :aria-label="column.label"
            :aria-valuemin="1"
            :aria-valuemax="column.items.length"
            :aria-valuenow="column.index + 1"
            :aria-valuetext="column.items[column.index]"
            @scroll.passive="onScroll(column.key)"
            @keydown="onKey($event, column)"
          >
            <span
              v-for="(item, row) in column.items"
              :key="item"
              class="wheel-item"
              :class="{ 'is-selected': row === column.index }"
              aria-hidden="true"
              @click="choose(column.key, row); syncWheels(true)"
            >{{ item }}</span>
          </div>
        </div>
        <span class="wheel-band" aria-hidden="true"></span>
      </div>
      <div class="wheel-actions">
        <button v-if="clearable" type="button" class="btn btn-outline-secondary btn-sm" @click="clear">Clear</button>
        <button type="button" class="btn btn-primary btn-sm ms-auto" @click="close()">Done</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wheel-field {
  position: relative;
}

.wheel-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .6rem;
  width: 100%;
  text-align: left;
  cursor: pointer;
}

.wheel-trigger.is-placeholder span {
  color: var(--bookedz-muted);
}

.wheel-trigger svg {
  flex: none;
}

.wheel-panel {
  position: absolute;
  z-index: 30;
  top: calc(100% + 8px);
  left: 0;
  width: min(380px, calc(100vw - 2rem));
  padding: 12px 12px 10px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 18px;
  background: var(--bookedz-surface);
  box-shadow: 5px 5px 0 var(--bookedz-teal);
}

.wheel-panel--fixed {
  position: fixed;
  z-index: 1100;
}

:global(:root[data-theme="dark"]) .wheel-panel {
  border-color: var(--bookedz-border);
}

.wheel-cols {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1.3fr 1.5fr 1fr 1fr 1fr;
  gap: 4px;
}

.wheel-col {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.wheel-label {
  height: 1.2rem;
  overflow: hidden;
  color: var(--bookedz-muted);
  font-size: .7rem;
  font-weight: 700;
  line-height: 1.2rem;
  text-align: center;
  white-space: nowrap;
}

/* five rows tall; the padding lets the first and last rows reach the middle band */

.wheel {
  height: calc(40px * 5);
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  scrollbar-width: none;
  padding: 80px 0;
  border-radius: 12px;
  outline-offset: 2px;
  mask-image: linear-gradient(transparent, #000 30%, #000 70%, transparent);
  -webkit-mask-image: linear-gradient(transparent, #000 30%, #000 70%, transparent);
  overscroll-behavior: contain;
}

.wheel::-webkit-scrollbar {
  display: none;
}

.wheel:focus-visible {
  outline: 3px solid var(--bookedz-focus);
}

.wheel-item {
  display: grid;
  place-items: center;
  height: 40px;
  scroll-snap-align: center;
  color: var(--bookedz-muted);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}

.wheel-item.is-selected {
  color: var(--bookedz-ink);
  font-weight: 800;
}

/* the highlight sits behind the middle row of every wheel */

.wheel-band {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(1.2rem + 4px + 80px);
  height: 40px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--bookedz-fill) 16%, transparent);
  pointer-events: none;
}

.wheel-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.wheel-actions .btn {
  min-height: 40px;
  border-radius: 99px;
  border-width: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .wheel {
    scroll-behavior: auto;
  }
}
</style>
