<script setup>
import { computed } from 'vue'

// steps: ['Basics', 'Venue', ...]   current: which step we're on, starting from 1
const props = defineProps({
  steps: Array,
  current: Number,
})

const percentDone = computed(() => ((props.current - 1) / (props.steps.length - 1)) * 100)

// Done steps are green, the current one is blue, later ones are grey
function badgeClass(stepNumber) {
  if (stepNumber < props.current) return 'text-bg-success'
  if (stepNumber === props.current) return 'text-bg-primary'
  return 'text-bg-light border'
}
</script>

<template>
  <div class="mb-4">
    <ol class="list-unstyled d-flex flex-wrap gap-3 mb-2">
      <li v-for="(label, index) in steps" :key="label" class="d-flex align-items-center">
        <span class="badge rounded-pill me-2" :class="badgeClass(index + 1)">{{ index + 1 }}</span>
        <span :class="index + 1 === current ? 'fw-semibold' : 'text-secondary'">{{ label }}</span>
      </li>
    </ol>
    <div class="progress" style="height: 6px">
      <div class="progress-bar" :style="{ width: percentDone + '%' }"></div>
    </div>
  </div>
</template>
