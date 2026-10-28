<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createHangout } from '../../utils/api.js'
import { INTEREST_OPTIONS } from '../../lib/constants.js'
import PlaceholderPanel from '../../components/planning/PlaceholderPanel.vue'

// Create a group hangout, or a solo plan when the URL has ?mode=solo.

const route = useRoute()
const router = useRouter()

const today = new Date().toISOString().slice(0, 10)
const form = ref({
  title: '',
  mode: route.query.mode === 'solo' ? 'solo' : 'group',
  dateFrom: today,
  dateTo: today,
  minDurationMins: 180,
  areaName: '',
  vibe: [],
})
const saving = ref(false)
const errorMessage = ref('')
const isSolo = computed(() => form.value.mode === 'solo')

async function submit() {
  if (saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const hangout = await createHangout({ ...form.value, areaName: form.value.areaName.trim() || null })
    await router.push('/hangouts/' + hangout.id)
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <h1 class="mb-4">{{ isSolo ? 'Plan a solo outing' : 'New hangout' }}</h1>

  <form class="row g-4" novalidate @submit.prevent="submit">
    <div class="col-12 col-lg-7">
      <div v-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</div>

      <fieldset class="mb-3">
        <legend class="form-label fs-6">Who is it for?</legend>
        <div class="btn-group" role="group">
          <input id="mode-group" v-model="form.mode" class="btn-check" type="radio" name="mode" value="group" />
          <label class="btn btn-outline-primary" for="mode-group">A group</label>
          <input id="mode-solo" v-model="form.mode" class="btn-check" type="radio" name="mode" value="solo" />
          <label class="btn btn-outline-primary" for="mode-solo">Just me</label>
        </div>
      </fieldset>

      <div class="mb-3">
        <label class="form-label" for="hangout-title">Name</label>
        <input id="hangout-title" v-model="form.title" class="form-control" type="text" maxlength="120" required :placeholder="isSolo ? 'Free afternoon in town' : 'Saturday catch-up'" />
      </div>

      <div class="row g-3 mb-3">
        <div class="col-sm-6">
          <label class="form-label" for="hangout-from">{{ isSolo ? 'Date' : 'Earliest date' }}</label>
          <input id="hangout-from" v-model="form.dateFrom" class="form-control" type="date" :min="today" required />
        </div>
        <div class="col-sm-6">
          <label class="form-label" for="hangout-to">Latest date</label>
          <input id="hangout-to" v-model="form.dateTo" class="form-control" type="date" :min="form.dateFrom" required />
        </div>
      </div>

      <div class="mb-3">
        <label class="form-label" for="hangout-duration">How long?</label>
        <select id="hangout-duration" v-model.number="form.minDurationMins" class="form-select">
          <option :value="120">At least 2 hours</option>
          <option :value="180">At least 3 hours</option>
          <option :value="240">At least 4 hours</option>
          <option :value="360">At least 6 hours</option>
        </select>
      </div>

      <div class="mb-3">
        <label class="form-label" for="hangout-area">Rough area <span class="text-secondary">(optional)</span></label>
        <input id="hangout-area" v-model="form.areaName" class="form-control" type="text" placeholder="e.g. Bugis" />
        <div class="form-text">Map search with OneMap comes later.</div>
      </div>

      <fieldset class="mb-4">
        <legend class="form-label fs-6">Vibe</legend>
        <div class="d-flex flex-wrap gap-2">
          <template v-for="interest in INTEREST_OPTIONS" :key="interest">
            <input :id="'vibe-' + interest" v-model="form.vibe" class="btn-check" type="checkbox" :value="interest" />
            <label class="btn btn-sm btn-outline-secondary text-capitalize" :for="'vibe-' + interest">{{ interest }}</label>
          </template>
        </div>
      </fieldset>

      <button class="btn btn-primary" type="submit" :disabled="saving">{{ saving ? 'Creating…' : isSolo ? 'Create plan' : 'Create hangout' }}</button>
    </div>

    <div class="col-12 col-lg-5">
      <PlaceholderPanel
        title="Area picker and fair meeting point"
        description="Pick the area on a map, or let OpenJio suggest a spot that is fair for everyone's travel time."
        waiting-on="OneMap search + fair meeting point in generateItinerary()"
      />
    </div>
  </form>
</template>
