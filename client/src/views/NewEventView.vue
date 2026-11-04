<script setup>
import { useRoute, useRouter } from 'vue-router'
import CreateEventView from './CreateEventView.vue'

// Create event makes official events only. Hangouts and open jios live in Community,
// so old ?template=hangout links are sent to Community's hangout planner.
const route = useRoute()
const router = useRouter()
if (route.query.template === 'hangout') router.replace('/community/plan')
</script>

<template>
  <CreateEventView />
</template>
