<script setup>
import { computed, onMounted, ref, useId, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { getGroups, getMyRsvps } from '../../utils/api.js';
import ShowHideButton from '../ui/ShowHideButton.vue';

// on an event page: go together groups for this event, and (for people who rsvp'd) a way to
// start one. joining a group rsvps you to the event too.

const props = defineProps({
  eventId: {
    type: String,
    required: true
  }
});

const groups = ref([]);

const loaded = ref(false);

const going = ref(false); // you have an rsvp for this event, so you can start a group

async function load() {
  try {
    groups.value = (await getGroups()).filter(group => group.event?.id === props.eventId);
  } catch {
    groups.value = [];
  }
  try {
    going.value = (await getMyRsvps()).some(r => r.eventId === props.eventId && ['confirmed', 'pending', 'waitlisted', 'offered'].includes(r.status));
  } catch {
    going.value = false;
  }
  loaded.value = true;
}
// the group list starts folded away to keep the event page short; the heading stays visible

const open = ref(false);

const bodyId = useId();

onMounted(load);

watch(() => props.eventId, () => {
  open.value = false;
  load();
});

const openSpots = computed(() => groups.value.filter(group => group.spotsLeft > 0));
</script>

<template>
  <section v-if="loaded" class="event-groups card" aria-labelledby="event-groups-title">
    <div class="card-body">
      <div class="event-groups-head">
        <h2 id="event-groups-title" class="h5 m-0">Go together</h2>
        <div class="event-groups-actions">
          <RouterLink
          v-if="going"
          :to="{ path: '/community', query: { start: eventId } }"
          class="btn btn-outline-secondary btn-sm">Start a group</RouterLink>
          <ShowHideButton v-model="open" :controls="bodyId" label="groups" :count="groups.length" />
        </div>
      </div>
      <div :id="bodyId" v-show="open">
      <p v-if="!groups.length" class="text-meta text-secondary mb-0 mt-2">{{ going ? 'No groups for this event yet. Start one and others can join you.' : 'No groups for this event yet. RSVP, then you can start one.' }}</p>
      <ul v-else class="list-unstyled m-0 mt-3 stagger-in">
        <li v-for="group in groups" :key="group.id">
          <RouterLink :to="`/groups/${group.id}`" class="event-group lift-on-hover">
            <strong>{{ group.myStatus === 'host' ? 'Your group' : `${group.host.name}’s group` }}</strong>
            <span v-if="group.visibility === 'private'" class="text-caption text-secondary">Friends only</span>
            <span class="text-meta text-secondary">{{ group.members.length + 1 }} going · {{ group.spotsLeft > 0 ? `${group.spotsLeft} ${group.spotsLeft === 1 ? 'spot' : 'spots'} left` : 'Full' }}</span>
            <span v-if="group.note" class="event-group-note">{{ group.note }}</span>
          </RouterLink>
        </li>
      </ul>
      <p v-if="openSpots.length" class="text-caption text-secondary mb-0 mt-2">Joining a group RSVPs you to the event too.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.event-groups {
  margin-top: 1rem;
}

.event-groups-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.event-groups-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.event-groups-head .btn {
  min-height: 44px;
}

.event-groups ul {
  display: grid;
  gap: 8px;
}

.event-group {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--bookedz-border);
  border-radius: 12px;
  color: var(--bookedz-ink);
  text-decoration: none;
}

.event-group:hover {
  color: var(--bookedz-ink);
  border-color: var(--bookedz-control-border);
}

.event-group-note {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: .9rem;
}
</style>
