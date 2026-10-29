<script setup>
defineProps({ saved: Boolean, pending: Boolean, eventTitle: { type: String, default: 'event' } })
const emit = defineEmits(['toggle'])
</script>
<template>
  <button type="button" class="event-bookmark" :disabled="pending"
    :aria-pressed="saved" :aria-label="(saved ? 'Unsave ' : 'Save ') + eventTitle"
    @click="emit('toggle')">
    <svg viewBox="0 0 24 24" :fill="saved ? 'currentColor' : 'none'"
      stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 3h12v18l-6-4-6 4V3Z" />
    </svg>
    <span class="bookmark-tooltip">{{ saved ? 'Remove bookmark' : 'Bookmark event' }}</span>
  </button>
</template>
<style scoped>
.event-bookmark { position:absolute; top:12px; right:12px; z-index:3; width:38px; height:38px; padding:9px; display:grid; place-items:center; border:1px solid var(--bookedz-control-border); border-radius:50%; background:var(--bookedz-surface); color:var(--bookedz-ink); cursor:pointer; }
.event-bookmark[aria-pressed="true"] { color:var(--bookedz-primary-dark); }
.event-bookmark svg { position:static; width:19px; height:19px; }
.bookmark-tooltip { position:absolute; top:calc(100% + 6px); right:0; padding:5px 8px; border-radius:4px; background:var(--bookedz-ink); color:var(--bookedz-surface); font-size:12px; white-space:nowrap; visibility:hidden; }
.event-bookmark:hover .bookmark-tooltip,.event-bookmark:focus-visible .bookmark-tooltip { visibility:visible; }
.event-bookmark:disabled { opacity:.6; cursor:wait; }
.event-bookmark:focus-visible { outline:2px solid var(--bookedz-primary-dark); outline-offset:3px; }
</style>
