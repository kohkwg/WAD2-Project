<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getJios, JIOS_AVAILABLE } from '../../utils/api.js'

// On an event page: open jios for this event, and a way to start one.
const props = defineProps({ eventId: { type: String, required: true } })
const jios = ref([])
const loaded = ref(false)
async function load() {
  if (!JIOS_AVAILABLE) return
  try { jios.value = (await getJios()).filter((jio) => jio.event?.id === props.eventId) } catch { jios.value = [] }
  loaded.value = true
}
onMounted(load)
watch(() => props.eventId, load)
const openSpots = computed(() => jios.value.filter((jio) => jio.spotsLeft > 0))
</script>

<template>
  <section v-if="JIOS_AVAILABLE && loaded" class="event-jios card" aria-labelledby="event-jios-title">
    <div class="card-body">
      <div class="event-jios-head">
        <h2 id="event-jios-title" class="h5 m-0">Go with others</h2>
        <RouterLink :to="{ path: '/community', query: { start: eventId } }" class="btn btn-outline-secondary btn-sm">Start a jio</RouterLink>
      </div>
      <p v-if="!jios.length" class="text-meta text-secondary mb-0 mt-2">No open jios for this event yet. Start one and others can join you.</p>
      <ul v-else class="list-unstyled m-0 mt-3 stagger-in">
        <li v-for="jio in jios" :key="jio.id">
          <RouterLink :to="{ path: '/community', query: { jio: jio.id } }" class="event-jio lift-on-hover">
            <strong>{{ jio.myStatus === 'host' ? 'Your jio' : `${jio.host.name}’s jio` }}</strong>
            <span class="text-meta text-secondary">{{ jio.members.length + 1 }} going · {{ jio.spotsLeft > 0 ? `${jio.spotsLeft} ${jio.spotsLeft === 1 ? 'spot' : 'spots'} left` : 'Full' }}</span>
            <span v-if="jio.note" class="event-jio-note">{{ jio.note }}</span>
          </RouterLink>
        </li>
      </ul>
      <p v-if="openSpots.length" class="text-caption text-secondary mb-0 mt-2">Joining a jio doesn’t RSVP you to the event; you’ll be reminded to do both.</p>
    </div>
  </section>
</template>

<style scoped>
.event-jios { margin-top: 1rem; }
.event-jios-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.event-jios-head .btn { min-height: 40px; }
.event-jios ul { display: grid; gap: 8px; }
.event-jio { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--bookedz-border); border-radius: 12px; color: var(--bookedz-ink); text-decoration: none; }
.event-jio:hover { color: var(--bookedz-ink); border-color: var(--bookedz-control-border); }
.event-jio-note { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: .9rem; }
</style>
