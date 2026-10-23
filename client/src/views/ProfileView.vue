<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { geocodePostalCode } from '@/lib/onemap'
import { INTEREST_OPTIONS } from '@/lib/constants'

const userId = ref(null)
const displayName = ref('')
const postalCode = ref('')
const selected = ref([])          // interest names the user ticks
const existingWeights = ref({})   // keep adapted weights for interests that stay selected

const loading = ref(true)
const saving = ref(false)
const success = ref('')
const error = ref('')

onMounted(async () => {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) { error.value = 'Please log in to edit your profile.'; loading.value = false; return }
  userId.value = auth.user.id

  const { data } = await supabase.from('profiles').select('*').eq('id', userId.value).maybeSingle()
  if (data) {
    displayName.value = data.display_name || ''
    postalCode.value = data.postal_code || ''
    existingWeights.value = data.interest_weights || {}
    selected.value = Object.keys(existingWeights.value).filter((i) => INTEREST_OPTIONS.includes(i))
  }
  loading.value = false
})

async function save() {
  success.value = ''
  error.value = ''
  saving.value = true
  try {
    let lat = null, lng = null
    if (postalCode.value.trim()) {
      ;({ lat, lng } = await geocodePostalCode(postalCode.value.trim()))
    }

    // Keep learned weights for kept interests; new interests start at 1; removed ones are dropped
    const weights = {}
    for (const i of selected.value) weights[i] = existingWeights.value[i] || 1

    // update, not upsert: the sign-up trigger creates the row, and RLS only lets a user
    // update their own profile (there is no INSERT policy)
    const { error: err } = await supabase.from('profiles').update({
      display_name: displayName.value.trim(),
      postal_code: postalCode.value.trim() || null,
      lat, lng,
      interest_weights: weights,
    }).eq('id', userId.value)
    if (err) throw err

    existingWeights.value = weights
    success.value = 'Profile saved.'
  } catch (e) {
    error.value = e.message || 'Could not save your profile.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="container py-4" style="max-width: 640px">
    <h1 class="h3 mb-4">Your profile</h1>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border" role="status"><span class="visually-hidden">Loading profile</span></div>
    </div>

    <form v-else-if="userId" @submit.prevent="save">
      <div v-if="success" class="alert alert-success" role="status">{{ success }}</div>
      <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

      <div class="mb-3">
        <label for="name" class="form-label">Name</label>
        <input id="name" v-model="displayName" class="form-control" autocomplete="name" />
      </div>

      <div class="mb-3">
        <label for="postal" class="form-label">Postal code</label>
        <input id="postal" v-model="postalCode" class="form-control" inputmode="numeric"
               maxlength="6" pattern="\d{6}" placeholder="e.g. 188065" autocomplete="postal-code" />
        <div class="form-text">Used to show events near you. Only the area is used for ranking.</div>
      </div>

      <fieldset class="mb-4">
        <legend class="form-label fs-6">Interests</legend>
        <div class="d-flex flex-wrap gap-2">
          <template v-for="i in INTEREST_OPTIONS" :key="i">
            <input :id="`int-${i}`" v-model="selected" type="checkbox" class="btn-check" :value="i" />
            <label :for="`int-${i}`" class="btn btn-outline-primary btn-sm text-capitalize">{{ i }}</label>
          </template>
        </div>
        <div class="form-text">Your picks improve as you RSVP to and attend events.</div>
      </fieldset>

      <button class="btn btn-primary" :disabled="saving">
        <span v-if="saving" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
        Save profile
      </button>
    </form>

    <div v-else class="alert alert-warning">{{ error }}</div>
  </div>
</template>
