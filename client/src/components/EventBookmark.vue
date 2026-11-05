<script setup>
import { ref, watch } from 'vue'
const props = defineProps({ saved: Boolean, pending: Boolean, eventTitle: { type: String, default: 'event' } })
const emit = defineEmits(['toggle'])
// Pops once when an event becomes saved (not on first render)
const popKey = ref(0)
watch(() => props.saved, (now, before) => { if (now && !before) popKey.value++ })
</script>
<template>
  <button type="button" class="event-bookmark" :disabled="pending"
    :aria-pressed="saved" :aria-label="saved ? `Remove ${eventTitle} from saved` : `Save ${eventTitle}`"
    @click="emit('toggle')">
    <svg :key="popKey" :class="{ 'pop-once': popKey > 0 && saved }" viewBox="0 0 24 24" :fill="saved ? 'currentColor' : 'none'"
      stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 3h12v18l-6-4-6 4V3Z" />
    </svg>
    <span class="bookmark-hint" aria-hidden="true">{{ saved ? 'Saved' : 'Save' }}</span>
  </button>
</template>
<style scoped>
.event-bookmark { transition:color var(--bookedz-motion-fast) var(--bookedz-ease), border-color var(--bookedz-motion-fast) var(--bookedz-ease); }
.event-bookmark { position:absolute; top:12px; right:12px; z-index:3; width:44px; height:44px; padding:9px; display:grid; place-items:center; border:1px solid var(--bookedz-control-border); border-radius:50%; background:var(--bookedz-surface); color:var(--bookedz-ink); cursor:pointer; }
.event-bookmark[aria-pressed="true"] { color:var(--bookedz-primary-dark); }
.event-bookmark svg { position:static; width:19px; height:19px; }
.event-bookmark:disabled { opacity:.6; cursor:wait; }
/* Hover or keyboard focus slides a "Save" / "Saved" pill out to the left, as if the round button
   grows; it sits behind the icon inside the button, so it needs no positioning outside it.
   Touch screens skip it (a tap saves straight away). */
.event-bookmark { isolation:isolate; }
.bookmark-hint { position:absolute; z-index:-1; top:-1px; right:-1px; display:flex; align-items:center; height:calc(100% + 2px); padding:0 46px 0 15px; border:1px solid var(--bookedz-primary-dark); border-radius:99px; background:var(--bookedz-surface); color:var(--bookedz-primary-dark); font-size:13px; font-weight:700; white-space:nowrap; opacity:0; transform:translateX(12px); pointer-events:none; transition:opacity var(--bookedz-motion-fast) var(--bookedz-ease), transform var(--bookedz-motion-normal) var(--bookedz-ease); }
.event-bookmark:focus-visible .bookmark-hint { opacity:1; transform:none; }
.event-bookmark:focus-visible { color:var(--bookedz-primary-dark); }
@media (hover:hover) {
  .event-bookmark:not(:disabled):hover { color:var(--bookedz-primary-dark); border-color:var(--bookedz-primary-dark); }
  .event-bookmark:not(:disabled):hover .bookmark-hint { opacity:1; transform:none; }
}
@media (prefers-reduced-motion:reduce) { .bookmark-hint { transform:none; transition:none; } }
.event-bookmark:focus-visible { outline:2px solid var(--bookedz-primary-dark); outline-offset:3px; }
</style>
