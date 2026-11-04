<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getGroups, GROUPS_AVAILABLE } from '../../utils/api.js'

// On an event page: Go together groups for this event (public ones and any you're in), and a way to start one.
const props = defineProps({ eventId: { type: String, required: true } })
const groups = ref([])
const loaded = ref(false)
async function load() {
  if (!GROUPS_AVAILABLE) return
  try { groups.value = (await getGroups()).filter((group) => group.event?.id === props.eventId) } catch { groups.value = [] }
  loaded.value = true
}
onMounted(load)
watch(() => props.eventId, load)
const openSpots = computed(() => groups.value.filter((group) => group.spotsLeft > 0))
</script>

<template>
  <section v-if="GROUPS_AVAILABLE && loaded" class="event-groups card" aria-labelledby="event-groups-title">
    <div class="card-body">
      <div class="event-groups-head">
        <h2 id="event-groups-title" class="h5 m-0">Go together</h2>
        <RouterLink :to="{ path: '/community', query: { start: eventId } }" class="btn btn-outline-secondary btn-sm">Start a group</RouterLink>
      </div>
      <p v-if="!groups.length" class="text-meta text-secondary mb-0 mt-2">No groups for this event yet. Start one and others can join you.</p>
      <ul v-else class="list-unstyled m-0 mt-3 stagger-in">
        <li v-for="group in groups" :key="group.id">
          <RouterLink :to="`/groups/${group.id}`" class="event-group lift-on-hover">
            <strong>{{ group.myStatus === 'host' ? 'Your group' : `${group.host.name}’s group` }}</strong><span v-if="group.visibility === 'private'" class="text-caption text-secondary">Private · you’re in it</span>
            <span class="text-meta text-secondary">{{ group.members.length + 1 }} going · {{ group.spotsLeft > 0 ? `${group.spotsLeft} ${group.spotsLeft === 1 ? 'spot' : 'spots'} left` : 'Full' }}</span>
            <span v-if="group.note" class="event-group-note">{{ group.note }}</span>
          </RouterLink>
        </li>
      </ul>
      <p v-if="openSpots.length" class="text-caption text-secondary mb-0 mt-2">Joining a group doesn’t RSVP you to the event; you’ll be reminded to do both.</p>
    </div>
  </section>
</template>

<style scoped>
.event-groups { margin-top: 1rem; }
.event-groups-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.event-groups-head .btn { min-height: 40px; }
.event-groups ul { display: grid; gap: 8px; }
.event-group { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--bookedz-border); border-radius: 12px; color: var(--bookedz-ink); text-decoration: none; }
.event-group:hover { color: var(--bookedz-ink); border-color: var(--bookedz-control-border); }
.event-group-note { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: .9rem; }
</style>
