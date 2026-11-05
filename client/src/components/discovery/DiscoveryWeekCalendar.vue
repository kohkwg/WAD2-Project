<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

// A Monday-to-Sunday glance at the events Discover is showing, in Singapore time.
const props = defineProps({
  events: { type: Array, default: () => [] },
  offset: { type: Number, default: 0 },
  signedIn: Boolean, error: { type: String, default: '' },
})
const emit = defineEmits(['select', 'update:offset'])
const zone = 'Asia/Singapore'
const dayKey = date => date.toLocaleDateString('en-CA', { timeZone: zone })
const todayKey = computed(() => dayKey(new Date()))
const weekStart = computed(() => {
  const [year, month, day] = todayKey.value.split('-').map(Number)
  const today = new Date(Date.UTC(year, month - 1, day))
  today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7) + props.offset * 7)
  return today
})
const days = computed(() => Array.from({ length: 7 }, (_, index) => {
  const date = new Date(weekStart.value)
  date.setUTCDate(date.getUTCDate() + index)
  const key = date.toISOString().slice(0, 10)
  return {
    key, number: date.getUTCDate(), today: key === todayKey.value,
    weekday: date.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' }),
    events: props.events.filter(event => dayKey(new Date(event.start_time)) === key)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time)),
  }
}))
const weekTotal = computed(() => days.value.reduce((sum, day) => sum + day.events.length, 0))
const range = computed(() => {
  const end = new Date(weekStart.value); end.setUTCDate(end.getUTCDate() + 6)
  const day = date => date.toLocaleDateString('en-SG', { timeZone: 'UTC', day: 'numeric' })
  const month = date => date.toLocaleDateString('en-SG', { timeZone: 'UTC', month: 'short' })
  const start = weekStart.value
  return `${day(start)}${month(start) === month(end) ? '' : ` ${month(start)}`} – ${day(end)} ${month(end)} ${end.getUTCFullYear()}`
})
const timeOf = event => new Date(event.start_time).toLocaleTimeString('en-SG', { timeZone: zone, hour: 'numeric', minute: '2-digit' })
const categoryOf = event => event.category || event.tags?.[0] || 'event'
</script>

<template>
  <section class="week-card" aria-label="This week's events">
    <header class="week-head">
      <div>
        <h2>{{ range }}</h2>
        <p v-if="!signedIn"><RouterLink to="/login?redirect=/discover">Sign in</RouterLink> to see your events here.</p>
        <p v-else-if="error" role="alert">{{ error }}</p>
        <p v-else aria-live="polite">{{ weekTotal ? `You're going to ${weekTotal} ${weekTotal === 1 ? 'event' : 'events'} this week` : 'Your week is free' }}</p>
      </div>
      <div class="week-nav">
        <button type="button" aria-label="Previous week" :disabled="offset <= 0" @click="emit('update:offset', offset - 1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg></button>
        <button type="button" aria-label="Next week" @click="emit('update:offset', offset + 1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
      </div>
    </header>
    <ol class="week-days">
      <li v-for="day in days" :key="day.key" class="week-day" :class="{ 'has-events': day.events.length }">
        <div class="week-label"><span>{{ day.weekday }}</span><b :class="{ 'is-today': day.today }">{{ day.number }}</b></div>
        <p v-if="!day.events.length" class="week-empty">Free</p>
        <ul v-else class="week-events">
          <li v-for="event in day.events" :key="event.id">
            <button type="button" @click="emit('select', event)">
              <i class="week-swatch cat-tint" :class="`cat-${categoryOf(event)}`" aria-hidden="true"></i>
              <time :datetime="event.start_time">{{ timeOf(event) }}</time>
              <span class="week-title">{{ event.title }}</span>
            </button>
          </li>
        </ul>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.week-card { display: flex; flex: 0 1 auto; flex-direction: column; min-height: 0; padding: 10px 14px 4px; border: 2px solid var(--bookedz-ink); border-radius: 20px; background: var(--bookedz-surface); box-shadow: 5px 5px 0 var(--bookedz-teal); }
.week-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 2px; }
.week-head h2 { margin: 0; font-family: var(--bookedz-body); font-size: 15px; font-weight: 800; }
.week-head p { margin: 2px 0 0; font-size: 12px; color: var(--bookedz-muted); }
.week-head p a { color: var(--bookedz-primary-dark); font-weight: 700; }
.week-nav { display: flex; gap: 8px; }
.week-nav button { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--bookedz-border); border-radius: 50%; background: var(--bookedz-surface); color: var(--bookedz-ink); }
.week-nav button:hover:not(:disabled) { background: var(--bookedz-hover); }
.week-nav button:disabled { color: var(--bookedz-disabled-ink); cursor: not-allowed; }
.week-nav svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.week-days { flex: 0 1 auto; min-height: 0; margin: 0; padding: 0 4px 8px 0; overflow-y: auto; list-style: none; overscroll-behavior: contain; }
.week-day { display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: 8px; padding: 1px 8px; border-top: 1px solid var(--bookedz-border); }
.week-day.has-events { background: color-mix(in srgb, var(--bookedz-orange-soft) 55%, var(--bookedz-surface)); border-radius: 12px; border-top-color: transparent; }
.week-label { display: flex; align-items: center; justify-content: space-between; gap: 4px; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--bookedz-muted); }
.week-label b { display: grid; place-items: center; min-width: 22px; height: 22px; border-radius: 50%; color: var(--bookedz-ink); font-size: 13px; letter-spacing: 0; }
.week-label b.is-today { background: var(--bookedz-fill); color: var(--bookedz-on-fill); }
.week-empty { margin: 0; font-size: 12px; color: var(--bookedz-muted); }
.week-events { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; }
.week-events li { min-width: 0; }
.week-events button { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 24px; padding: 1px 6px; border: 0; border-radius: 8px; background: transparent; color: var(--bookedz-ink); font: inherit; font-size: 12px; text-align: left; }
.week-events button:hover,.week-events button.is-selected { background: var(--bookedz-hover); }
.week-events button.is-selected .week-title { font-weight: 700; }
.week-swatch { flex: none; width: 16px; height: 16px; border: 2px solid var(--bookedz-ink); border-radius: 5px; }
.week-events time { flex: none; color: var(--bookedz-primary-dark); font-weight: 700; }
.week-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
