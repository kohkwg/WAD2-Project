<script setup>
import { formatEventTime } from '../utils/helpers.js'

// clashes: events you've already joined that overlap this one
defineProps({
  clashes: Array,
})
</script>

<template>
  <div v-if="clashes.length > 0" class="alert alert-warning">
    <div class="fw-semibold mb-1">This overlaps with an event you've already joined:</div>
    <ul class="mb-1">
      <li v-for="event in clashes" :key="event.id">
        {{ event.title }} <span class="small">({{ formatEventTime(event) }})</span>
      </li>
    </ul>
    <div class="small">You can still RSVP. This is just a heads up.</div>
  </div>
</template>
