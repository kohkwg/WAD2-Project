<script setup>
import { computed, reactive, ref } from 'vue'
import GroupMap from './GroupMap.vue'
import { getFoodNearby, suggestGroupStop, voteGroupStop, chooseGroupStop, removeGroupStop } from '../../utils/api.js'
import { SLOTS, SUGGESTION_NAME_LIMIT } from '../../utils/groups.js'
import { toast } from '../../composables/useToast'

// Before / after the event: members suggest a nearby place or food deal for each slot,
// mark the ones they're keen on, and the host picks one. Times fit around the event.
const props = defineProps({ group: { type: Object, required: true } })
const emit = defineEmits(['update:plan'])
const isHost = computed(() => props.group.myStatus === 'host')
const plan = computed(() => props.group.plan)
const venue = computed(() => props.group.event?.venue)
const hasMap = computed(() => Number.isFinite(venue.value?.lat) && Number.isFinite(venue.value?.lng))

const busy = ref('')
const error = ref('')
const openSlot = ref('') // which slot's "Add an idea" panel is open
const food = reactive({ before: null, after: null }) // { loading, error, deals, places, status }
const tab = ref('deals')
const customName = ref('')

const time = (iso) => new Intl.DateTimeFormat('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' }).format(new Date(iso))
const slotTitle = (slot) => `${plan.value[slot].label} ${slot}`
const slotWhen = (slot) => `${time(plan.value[slot].start)} – ${time(plan.value[slot].end)}`
const chosen = (slot) => plan.value[slot].suggestions.find((s) => s.id === plan.value[slot].chosenId) || null
const distance = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`)
const walk = (m) => `${Math.max(1, Math.round(m / 80))} min walk`

const mapSpots = computed(() => SLOTS.flatMap((slot) => plan.value[slot].suggestions.map((s) => ({ ...s, chosen: s.id === plan.value[slot].chosenId, label: `${slotTitle(slot)} · ${s.votes} keen` }))))

async function act(key, fn, message) {
  busy.value = key
  error.value = ''
  try {
    emit('update:plan', await fn())
    if (message) toast(message)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = ''
  }
}
const vote = (slot, s) => act(`vote-${s.id}`, () => voteGroupStop(props.group.id, slot, s.id, !s.myVote))
const choose = (slot, s) => act(`pick-${s.id}`, () => chooseGroupStop(props.group.id, slot, s && s.id !== plan.value[slot].chosenId ? s.id : null), s && s.id !== plan.value[slot].chosenId ? `${s.name} is the plan for ${plan.value[slot].label.toLowerCase()}` : 'Pick cleared')
const remove = (slot, s) => act(`remove-${s.id}`, () => removeGroupStop(props.group.id, slot, s.id), 'Idea removed')

async function suggest(slot, item) {
  await act(`add-${item.id || 'custom'}`, () => suggestGroupStop(props.group.id, slot, item), 'Idea added')
  if (!error.value) { customName.value = ''; openSlot.value = '' }
}
const alreadySuggested = (slot, item) => plan.value[slot].suggestions.some((s) => s.refId && s.refId === item.id)

async function toggleAdd(slot) {
  openSlot.value = openSlot.value === slot ? '' : slot
  error.value = ''
  if (!openSlot.value || food[slot] || !hasMap.value) return
  food[slot] = { loading: true, error: '', deals: [], places: [], status: {} }
  try {
    const result = await getFoodNearby({ lat: venue.value.lat, lng: venue.value.lng, at: plan.value[slot].start })
    food[slot] = { loading: false, error: '', ...result }
    tab.value = result.deals.length ? 'deals' : 'places'
  } catch (e) {
    food[slot] = { loading: false, error: e.message, deals: [], places: [], status: {} }
  }
}
const validLabel = { valid: 'On at this time', unknown: 'Check times' }
</script>

<template>
  <section class="group-plan" aria-labelledby="group-plan-title">
    <div class="group-plan-head">
      <h2 id="group-plan-title" class="section-title m-0">Before and after</h2>
      <p class="text-meta text-secondary m-0">Grab food together around the event. Suggest a spot, mark the ones you’re keen on{{ isHost ? ', then pick one.' : '; the host picks.' }}</p>
    </div>

    <div class="group-slots">
      <article v-for="slot in SLOTS" :key="slot" class="group-slot" :aria-labelledby="`slot-${slot}`">
        <header class="group-slot-head">
          <div>
            <h3 :id="`slot-${slot}`" class="group-slot-title">{{ slotTitle(slot) }}</h3>
            <p class="text-meta text-secondary m-0 tnum">{{ slotWhen(slot) }}</p>
          </div>
          <span v-if="chosen(slot)" class="group-slot-badge pop-once">Planned</span>
        </header>

        <p v-if="chosen(slot)" class="group-slot-chosen">
          <strong>{{ chosen(slot).name }}</strong>{{ chosen(slot).detail ? ` · ${chosen(slot).detail}` : '' }}
        </p>

        <TransitionGroup v-if="plan[slot].suggestions.length" tag="ul" name="list-fade" class="list-unstyled m-0 group-ideas">
          <li v-for="s in plan[slot].suggestions" :key="s.id" class="group-idea" :class="{ 'is-chosen': s.id === plan[slot].chosenId }">
            <div class="group-idea-copy">
              <strong>{{ s.name }}</strong>
              <span v-if="s.kind === 'deal'" class="group-idea-deal">{{ s.detail }}<template v-if="s.priceText"> · {{ s.priceText }}</template></span>
              <span v-else-if="s.detail" class="text-caption text-secondary">{{ s.detail }}</span>
              <span class="text-caption text-secondary">Suggested by {{ s.mine ? 'you' : s.suggestedByName }}<template v-if="s.address"> · {{ s.address }}</template></span>
              <a v-if="s.sourceUrl" :href="s.sourceUrl" target="_blank" rel="noopener" class="text-caption">See the deal post</a>
            </div>
            <div class="group-idea-actions">
              <button type="button" class="btn btn-sm group-keen" :class="s.myVote ? 'is-on' : ''" :aria-pressed="s.myVote" :disabled="busy === `vote-${s.id}`" @click="vote(slot, s)">
                Keen <span class="tnum">{{ s.votes }}</span>
              </button>
              <button v-if="isHost" type="button" class="btn btn-sm" :class="s.id === plan[slot].chosenId ? 'btn-outline-secondary' : 'btn-primary'" :disabled="busy === `pick-${s.id}`" @click="choose(slot, s)">
                {{ s.id === plan[slot].chosenId ? 'Unpick' : 'Pick' }}
              </button>
              <button v-if="isHost || s.mine" type="button" class="btn btn-link btn-sm text-secondary p-0" :disabled="busy === `remove-${s.id}`" :aria-label="`Remove ${s.name}`" @click="remove(slot, s)">Remove</button>
            </div>
          </li>
        </TransitionGroup>
        <p v-else class="text-meta text-secondary m-0">No ideas yet.</p>

        <button type="button" class="btn btn-outline-secondary btn-sm group-add" :aria-expanded="openSlot === slot" :aria-controls="`add-${slot}`" @click="toggleAdd(slot)">
          {{ openSlot === slot ? 'Close' : `Suggest a spot for ${plan[slot].label.toLowerCase()}` }}
        </button>

        <div v-if="openSlot === slot" :id="`add-${slot}`" class="group-add-panel reveal-down">
          <template v-if="hasMap">
            <p v-if="food[slot]?.loading" class="text-meta text-secondary m-0" role="status"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Finding food near {{ venue.name }}…</p>
            <p v-else-if="food[slot]?.error" class="group-add-note" role="status">{{ food[slot].error }}</p>
            <template v-else-if="food[slot]">
              <div class="group-tabs" role="tablist" aria-label="Nearby food">
                <button type="button" role="tab" class="group-tab" :aria-selected="tab === 'deals'" @click="tab = 'deals'">Deals <span class="tnum">{{ food[slot].deals.length }}</span></button>
                <button type="button" role="tab" class="group-tab" :aria-selected="tab === 'places'" @click="tab = 'places'">Places <span class="tnum">{{ food[slot].places.length }}</span></button>
              </div>
              <ul v-if="tab === 'deals' && food[slot].deals.length" class="list-unstyled m-0 group-options stagger-in">
                <li v-for="deal in food[slot].deals" :key="deal.id" class="group-option">
                  <div class="group-idea-copy">
                    <strong>{{ deal.merchant || deal.outlet.name }}</strong>
                    <span class="group-idea-deal">{{ deal.title }}<template v-if="deal.priceText"> · {{ deal.priceText }}</template></span>
                    <span class="text-caption text-secondary">{{ distance(deal.distanceM) }} · {{ walk(deal.distanceM) }} · {{ validLabel[deal.validAt] }}</span>
                    <a v-if="deal.source.url" :href="deal.source.url" target="_blank" rel="noopener" class="text-caption">From {{ deal.source.name || 'the deal post' }}</a>
                  </div>
                  <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="alreadySuggested(slot, deal) || busy === `add-${deal.id}`" @click="suggest(slot, deal)">{{ alreadySuggested(slot, deal) ? 'Added' : 'Suggest' }}</button>
                </li>
              </ul>
              <p v-else-if="tab === 'deals'" class="group-add-note">{{ food[slot].status?.deals === 'no-pipeline-output' ? 'No deals collected yet. The deals pipeline hasn’t run on this server.' : 'No food deals found near here for this time.' }}</p>
              <ul v-if="tab === 'places' && food[slot].places.length" class="list-unstyled m-0 group-options stagger-in">
                <li v-for="place in food[slot].places" :key="place.id" class="group-option">
                  <div class="group-idea-copy">
                    <strong>{{ place.name }}</strong>
                    <span class="text-caption text-secondary">{{ place.category }} · {{ distance(place.distanceM) }} · {{ walk(place.distanceM) }}</span>
                  </div>
                  <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="alreadySuggested(slot, place) || busy === `add-${place.id}`" @click="suggest(slot, place)">{{ alreadySuggested(slot, place) ? 'Added' : 'Suggest' }}</button>
                </li>
              </ul>
              <p v-else-if="tab === 'places'" class="group-add-note">{{ food[slot].status?.places === 'unconfigured' ? 'Nearby places need a Geoapify key on the server.' : 'No places found near here.' }}</p>
            </template>
          </template>
          <form class="group-custom" @submit.prevent="suggest(slot, { name: customName })">
            <label class="form-label m-0" :for="`custom-${slot}`">Or type a place</label>
            <div class="group-custom-row">
              <input :id="`custom-${slot}`" v-model="customName" class="form-control" :maxlength="SUGGESTION_NAME_LIMIT" autocomplete="off" placeholder="e.g. Maxwell Food Centre" />
              <button type="submit" class="btn btn-primary" :disabled="!customName.trim() || busy === 'add-custom'">Add</button>
            </div>
          </form>
        </div>
      </article>
    </div>

    <p v-if="error" class="group-plan-error" role="alert">{{ error }}</p>
    <GroupMap v-if="hasMap" :venue="venue" :spots="mapSpots" />
    <p class="text-caption text-secondary m-0">Deals come from public Telegram channels and deal sites and may change; check with the shop. Places from OpenStreetMap.</p>
  </section>
</template>

<style scoped>
.group-plan { display: grid; gap: 14px; }
.group-plan-head { display: grid; gap: 4px; }
.group-slots { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.group-slot { display: grid; align-content: start; gap: 10px; padding: 14px; border: 1px solid var(--bookedz-border); border-radius: 16px; background: var(--bookedz-surface); }
.group-slot-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.group-slot-title { margin: 0; font: 600 1.05rem var(--bookedz-heading); }
.group-slot-badge { padding: 3px 10px; border-radius: 99px; background: var(--bookedz-teal-soft); color: var(--bookedz-teal-ink); font-size: var(--text-caption); font-weight: 700; }
.group-slot-chosen { margin: 0; padding: 8px 10px; border-radius: 10px; background: var(--bookedz-orange-soft); overflow-wrap: anywhere; }
.group-ideas,.group-options { display: grid; gap: 8px; }
.group-idea,.group-option { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 8px 10px; border: 1px solid var(--bookedz-border); border-radius: 12px; }
.group-idea.is-chosen { border-color: var(--bookedz-primary); }
.group-idea-copy { display: grid; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
.group-idea-deal { color: var(--bookedz-primary-dark); font-size: .9rem; font-weight: 600; }
.group-idea-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 6px; flex: none; }
.group-idea-actions .btn,.group-option .btn { min-height: 36px; }
.group-keen { border: 1px solid var(--bookedz-border); background: var(--bookedz-surface); color: var(--bookedz-ink); }
.group-keen.is-on { border-color: var(--bookedz-teal-ink); background: var(--bookedz-teal-soft); color: var(--bookedz-teal-ink); }
.group-add { justify-self: start; min-height: 40px; }
.group-add-panel { display: grid; gap: 10px; padding-top: 10px; border-top: 1px dashed var(--bookedz-border); }
.group-add-note { margin: 0; color: var(--bookedz-muted); font-size: .9rem; }
.group-tabs { display: flex; gap: 6px; }
.group-tab { min-height: 36px; padding: 4px 12px; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-size: .88rem; }
.group-tab[aria-selected='true'] { background: var(--bookedz-ink); border-color: var(--bookedz-ink); color: var(--bookedz-surface); }
.group-options { max-height: 300px; overflow-y: auto; }
.group-custom { display: grid; gap: 6px; }
.group-custom-row { display: flex; gap: 8px; }
.group-custom-row .form-control,.group-custom-row .btn { min-height: 40px; }
.group-plan-error { margin: 0; color: var(--bookedz-danger); font-size: .9rem; }
@media (max-width: 767px) { .group-slots { grid-template-columns: 1fr; } }
</style>
