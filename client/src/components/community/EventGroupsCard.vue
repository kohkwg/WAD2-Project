<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import EventArtwork from '../EventArtwork.vue'
import GroupCard from './GroupCard.vue'
import { formatEventTime } from '../../utils/helpers.js'
import { countdownLabel } from '../../utils/groups.js'

// One event in Community with every group going to it, so many groups don't become one
// long list. Shows a countdown, everyone going across its groups, and a quick way to start
// another group for the same event.
const props = defineProps({ event: { type: Object, default: null }, groups: { type: Array, required: true } })
const emit = defineEmits(['changed', 'start'])

const category = computed(() => props.event?.category || '')
const startTime = computed(() => props.event?.startTime || props.groups[0]?.startTime)
const countdown = computed(() => countdownLabel(startTime.value))
const soon = computed(() => new Date(startTime.value) - Date.now() < 36 * 3600e3)
// Everyone going with a group, without repeats (hosts first)
const people = computed(() => {
  const seen = new Map()
  for (const g of props.groups) for (const p of [g.host, ...g.members]) if (!seen.has(p.id)) seen.set(p.id, p)
  return [...seen.values()]
})
const initials = (name = '') => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
</script>

<template>
  <section class="event-groups-card" :aria-labelledby="`event-groups-${event?.id || groups[0].id}`">
    <header class="egc-head">
      <RouterLink v-if="event" :to="`/events/${event.id}/rsvp`" class="egc-art cat-tint" :class="`cat-${category}`" aria-hidden="true" tabindex="-1"><EventArtwork :category="category" /></RouterLink>
      <div class="egc-copy">
        <p class="egc-chips m-0">
          <span class="egc-countdown" :class="{ 'is-soon': soon }">{{ countdown }}</span>
          <span class="text-caption text-secondary">{{ groups.length }} {{ groups.length === 1 ? 'group' : 'groups' }}</span>
        </p>
        <h2 :id="`event-groups-${event?.id || groups[0].id}`" class="egc-title">
          <RouterLink v-if="event" :to="`/events/${event.id}/rsvp`">{{ event.title }}</RouterLink>
          <span v-else>Event details unavailable</span>
        </h2>
        <p v-if="event" class="text-meta text-secondary m-0">{{ formatEventTime(event) }} · {{ event.venue?.name || 'Venue to be announced' }}</p>
      </div>
      <div class="egc-people" :aria-label="`${people.length} going with a group`">
        <span class="egc-stack" aria-hidden="true">
          <span v-for="person in people.slice(0, 4)" :key="person.id" class="egc-mini" :title="person.name">{{ initials(person.name) }}</span>
          <span v-if="people.length > 4" class="egc-mini egc-more">+{{ people.length - 4 }}</span>
        </span>
        <span class="text-caption text-secondary">{{ people.length }} going</span>
      </div>
    </header>
    <TransitionGroup tag="div" name="list-fade" class="egc-groups">
      <GroupCard v-for="group in groups" :key="group.id" :group="group" compact @changed="emit('changed')" />
    </TransitionGroup>
    <button v-if="event" type="button" class="egc-start" @click="emit('start', event.id)">+ Start another group for this event</button>
  </section>
</template>

<style scoped>
.event-groups-card { display: grid; gap: 14px; padding: 16px; border: 2px solid var(--bookedz-ink); border-radius: 24px; background: var(--bookedz-surface); box-shadow: 6px 6px 0 var(--bookedz-teal); }
:global(:root[data-theme="dark"]) .event-groups-card { border-color: var(--bookedz-border); box-shadow: 6px 6px 0 color-mix(in srgb, var(--bookedz-teal) 60%, transparent); }
.egc-head { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; align-items: center; gap: 14px; }
.egc-art { display: block; width: 64px; height: 64px; overflow: hidden; border-radius: 16px; }
.egc-art :deep(svg) { width: 100%; height: 100%; }
.egc-copy { min-width: 0; display: grid; gap: 2px; }
.egc-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.egc-countdown { padding: 2px 10px; border-radius: 99px; background: var(--bookedz-mango-soft); color: var(--bookedz-ink); font-size: .74rem; font-weight: 800; }
.egc-countdown.is-soon { background: var(--bookedz-fill); color: var(--bookedz-on-fill); }
.egc-title { margin: 0; font: 900 1.2rem/1.25 var(--bookedz-heading); overflow-wrap: anywhere; }
.egc-title a { color: inherit; text-decoration: none; }
.egc-title a:hover { text-decoration: underline; }
.egc-people { display: grid; justify-items: end; gap: 4px; }
.egc-stack { display: inline-flex; }
.egc-mini { display: inline-grid; place-items: center; width: 30px; height: 30px; border: 2px solid var(--bookedz-surface); border-radius: 50%; background: var(--bookedz-orange-soft); color: var(--bookedz-primary-dark); font-size: .68rem; font-weight: 800; }
.egc-mini + .egc-mini { margin-left: -9px; }
.egc-more { background: var(--bookedz-ink); color: var(--bookedz-surface); }
.egc-groups { display: grid; gap: 10px; }
.egc-start { justify-self: start; min-height: 40px; padding: 6px 14px; border: 2px dashed var(--bookedz-control-border); border-radius: 99px; background: transparent; color: var(--bookedz-primary-dark); font-weight: 700; font-size: .88rem; }
.egc-start:hover { border-color: var(--bookedz-fill); background: var(--bookedz-orange-soft); }
@media (max-width: 575px) {
  .egc-head { grid-template-columns: 52px minmax(0, 1fr); }
  .egc-art { width: 52px; height: 52px; }
  .egc-people { grid-column: 1 / -1; justify-items: start; grid-auto-flow: column; justify-content: start; align-items: center; gap: 8px; }
}
</style>
