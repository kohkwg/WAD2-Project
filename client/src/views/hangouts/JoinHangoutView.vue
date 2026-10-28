<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { joinHangout } from '../../utils/api.js'

// Opened from an invite link. Joining asks how the member wants to share availability.

const route = useRoute()
const router = useRouter()
const choice = ref('')
const joining = ref(false)
const errorMessage = ref('')

async function join() {
  if (joining.value || !choice.value) return
  joining.value = true
  errorMessage.value = ''
  try {
    const hangout = await joinHangout(route.params.code, choice.value)
    await router.push('/hangouts/' + hangout.id + '#availability')
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div class="mx-auto" style="max-width: 36rem">
    <h1 class="mb-2">Join the hangout</h1>
    <p class="text-secondary mb-4">Share when you are free so the group can pick a time.</p>

    <div v-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</div>

    <fieldset class="mb-4">
      <legend class="form-label fs-6">How do you want to share your availability?</legend>
      <div class="form-check mb-2">
        <input id="source-gcal" v-model="choice" class="form-check-input" type="radio" name="source" value="gcal" />
        <label class="form-check-label" for="source-gcal">
          Sync Google Calendar
          <span class="d-block small text-secondary">Only busy times for these dates are read. Event names and details are never shared.</span>
        </label>
      </div>
      <div class="form-check">
        <input id="source-grid" v-model="choice" class="form-check-input" type="radio" name="source" value="grid" />
        <label class="form-check-label" for="source-grid">
          Fill in a grid by hand
          <span class="d-block small text-secondary">Tap the times you are free.</span>
        </label>
      </div>
    </fieldset>

    <button type="button" class="btn btn-primary" :disabled="!choice || joining" @click="join">{{ joining ? 'Joining…' : 'Join' }}</button>
  </div>
</template>
