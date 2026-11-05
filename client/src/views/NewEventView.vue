<script setup>
import { useRoute, useRouter } from 'vue-router'
import CreateEventView from './CreateEventView.vue'

// Create event makes official events only. Going with others happens in Community
// (Go together groups), so old ?template=hangout links are sent there.
const route = useRoute()
const router = useRouter()
if (route.query.template === 'hangout') router.replace('/community')
</script>

<template>
  <CreateEventView />
</template>
