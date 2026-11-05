<script setup>
import { computed } from 'vue'

// On the organiser's RSVP lists: this person is coming with a Go together group. Just an
// indicator; approving and removing work the same as for anyone else.
const props = defineProps({ group: { type: Object, default: null } })
const label = computed(() => {
  const g = props.group
  if (!g) return ''
  if (g.isHost) return `Hosting a group of ${g.groupSize}`
  return g.hostName ? `With ${g.hostName}’s group · ${g.groupSize}` : `In a friends-only group · ${g.groupSize}`
})
</script>

<template>
  <span v-if="group" class="group-chip" :title="`Coming with a Go together group (${group.groupSize} people)`">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2c-2.7 0-6 1.3-6 4v2h12v-2c0-2.7-3.3-4-6-4Zm8 0c-.4 0-.8 0-1.3.1A4.6 4.6 0 0 1 16 17v2h6v-2c0-2.7-3.3-4-6-4Z" /></svg>
    {{ label }}
  </span>
</template>

<style scoped>
.group-chip { display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; padding: 1px 8px; border: 1.5px solid var(--bookedz-teal); border-radius: 99px; background: var(--bookedz-teal-soft); color: var(--bookedz-teal-ink); font-size: .74rem; font-weight: 700; white-space: nowrap; }
.group-chip svg { width: 13px; height: 13px; fill: currentColor; }
</style>
