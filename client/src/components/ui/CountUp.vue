<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';

// animate number changes unless reduced motion is preferred
// show non-numeric values straight away


const props = defineProps({
  value: {
    type: [Number, String],
    default: 0
  },
  duration: {
    type: Number,
    default: 600
  }
});

const shown = ref(props.value);

let frame = 0;

const reduced = () => typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animate(from, to) {
  cancelAnimationFrame(frame);
  const start = Number(from),
    end = Number(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end || reduced()) {
    shown.value = to;
    return;
  }
  const began = performance.now();
  const step = now => {
    const t = Math.min(1, (now - began) / props.duration);
    const eased = 1 - Math.pow(1 - t, 3);
    shown.value = Math.round(start + (end - start) * eased);
    if (t < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}

onMounted(() => {
  if (Number(props.value) > 0) animate(0, props.value);
});

watch(() => props.value, (next, previous) => animate(previous, next));

onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
  <span class="count-up">{{ shown }}</span>
</template>

<style scoped>
.count-up {
  font-variant-numeric: tabular-nums;
}
</style>
