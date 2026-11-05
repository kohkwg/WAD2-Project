<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import EventArtwork from '../EventArtwork.vue';
import GroupCard from './GroupCard.vue';
import { formatEventTime } from '../../utils/helpers.js';
import { countdownLabel } from '../../utils/groups.js';

// one event in community with its groups in a sideways carousel, so many groups don't become
// one long list. shows a countdown and everyone going; people going to the event can start
// another group for it.

const props = defineProps({
  event: {
    type: Object,
    default: null
  },
  groups: {
    type: Array,
    required: true
  },
  canStart: Boolean
});

const emit = defineEmits(['changed', 'start']);

const category = computed(() => props.event?.category || '');

const startTime = computed(() => props.event?.startTime || props.groups[0]?.startTime);

const countdown = computed(() => countdownLabel(startTime.value));

const soon = computed(() => new Date(startTime.value) - Date.now() < 36 * 3600e3);
// everyone going with a group, without repeats (hosts first)

const people = computed(() => {
  const seen = new Map();
  for (const g of props.groups) for (const p of [g.host, ...g.members]) if (!seen.has(p.id)) seen.set(p.id, p);
  return [...seen.values()];
});

const initials = (name = '') => name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
</script>

<template>
  <section class="event-groups-card" :aria-labelledby="`event-groups-${event?.id || groups[0].id}`">
    <header class="egc-head">
      <RouterLink
      v-if="event"
      :to="`/events/${event.id}/rsvp`"
      class="egc-art cat-tint"
      :class="`cat-${category}`"
      aria-hidden="true"
      tabindex="-1">
      <EventArtwork :category="category" /></RouterLink>
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
          <span
          v-for="person in people.slice(0, 4)"
          :key="person.id"
          class="egc-mini"
          :title="person.name">{{ initials(person.name) }}</span>
          <span v-if="people.length > 4" class="egc-mini egc-more">+{{ people.length - 4 }}</span>
        </span>
        <span class="text-caption text-secondary">{{ people.length }} going</span>
      </div>
    </header>
    <TransitionGroup
    tag="div"
    name="list-fade"
    class="egc-groups"
    :aria-label="`Groups going to ${event?.title || 'this event'}`"
    role="list">
      <div
      v-for="group in groups"
      :key="group.id"
      class="egc-slide"
      role="listitem">
      <GroupCard :group="group" compact @changed="emit('changed')" /></div>
    </TransitionGroup>
    <button
    v-if="event && canStart"
    type="button"
    class="egc-start"
    @click="emit('start', event.id)">+ Start another group for this event</button>
    <p v-else-if="event" class="egc-hint text-caption text-secondary m-0">Joining a group RSVPs you to {{ event.title }} too.</p>
  </section>
</template>

<style scoped>
.event-groups-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 2px solid var(--dino-ink);
  border-radius: 24px;
  background: var(--dino-surface);
  box-shadow: 6px 6px 0 var(--dino-teal);
}

:root[data-theme="dark"] .event-groups-card {
  border-color: var(--dino-border);
  box-shadow: 6px 6px 0 var(--db-dark-teal);
}

.egc-head {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
}

.egc-art {
  display: block;
  width: 64px;
  height: 64px;
  overflow: hidden;
  border-radius: 16px;
}

.egc-art :deep(svg) {
  width: 100%;
  height: 100%;
}

.egc-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.egc-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.egc-countdown {
  padding: 2px 10px;
  border-radius: 99px;
  background: var(--dino-mango-soft);
  color: var(--dino-ink);
  font-size: .74rem;
  font-weight: 800;
}

.egc-countdown.is-soon {
  background: var(--dino-fill);
  color: var(--dino-on-fill);
}

.egc-title {
  margin: 0;
  font: 900 1.2rem/1.25 var(--dino-heading);
  overflow-wrap: anywhere;
}

.egc-title a {
  color: inherit;
  text-decoration: none;
}

.egc-title a:hover {
  text-decoration: underline;
}

.egc-people {
  display: grid;
  justify-items: end;
  gap: 4px;
}

.egc-stack {
  display: inline-flex;
}

.egc-mini {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 2px solid var(--dino-surface);
  border-radius: 50%;
  background: var(--dino-orange-soft);
  color: var(--dino-primary-dark);
  font-size: .68rem;
  font-weight: 800;
}

.egc-mini + .egc-mini {
  margin-left: -9px;
}

.egc-more {
  background: var(--dino-ink);
  color: var(--dino-surface);
}

/* a scroll row clips what grows past its edge, so leave room for the hover lift, tilt and larger shadow */

.egc-groups {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 10px 14px 18px 8px;
  scroll-padding-inline: 8px;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
}

.egc-slide {
  flex: 0 0 min(340px, 84%);
  scroll-snap-align: start;
  display: flex;
}

.egc-slide > :deep(.group-card) {
  width: 100%;
}

.egc-groups:has(> .egc-slide:only-child) .egc-slide {
  flex-basis: 100%;
}

.egc-start {
  justify-self: start;
  min-height: 40px;
  padding: 6px 14px;
  border: 2px dashed var(--dino-control-border);
  border-radius: 99px;
  background: transparent;
  color: var(--dino-primary-dark);
  font-weight: 700;
  font-size: .88rem;
}

.egc-start:hover {
  border-color: var(--dino-fill);
  background: var(--dino-orange-soft);
}

/* phones and tablets (md and below): a tighter card so more fits on the screen; buttons stay at
   least 40px tall, and each group card is only as tall as its own content (no empty space beside a
   taller one). from 576px it grows a little, and an event's groups sit two across */
@media (max-width: 991.98px) {
  .event-groups-card {
    gap: 10px;
    padding: 12px;
    border-radius: 20px;
    box-shadow: 4px 4px 0 var(--dino-teal);
  }
  :root[data-theme="dark"] .event-groups-card {
    box-shadow: 4px 4px 0 var(--db-dark-teal);
  }
  .egc-head {
    grid-template-columns: 44px minmax(0, 1fr);
    gap: 10px;
  }
  .egc-art {
    width: 44px;
    height: 44px;
    border-radius: 12px;
  }
  .egc-title {
    font-size: 1.05rem;
  }
  .egc-people {
    grid-column: 1 / -1;
    justify-items: start;
    grid-auto-flow: column;
    justify-content: start;
    align-items: center;
    gap: 8px;
  }
  .egc-mini {
    width: 24px;
    height: 24px;
    font-size: .6rem;
  }
  .egc-groups {
    align-items: flex-start;
    gap: 10px;
    padding: 6px 8px 12px 4px;
  }
  .egc-slide {
    flex-basis: 88%;
  }
}

@media (min-width: 576px) and (max-width: 991.98px) {
  .egc-head {
    grid-template-columns: 52px minmax(0, 1fr);
  }
  .egc-art {
    width: 52px;
    height: 52px;
  }
  .egc-title {
    font-size: 1.15rem;
  }
  .egc-slide {
    flex-basis: calc(50% - 5px);
  }
}
</style>
