<script setup>
import { useRoute, useRouter } from 'vue-router';
import CreateEventView from './CreateEventView.vue';

// create event makes official events only. going with others happens in community
// (go together groups), so old ?template=hangout links are sent there.

const route = useRoute();

const router = useRouter();
if (route.query.template === 'hangout') router.replace('/community');
</script>

<template>
  <CreateEventView />
</template>
