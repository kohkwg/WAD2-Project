<script setup>
import { ref, watch } from 'vue';

// shows a value and gives it a small nudge when it changes (never on first render).


const props = defineProps({
  value: {
    type: [Number, String],
    default: ''
  }
});

// A new key creates a new span, so the CSS animation starts again.
const bump = ref(0);

watch(() => props.value, (next, previous) => {
  if (previous !== undefined && next !== previous) bump.value++;
});
</script>

<template>
  <span :key="bump" :class="{ 'value-bump': bump > 0 }">{{ value }}</span>
</template>
