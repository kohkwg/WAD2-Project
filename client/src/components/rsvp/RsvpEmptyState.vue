<script setup>
import { RouterLink } from 'vue-router'
defineProps({ section: String })
const messages = {
  upcoming: ['Your next plan is waiting.', 'You have no upcoming RSVPs. Find something you would love to join.'],
  saved: ['A little space for future plans.', 'Save events while exploring Discover and find them here.'],
  past: ['Your event memories start here.', 'Events appear here after they have ended.'],
  cancelled: ['No cancelled or closed RSVPs.', 'Cancelled registrations and closed offers will appear here.'],
}
</script>
<template><div class="rsvp-empty"><span aria-hidden="true">✦</span><h3 class="event-title">{{ messages[section]?.[0] }}</h3><p>{{ messages[section]?.[1] }}</p><RouterLink v-if="['upcoming', 'saved'].includes(section)" to="/discover" class="btn event-cta">Find events</RouterLink></div></template>
<style scoped>
.rsvp-empty{text-align:center;padding:48px 20px;border:1px dashed var(--bookedz-border);border-radius:22px;background:var(--bookedz-surface)}.rsvp-empty>span{font-size:2.2rem;color:var(--bookedz-primary-dark)}h3{ margin:16px 0 10px; }p{font-size:var(--text-body);color:var(--bookedz-muted);max-width:360px;margin:0 auto 20px}.btn{min-height:44px}
</style>
