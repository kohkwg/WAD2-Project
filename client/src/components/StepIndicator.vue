<script setup>
import { computed } from 'vue'

// steps: ['Basics', 'Venue', ...]   current: which step we're on, starting from 1
const props = defineProps({
  steps: Array,
  current: Number,
})

const percentDone = computed(() => ((props.current - 1) / (props.steps.length - 1)) * 100)

</script>

<template>
  <div class="creation-steps mb-4" :style="{ '--step-progress': percentDone / 100 }">
    <ol class="list-unstyled mb-3" :aria-label="'Step ' + current + ' of ' + steps.length">
      <li v-for="(label, index) in steps" :key="label" class="step-item" :class="{ 'is-current': index + 1 === current, 'is-complete': index + 1 < current }" :aria-current="index + 1 === current ? 'step' : undefined">
        <span class="step-number" aria-hidden="true">{{ index + 1 < current ? '✓' : index + 1 }}</span>
        <span class="step-label">{{ label }}</span>
      </li>
    </ol>
    <div class="progress-track" role="progressbar" :aria-label="'Creation step: ' + current + ' of ' + steps.length" :aria-valuenow="current" :aria-valuemin="1" :aria-valuemax="steps.length">
      <div class="progress-fill"></div>
    </div>
  </div>
</template>

<style scoped>
.creation-steps { padding: 1rem 1.1rem .8rem; border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-surface); }
.creation-steps ol { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .6rem; }
.step-item { display: flex; min-width: 0; align-items: center; gap: .55rem; color: var(--bookedz-muted); }
.step-number { display: grid; flex: 0 0 1.8rem; width: 1.8rem; height: 1.8rem; place-items: center; border: 1px solid var(--bookedz-border); border-radius: 50%; background: var(--bookedz-canvas); color: var(--bookedz-muted); font-size: .78rem; font-weight: 650; transition: color .18s ease, background-color .18s ease, border-color .18s ease, transform .18s ease; }
.step-label { min-width: 0; font-size: .84rem; line-height: 1.2; }
.step-item.is-current { color: var(--bookedz-ink); font-weight: 650; }
.step-item.is-current .step-number { transform: scale(1.08); border-color: var(--bookedz-primary-dark); background: var(--bookedz-primary-dark); color: var(--bookedz-surface); }
.step-item.is-complete .step-number { border-color: var(--bookedz-success); background: var(--bookedz-success); color: var(--bookedz-surface); }
.progress-track { height: .3rem; overflow: hidden; border-radius: 99px; background: var(--bookedz-glass-active); }
.progress-fill { width: 100%; height: 100%; transform: scaleX(var(--step-progress)); transform-origin: left; border-radius: inherit; background: var(--bookedz-primary-dark); transition: transform .35s cubic-bezier(.2,.7,.2,1); }
@media (max-width: 575.98px) { .creation-steps { padding: .85rem; } .creation-steps ol { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: .85rem; } }
@media (prefers-reduced-motion: reduce) { .step-number, .progress-fill { transition: none; } }
</style>
