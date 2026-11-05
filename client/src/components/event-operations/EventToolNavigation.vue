<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

const props = defineProps({
  groups: {
    type: Array,
    required: true
  },
  activeTab: {
    type: String,
    required: true
  }
});

const route = useRoute();

const nav = ref(null);

const openGroup = ref('');

let hoverOpened = '';

let closeTimer;
// open menus on hover only when a mouse is being used


function hover(event, id) {
  if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  clearTimeout(closeTimer);
  if (openGroup.value !== id) {
    openGroup.value = id;
    hoverOpened = id;
  }
}

function exitHover(event, id) {
  if (event.pointerType !== 'mouse') return;
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    const links = nav.value?.querySelector(`#event-tools-${id}-links`);
    if (openGroup.value === id && !links?.contains(document.activeElement)) close();
  }, 180);
}

function activate(id, event) {
  clearTimeout(closeTimer);
  if (event.detail > 0 && hoverOpened === id && openGroup.value === id) {
    hoverOpened = '';
    return;
  }
  hoverOpened = '';
  toggle(id);
}

const current = group => group.tabs.find(tab => tab.id === props.activeTab);

function trigger(id) {
  return nav.value?.querySelector(`#event-tools-${id}`);
}

async function toggle(id, focus = '') {
  openGroup.value = openGroup.value === id && !focus ? '' : id;
  if (focus) {
    await nextTick();
    const links = nav.value?.querySelectorAll(`#event-tools-${id}-links a`);
    links?.[focus === 'last' ? links.length - 1 : 0]?.focus();
  }
}

function close(restore = false) {
  clearTimeout(closeTimer);
  hoverOpened = '';
  const id = openGroup.value;
  openGroup.value = '';
  if (restore) trigger(id)?.focus({
    preventScroll: true
  });
}

function outside(event) {
  if (!nav.value?.contains(event.target)) close();
}

function leave(event) {
  if (!nav.value?.contains(event.relatedTarget)) close();
}
// let the keyboard move between links and close the menu


function keydown(event, id) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close(true);
    return;
  }
  const links = [...(nav.value?.querySelectorAll(`#event-tools-${id}-links a`) || [])];
  const index = links.indexOf(event.target);
  if (index < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
  links[next]?.focus();
}

onMounted(() => document.addEventListener('pointerdown', outside));

onBeforeUnmount(() => {
  clearTimeout(closeTimer);
  document.removeEventListener('pointerdown', outside);
});

watch(() => route.fullPath, () => close(Boolean(nav.value?.contains(document.activeElement))));
</script>

<template>
  <nav ref="nav" class="event-tool-groups mb-4" aria-label="Event tools" @focusout="leave">
    <div v-for="group in groups"
      :key="group.id"
      class="tool-group"
      @keydown="keydown($event, group.id)"
      @pointerenter="hover($event, group.id)"
      @pointerleave="exitHover($event, group.id)">
      <button
        :id="`event-tools-${group.id}`"
        type="button"
        class="tool-group-trigger"
        :class="{ active: current(group) }"
        :aria-expanded="openGroup === group.id"
        :aria-controls="`event-tools-${group.id}-links`"
        @click="activate(group.id, $event)"
        @keydown.down.prevent="toggle(group.id, 'first')"
        @keydown.up.prevent="toggle(group.id, 'last')">
        <span>
        <strong>{{ group.label }}</strong>
        <span class="tool-group-caption">{{ current(group)?.label || group.hint }}</span></span>
        <span class="tool-chevron" aria-hidden="true">⌄</span>
      </button>
      <div v-if="openGroup === group.id" :id="`event-tools-${group.id}-links`" class="tool-group-links">
        <RouterLink
        v-for="tab in group.tabs"
        :key="tab.id"
        :to="{ path: route.path, query: { ...route.query, tab: tab.id }, hash: route.hash }"
        :aria-label="tab.label"
        :aria-current="activeTab === tab.id ? 'page' : undefined"
        @click="close(true)">
        <strong>{{ tab.label }}</strong>
        <span>{{ tab.hint }}</span></RouterLink>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.event-tool-groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: .5rem;
  padding: .45rem;
  border: 1px solid var(--bookedz-border);
  border-radius: 1rem;
  background: var(--bookedz-glass-solid);
  position: sticky;
  top: var(--topbar-h, 0px);
  z-index: 20;
}

.tool-group {
  position: relative;
  min-width: 0;
}

.tool-group-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .5rem;
  width: 100%;
  min-height: 62px;
  padding: .65rem .8rem;
  border: 1px solid transparent;
  border-radius: .75rem;
  background: transparent;
  color: var(--bookedz-muted);
  text-align: left;
}

.tool-group-trigger strong {
  display: block;
  font-size: .95rem;
}

.tool-group-caption {
  display: block;
  font-size: .78rem;
  color: var(--bookedz-muted);
  overflow-wrap: anywhere;
}

.tool-group-trigger.active {
  border-color: var(--bookedz-border);
  background: var(--bookedz-surface);
  box-shadow: var(--bookedz-tab-shadow);
  color: var(--bookedz-primary-dark);
}

.tool-group-trigger:hover, .tool-group-links a:hover {
  background: var(--bookedz-glass-hover);
}

.tool-chevron {
  font-size: 1.25rem;
}

.tool-group-links {
  position: absolute;
  inset: calc(100% + .5rem) 0 auto;
  min-width: 0;
  padding: .35rem;
  border: 1px solid var(--bookedz-border);
  border-radius: .85rem;
  background: var(--bookedz-surface);
  box-shadow: var(--bookedz-card-shadow);
}

.tool-group-links a {
  display: grid;
  align-content: center;
  gap: .1rem;
  min-height: 52px;
  padding: .55rem .7rem;
  border-radius: .6rem;
  text-decoration: none;
  color: var(--bookedz-ink);
  overflow-wrap: anywhere;
}

.tool-group-links a strong {
  font-size: .85rem;
}

.tool-group-links a span {
  font-size: .75rem;
  color: var(--bookedz-muted);
}

.tool-group-links a[aria-current="page"] {
  background: var(--bookedz-glass-active);
  color: var(--bookedz-primary-dark);
}

@media (max-width: 575.98px) {
  .event-tool-groups {
    grid-template-columns: 1fr;
  }
  .tool-group-links {
    position: static;
    margin-top: .35rem;
    box-shadow: none;
  }
}
</style>
