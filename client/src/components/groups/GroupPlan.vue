<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import GroupMap from './GroupMap.vue';
import AvailabilityPainter from './AvailabilityPainter.vue';
import BumpValue from '../ui/BumpValue.vue';
import { getFoodNearby, suggestGroupStop, voteGroupStop, chooseGroupStop, removeGroupStop, setGroupAvailability } from '../../utils/api.js';
import { SLOTS, SUGGESTION_NAME_LIMIT } from '../../utils/groups.js';
import { toast } from '../../composables/useToast';
import { searchPlaces } from '../../lib/onemap.js';

// before / after the event: members paint when they're free each side of it, when2meet
// style (the slot is the longest stretch with the most people free), suggest a nearby place, mark the ones
// they're keen on, and the host picks one.

const props = defineProps({
  group: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['update:plan']);

const isHost = computed(() => props.group.myStatus === 'host');

const plan = computed(() => props.group.plan);

const venue = computed(() => props.group.event?.venue);

const hasMap = computed(() => Number.isFinite(venue.value?.lat) && Number.isFinite(venue.value?.lng));

const busy = ref('');

const error = ref('');

const openSlot = ref(''); // which slot's "add an idea" panel is open

const food = reactive({
  before: null,
  after: null
}); // { loading, error, places, status, at }

const customName = ref('');

const time = iso => new Intl.DateTimeFormat('en-SG', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Singapore'
}).format(new Date(iso));

const slotTitle = slot => `${plan.value[slot].label} ${slot}`;

const slotWhen = slot => `${time(plan.value[slot].start)} – ${time(plan.value[slot].end)}`;

const chosen = slot => plan.value[slot].suggestions.find(s => s.id === plan.value[slot].chosenId) || null;

const distance = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;

// Use a walking speed of 80 metres each minute.
const walk = m => `${Math.max(1, Math.round(m / 80))} min walk`;

const mapSpots = computed(() => SLOTS.flatMap(slot => plan.value[slot].suggestions.map(s => ({
  ...s,
  chosen: s.id === plan.value[slot].chosenId,
  label: `${slotTitle(slot)} · ${s.votes} keen`
}))));

/**
 * Run one plan change. Send the new plan to the parent, or show the error.
 * @param {string} key The busy key, which disables the matching button.
 * @param {Function} fn The function that does the change and returns the new plan.
 * @param {string} [message] The toast text to show after a successful change.
 */
async function act(key, fn, message) {
  busy.value = key;
  error.value = '';
  try {
    emit('update:plan', await fn());
    if (message) toast(message);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = '';
  }
}

const vote = (slot, s) => act(`vote-${s.id}`, () => voteGroupStop(props.group.id, slot, s.id, !s.myVote));

const choose = (slot, s) => act(`pick-${s.id}`, () => chooseGroupStop(props.group.id, slot, s && s.id !== plan.value[slot].chosenId ? s.id : null), s && s.id !== plan.value[slot].chosenId ? `${s.name} is the plan for ${plan.value[slot].label.toLowerCase()}` : 'Pick cleared');

const firstName = p => p.me ? 'You' : p.name.split(/\s+/)[0];

const names = list => list.map(firstName).join(', ');

const saveAvailability = (slot, cells) => act(`avail-${slot}`, () => setGroupAvailability(props.group.id, slot, cells));

const remove = (slot, s) => act(`remove-${s.id}`, () => removeGroupStop(props.group.id, slot, s.id), 'Idea removed');

async function suggest(slot, item) {
  await act(`add-${item.id || 'custom'}`, () => suggestGroupStop(props.group.id, slot, item), 'Idea added');
  if (!error.value) {
    customName.value = '';
    openSlot.value = '';
    clearSearch();
  }
}

// "search for a place": onemap matches for what's typed, so a spot can be added with its address
// and a pin on the map. waits for a pause in typing and drops answers to older searches.

const search = reactive({
  results: [],
  loading: false,
  error: ''
});

let searchTimer = null;

let searchAbort = null;

function clearSearch() {
  clearTimeout(searchTimer);
  searchAbort?.abort();
  searchAbort = null;
  Object.assign(search, {
    results: [],
    loading: false,
    error: ''
  });
}

watch(customName, text => {
  clearSearch();
  const query = text.trim();
  if (query.length < 3) return;
  search.loading = true;
  searchTimer = setTimeout(async () => {
    const controller = new AbortController();
    searchAbort = controller;
    try {
      const places = await searchPlaces(query, controller.signal, 30, 3);
      if (searchAbort !== controller) return;
      // nearest the event's venue first
      const sorted = hasMap.value ? [...places].sort((a, b) => fromVenue(a) - fromVenue(b)) : places;
      Object.assign(search, {
        results: sorted.slice(0, 5),
        loading: false,
        error: ''
      });
    } catch {
      if (controller.signal.aborted) return;
      Object.assign(search, {
        results: [],
        loading: false,
        error: 'Place search is unavailable right now. You can still add the name.'
      });
    }
  }, 400);
});

onBeforeUnmount(clearSearch);

const pickPlace = (slot, place, index) => suggest(slot, {
  id: `onemap-${index}`,
  name: place.name.slice(0, SUGGESTION_NAME_LIMIT),
  address: place.address,
  lat: place.lat,
  lng: place.lng
});

const nameTaken = (slot, name) => plan.value[slot].suggestions.some(s => String(s.name).toLowerCase() === String(name).slice(0, SUGGESTION_NAME_LIMIT).toLowerCase());
// straight-line distance from the event's venue, for the search results
// Use the haversine formula. The result is in metres.

function fromVenue(place) {
  if (!hasMap.value) return null;
  const rad = x => x * Math.PI / 180;
  const dLat = rad(place.lat - venue.value.lat),
    dLng = rad(place.lng - venue.value.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(venue.value.lat)) * Math.cos(rad(place.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(h)));
}

const alreadySuggested = (slot, item) => plan.value[slot].suggestions.some(s => s.refId && s.refId === item.id);

// food near the venue for a slot. places are checked against the slot's start time, so it asks
// again if that time has moved.

async function loadFood(slot) {
  const at = plan.value[slot].start;
  if (!hasMap.value || food[slot] && food[slot].at === at && (food[slot].loading || !food[slot].error)) return;
  food[slot] = {
    loading: true,
    error: '',
    places: [],
    status: {},
    at
  };
  try {
    const result = await getFoodNearby({
      lat: venue.value.lat,
      lng: venue.value.lng,
      at
    });
    if (plan.value[slot].start !== at) return;
    food[slot] = {
      loading: false,
      error: '',
      ...result,
      at
    };
  } catch (e) {
    food[slot] = {
      loading: false,
      error: e.message,
      places: [],
      status: {},
      at
    };
  }
}

async function toggleAdd(slot) {
  openSlot.value = openSlot.value === slot ? '' : slot;
  error.value = '';
  customName.value = '';
  clearSearch();
  if (!openSlot.value) return;
  await loadFood(slot);
}
// one list for the place box: nearby places (geoapify, open then) narrowed by what's typed, plus
// onemap matches once three letters are in, without repeats, nearest the venue first.

function placeRows(slot) {
  const q = customName.value.trim().toLowerCase();
  const nearby = (food[slot]?.places || []).map(p => ({
    ...p,
    name: String(p.name ?? '')
  })) // names can arrive as numbers (a cafe called "1988")
  .filter(p => p.name && (!q || p.name.toLowerCase().includes(q) || String(p.category || '').toLowerCase().includes(q))).map(p => ({
    key: p.id,
    name: p.name,
    detail: p.category,
    distanceM: p.distanceM,
    open: p.openAt === 'open',
    busyKey: `add-${p.id}`,
    taken: alreadySuggested(slot, p) || nameTaken(slot, p.name),
    pick: () => suggest(slot, p)
  }));
  const seen = new Set(nearby.map(r => r.name.toLowerCase()));
  const searched = q.length >= 3 ? search.results.filter(p => !seen.has(p.name.toLowerCase())).map((p, i) => ({
    key: `onemap:${p.name}:${p.postal}`,
    name: p.name,
    detail: p.address,
    distanceM: fromVenue(p),
    open: false,
    busyKey: `add-onemap-${i}`,
    taken: nameTaken(slot, p.name),
    pick: () => pickPlace(slot, p, i)
  })) : [];
  return [...nearby, ...searched].sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));
}

const placesUnavailable = slot => !hasMap.value || food[slot]?.error || food[slot]?.status?.places === 'unconfigured' || food[slot]?.status?.places === 'unavailable';

function placeHint(slot) {
  const q = customName.value.trim();
  if (q) return `Matches for “${q}”, nearest first`;
  if (placesUnavailable(slot)) return 'Search for a place, or type its name';
  return `Nearby and open at ${time(plan.value[slot].start)}, nearest first`;
}

const addTyped = slot => {
  if (customName.value.trim()) suggest(slot, {
    name: customName.value
  });
};

// "when are you free?" folds into one line; the grid opens on demand

const painting = reactive({
  before: false,
  after: false
});
// phones show one slot at a time

const activeSlot = ref(SLOTS[0]);

const directionsUrl = s => s.lat != null && s.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} Singapore`)}`;

const fromVenueOf = s => s.lat != null && s.lng != null ? fromVenue(s) : null;
</script>

<template>
  <section class="group-plan" aria-labelledby="group-plan-title">
    <div class="group-plan-head">
      <h2 id="group-plan-title" class="section-title m-0">Before and after</h2>
      <p class="text-meta text-secondary m-0">Find a time, suggest a spot, mark the ones you’re keen on{{ isHost ? ', then lock one in.' : ', and the host locks one in.' }}</p>
    </div>

    <!-- phones: one slot at a time -->
    <div class="group-slot-switch" role="tablist" aria-label="Before or after the event">
      <button
      v-for="slot in SLOTS"
      :key="slot"
      type="button"
      role="tab"
      class="group-slot-tab"
      :aria-selected="activeSlot === slot"
      :aria-controls="`slot-card-${slot}`"
      @click="activeSlot = slot">
        {{ slotTitle(slot) }}<span v-if="chosen(slot)" class="group-slot-dot" aria-label="planned"></span>
      </button>
    </div>

    <div class="group-slots">
      <article
      v-for="slot in SLOTS"
      :id="`slot-card-${slot}`"
      :key="slot"
      class="group-slot"
      :class="{ 'is-inactive': activeSlot !== slot }"
      :aria-labelledby="`slot-${slot}`">
        <header class="group-slot-head">
          <div>
            <Transition name="list-fade" mode="out-in">
            <h3 :id="`slot-${slot}`" :key="slotTitle(slot)" class="group-slot-title">{{ slotTitle(slot) }}</h3></Transition>
            <Transition name="list-fade" mode="out-in">
            <p :key="slotWhen(slot)" class="text-meta text-secondary m-0 tnum">{{ slotWhen(slot) }}</p></Transition>
          </div>
          <span v-if="chosen(slot)" class="group-slot-badge pop-once">Planned</span>
        </header>

        <!-- when: one line, with the grid folded away until someone wants to mark their times -->
        <div class="group-when">
          <p class="group-when-copy m-0" aria-live="polite">
            <template v-if="plan[slot].fitted">
            <strong>Best time · {{ plan[slot].coming.length }} of {{ plan[slot].memberCount }} free</strong></template>
            <template v-else>
            <strong>No shared free time yet</strong></template>
            <span v-if="plan[slot].noReply.length" class="text-caption text-secondary"> · Waiting on {{ names(plan[slot].noReply).replace(/^You\b/, 'you') }}</span>
            <span v-if="plan[slot].fitted && plan[slot].cant.length" class="text-caption text-secondary"> · Not free then: {{ names(plan[slot].cant) }}</span>
          </p>
          <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          :aria-expanded="painting[slot]"
          :aria-controls="`paint-${slot}`"
          @click="painting[slot] = !painting[slot]">
            {{ painting[slot] ? 'Done' : plan[slot].myCells?.length ? 'Change your times' : 'Mark when you’re free' }}
          </button>
        </div>
        <div v-if="painting[slot]" :id="`paint-${slot}`" class="reveal-down">
          <AvailabilityPainter
          :slot="slot"
          :cells="plan[slot].cells"
          :my-cells="plan[slot].myCells"
          :member-count="plan[slot].memberCount"
          :best="plan[slot].fitted ? { start: plan[slot].start, end: plan[slot].end } : null"
          @save="saveAvailability(slot, $event)" />
        </div>

        <!-- the host's pick, front and centre -->
        <div v-if="chosen(slot)" :key="chosen(slot).id" class="group-the-plan pop-in">
          <span class="group-the-plan-label">The plan</span>
          <strong class="group-the-plan-name">{{ chosen(slot).name }}</strong>
          <span v-if="chosen(slot).detail" class="text-meta">{{ chosen(slot).detail }}<template v-if="chosen(slot).priceText"> · {{ chosen(slot).priceText }}</template></span>
          <span class="text-caption text-secondary">
            <template v-if="fromVenueOf(chosen(slot)) != null">{{ distance(fromVenueOf(chosen(slot))) }} from {{ venue.name }} · {{ walk(fromVenueOf(chosen(slot))) }}</template>
            <template v-else-if="chosen(slot).address">{{ chosen(slot).address }}</template>
            <template v-if="chosen(slot).votes"> · {{ chosen(slot).votes }} keen</template>
          </span>
          <div class="group-the-plan-actions">
            <a
            :href="directionsUrl(chosen(slot))"
            target="_blank"
            rel="noopener"
            class="btn btn-primary btn-sm">Directions</a>
            <button
            v-if="isHost"
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="busy === `pick-${chosen(slot).id}`"
            @click="choose(slot, chosen(slot))">Change</button>
          </div>
        </div>

        <!-- everyone's ideas, most keen first (the pick is shown above) -->
        <TransitionGroup
        v-if="plan[slot].suggestions.some((s) => s.id !== plan[slot].chosenId)"
        tag="ul"
        name="list-fade"
        class="list-unstyled m-0 group-ideas">
          <li
          v-for="s in plan[slot].suggestions.filter((x) => x.id !== plan[slot].chosenId)"
          :key="s.id"
          class="group-idea">
            <div class="group-idea-copy">
              <strong>{{ s.name }}</strong>
              <span v-if="s.detail" class="text-caption text-secondary">{{ s.detail }}</span>
              <span class="text-caption text-secondary">{{ s.mine ? 'You' : s.suggestedByName }}<template v-if="fromVenueOf(s) != null"> · {{ walk(fromVenueOf(s)) }}</template>
              <template v-else-if="s.address"> · {{ s.address }}</template></span>
            </div>
            <div class="group-idea-actions">
              <button
              type="button"
              class="btn btn-sm group-keen"
              :class="s.myVote ? 'is-on' : ''"
              :aria-pressed="s.myVote"
              :disabled="busy === `vote-${s.id}`"
              @click="vote(slot, s)">
                <span aria-hidden="true">{{ s.myVote ? '♥' : '♡' }}</span> Keen <span class="tnum">
                <BumpValue :value="s.votes" /></span>
              </button>
              <button
              v-if="isHost"
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="busy === `pick-${s.id}`"
              @click="choose(slot, s)">Lock it in</button>
              <button
              v-if="isHost || s.mine"
              type="button"
              class="btn btn-link btn-sm text-secondary p-0"
              :disabled="busy === `remove-${s.id}`"
              :aria-label="`Remove ${s.name}`"
              @click="remove(slot, s)">Remove</button>
            </div>
          </li>
        </TransitionGroup>

        <p v-else-if="!chosen(slot)" class="text-meta text-secondary m-0">No ideas yet. Be the first to suggest a spot.</p>

        <button
        type="button"
        class="btn btn-outline-secondary btn-sm group-add"
        :aria-expanded="openSlot === slot"
        :aria-controls="`add-${slot}`"
        @click="toggleAdd(slot)">
          {{ openSlot === slot ? 'Close' : `Suggest a spot for ${plan[slot].label.toLowerCase()}` }}
        </button>

        <!-- one place box: nearby places to scroll, or type to search; both lists show as one -->
        <form
        v-if="openSlot === slot"
        :id="`add-${slot}`"
        class="place-box reveal-down"
        @submit.prevent="addTyped(slot)">
          <div class="place-box-field">
            <span class="place-box-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" /></svg></span>
            <label class="visually-hidden" :for="`custom-${slot}`">Find a place</label>
            <input
            :id="`custom-${slot}`"
            v-model="customName"
            class="place-box-input"
            :maxlength="SUGGESTION_NAME_LIMIT"
            autocomplete="off"
            placeholder="Search or pick a place nearby"
            :aria-describedby="`place-hint-${slot}`"
            @keydown.esc="customName = ''" />
            <span
            v-if="search.loading || food[slot]?.loading"
            class="spinner-border spinner-border-sm place-box-spin"
            role="status">
            <span class="visually-hidden">Looking for places…</span></span>
          </div>
          <p :id="`place-hint-${slot}`" class="place-box-hint m-0" aria-live="polite">{{ placeHint(slot) }}</p>
          <ul class="place-box-list list-unstyled m-0" :aria-label="placeHint(slot)">
            <li v-for="row in placeRows(slot)" :key="row.key" class="place-row">
              <div class="place-row-copy">
                <strong class="place-row-name">{{ row.name }}</strong>
                <span class="place-row-meta">
                  <span v-if="row.open" class="place-row-open">Open</span>
                  {{ [row.detail, row.distanceM != null ? `${distance(row.distanceM)} · ${walk(row.distanceM)}` : ''].filter(Boolean).join(' · ') }}
                </span>
              </div>
              <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              :disabled="row.taken || busy === row.busyKey"
              :aria-label="row.taken ? `${row.name} is already suggested` : `Suggest ${row.name}`"
              @click="row.pick()">{{ row.taken ? 'Added' : 'Suggest' }}</button>
            </li>
            <li v-if="customName.trim()" class="place-row place-row-typed">
              <div class="place-row-copy">
                <strong class="place-row-name">“{{ customName.trim() }}”</strong>
                <span class="place-row-meta">Just the name, with no map pin</span>
              </div>
              <button
              type="submit"
              class="btn btn-primary btn-sm"
              :disabled="busy === 'add-custom'"
              :aria-label="`Add ${customName.trim()} by name`">Add</button>
            </li>
            <li v-if="!placeRows(slot).length && !customName.trim() && !food[slot]?.loading" class="place-box-empty">
              {{ placesUnavailable(slot) ? 'Nearby places aren’t available here. Type a place to search for it.' : `No places near here are open at ${time(plan[slot].start)}. Type to search.` }}
            </li>
          </ul>
          <p v-if="search.error" class="place-box-hint m-0" role="status">{{ search.error }}</p>
        </form>
      </article>
    </div>

    <p v-dismissible v-if="error" class="group-plan-error" role="alert">{{ error }}</p>
    <GroupMap v-if="hasMap" :venue="venue" :spots="mapSpots" />
    <p class="text-caption text-secondary m-0">Nearby places and opening hours come from OpenStreetMap and may be out of date; check with the shop.</p>
  </section>
</template>

<style scoped>
.group-plan {
  display: grid;
  gap: 14px;
}

.group-plan-head {
  display: grid;
  gap: 4px;
}

/* before and after side by side when there's room (each needs about 280px for its food list), stacked otherwise */

.group-slots {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 12px;
}

.group-slot {
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--bookedz-border);
  border-radius: 16px;
  background: var(--bookedz-surface);
}

.group-slot-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.group-slot-title {
  margin: 0;
  font: 600 1.05rem var(--bookedz-heading);
}

.group-slot-badge {
  padding: 3px 10px;
  border-radius: 99px;
  background: var(--bookedz-teal-soft);
  color: var(--bookedz-teal-ink);
  font-size: var(--text-caption);
  font-weight: 700;
}

@keyframes chosen-in {
  from {
    opacity: 0;
    transform: scale(.96);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.pop-in {
  animation: chosen-in var(--bookedz-motion-normal, .24s) var(--bookedz-ease-stamp, ease-out);
}

.group-keen {
  transition: background-color var(--bookedz-motion-fast, .16s) var(--bookedz-ease, ease), border-color var(--bookedz-motion-fast, .16s) var(--bookedz-ease, ease), transform var(--bookedz-motion-fast, .16s) var(--bookedz-ease, ease);
}

.group-keen:active {
  transform: scale(.94);
}

.group-slot {
  transition: border-color var(--bookedz-motion-normal, .24s) var(--bookedz-ease, ease), box-shadow var(--bookedz-motion-normal, .24s) var(--bookedz-ease, ease);
}

.group-slot:has(.group-slot-badge) {
  border-color: color-mix(in srgb, var(--bookedz-teal-ink) 50%, var(--bookedz-border));
}

@media (prefers-reduced-motion: reduce) {
  .pop-in, .group-keen, .group-slot {
    animation: none;
    transition: none;
  }
}

.group-ideas {
  display: grid;
  gap: 8px;
}

.group-idea {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--bookedz-border);
  border-radius: 12px;
}

.group-idea-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.group-idea-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  flex: none;
}

.group-idea-actions .btn {
  min-height: 36px;
}

.group-keen {
  border: 1px solid var(--bookedz-border);
  background: var(--bookedz-surface);
  color: var(--bookedz-ink);
}

.group-keen.is-on {
  border-color: var(--bookedz-teal-ink);
  background: var(--bookedz-teal-soft);
  color: var(--bookedz-teal-ink);
}

.group-add {
  justify-self: start;
  min-height: 40px;
}

/* the place box: one field and one scrolling list, whichever service a row came from */

.place-box {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--bookedz-control-border, var(--bookedz-border));
  border-radius: 16px;
  background: var(--bookedz-surface);
}

.place-box-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-bottom: 1px solid var(--bookedz-border);
}

.place-box-field:focus-within {
  box-shadow: inset 0 -2px 0 var(--bookedz-primary);
}

.place-box-icon {
  display: grid;
  flex: none;
  width: 18px;
  height: 18px;
  color: var(--bookedz-muted);
}

.place-box-input {
  flex: 1;
  min-width: 0;
  min-height: 46px;
  border: 0;
  background: transparent;
  color: var(--bookedz-ink);
  font-size: 1rem;
  outline: none;
}

.place-box-input::placeholder {
  color: var(--bookedz-muted);
}

.place-box-spin {
  flex: none;
  color: var(--bookedz-muted);
}

.place-box-hint {
  padding: 8px 12px 4px;
  color: var(--bookedz-muted);
  font-size: .78rem;
  font-weight: 600;
}

.place-box-list {
  max-height: 300px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.place-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
}

.place-row + .place-row {
  border-top: 1px solid var(--bookedz-border);
}

.place-row:hover {
  background: var(--bookedz-hover);
}

.place-row-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.place-row-name {
  overflow-wrap: anywhere;
}

.place-row-meta {
  color: var(--bookedz-muted);
  font-size: .8rem;
  overflow-wrap: anywhere;
}

.place-row-open {
  margin-right: 4px;
  padding: 0 6px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--bookedz-success) 16%, transparent);
  color: var(--bookedz-success);
  font-weight: 700;
}

.place-row-typed {
  background: color-mix(in srgb, var(--bookedz-primary) 6%, transparent);
}

.place-box-empty {
  padding: 14px 12px;
  color: var(--bookedz-muted);
  font-size: .88rem;
}

/* phones (a narrow planner): a before | after switch and one slot at a time */

.group-plan {
  container-type: inline-size;
}

.group-slot-switch {
  display: flex;
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--bookedz-border);
  border-radius: 99px;
  background: var(--bookedz-surface);
}

.group-slot-tab {
  position: relative;
  flex: 1;
  min-height: 40px;
  padding: 6px 12px;
  border: 0;
  border-radius: 99px;
  background: transparent;
  color: var(--bookedz-muted);
  font-weight: 700;
  font-size: .88rem;
}

.group-slot-tab[aria-selected='true'] {
  background: var(--bookedz-ink);
  color: var(--bookedz-surface);
}

.group-slot-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-left: 6px;
  border-radius: 50%;
  background: var(--bookedz-success);
  vertical-align: middle;
}

@container (min-width: 600px) {
  .group-slot-switch {
    display: none;
  }
}

@container (max-width: 599.98px) {
  .group-slot.is-inactive {
    display: none;
  }
}

/* when: one line and a button */

.group-when {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--bookedz-hover);
}

.group-when-copy {
  min-width: 0;
  font-size: .9rem;
}

/* the host's pick */

.group-the-plan {
  display: grid;
  gap: 3px;
  padding: 14px 16px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 18px;
  background: var(--bookedz-mango-soft, #fff1cc);
  box-shadow: 4px 4px 0 var(--bookedz-ink);
}

.group-the-plan-label {
  color: var(--bookedz-primary-dark);
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.group-the-plan-name {
  font: 900 1.2rem/1.25 var(--bookedz-heading);
  color: var(--bookedz-ink);
  overflow-wrap: anywhere;
}

.group-the-plan-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

:root[data-theme="dark"] .group-the-plan {
  border-color: var(--bookedz-border);
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--bookedz-teal) 60%, transparent);
}

/* no ideas yet: quick picks */

.group-plan-error {
  margin: 0;
  color: var(--bookedz-danger);
  font-size: .9rem;
}

@media (max-width: 767px) {
  .group-slots {
    grid-template-columns: 1fr;
  }
}
</style>
