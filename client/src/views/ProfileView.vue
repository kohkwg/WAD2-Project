<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { supabase } from '@/lib/supabase'
import { USING_SUPABASE } from '@/utils/api'
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

let active = true
onBeforeUnmount(() => { active = false })
async function loadProfile() {
  loading.value = true
  error.value = ''
  if (!USING_SUPABASE) {
    error.value = 'Profile editing requires live mode. Demo events are available in Discover.'
    loading.value = false
    return
  }
  try {
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!active) return
    if (!auth.user) throw new Error('Please log in to edit your profile.')
    const { data, error: profileError } = await supabase.from('profiles').select('*').eq('id', auth.user.id).maybeSingle()
    if (profileError) throw profileError
    if (!active) return
    if (!data) throw new Error('Your profile could not be found. Please contact the organiser.')
    userId.value = auth.user.id
    displayName.value = data.display_name || ''
    postalCode.value = data.postal_code || ''
    existingWeights.value = data.interest_weights || {}
    selected.value = Object.keys(existingWeights.value).filter(i => INTEREST_OPTIONS.includes(i))
  } catch (failure) {
    if (active) error.value = failure.message || 'Could not load your profile.'
  } finally {
    if (active) loading.value = false
  }
}
onMounted(loadProfile)

async function save() {
  if (saving.value || !userId.value) return
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
    }).eq('id', userId.value).select('id').single()
    if (!active) return
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
  <div class="container profile-page py-4 py-md-5">
    <header class="profile-heading">
      <p class="profile-kicker">Your OpenJio account</p>
      <h1 class="profile-title">Your profile</h1>
      <p class="profile-lede">Keep your details current and shape the events you discover.</p>
    </header>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border" role="status"><span class="visually-hidden">Loading profile</span></div>
    </div>

    <form v-else-if="userId" class="profile-form" @submit.prevent="save">
      <div v-if="success" class="alert alert-success" role="status">{{ success }}</div>
      <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

      <section class="profile-section">
        <div class="mb-4">
          <label for="name" class="form-label">Name</label>
          <input id="name" v-model="displayName" class="form-control" autocomplete="name" />
        </div>

        <div class="mb-3">
          <label for="postal" class="form-label">Postal code</label>
          <input id="postal" v-model="postalCode" class="form-control" inputmode="numeric"
                 maxlength="6" pattern="\d{6}" placeholder="e.g. 188065" autocomplete="postal-code" />
          <div class="form-text">Used to show events near you. Only the area is used for ranking.</div>
        </div>

      </section>

      <fieldset class="profile-section profile-interests mb-4">
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

    <div v-else class="alert alert-warning" :role="USING_SUPABASE ? 'alert' : 'status'">{{ error }}<button v-if="USING_SUPABASE" type="button" class="btn btn-outline-secondary btn-sm ms-2" @click="loadProfile">Retry profile</button></div>
  </div>
</template>

<style scoped>
.profile-page { max-width: 760px; }
.profile-heading { max-width: 600px; margin-bottom: 2rem; }
.profile-kicker { margin: 0 0 .55rem; color: var(--bookedz-ink-soft, #62676b); font-size: .9rem; }
.profile-title { margin: 0; color: var(--bookedz-ink, #292d32); font: 500 clamp(2.2rem, 5vw, 3.25rem)/1.05 var(--bookedz-heading); letter-spacing: -.04em; }
.profile-lede { max-width: 48ch; margin: .85rem 0 0; color: var(--bookedz-ink-soft, #62676b); line-height: 1.6; }
.profile-form { padding: clamp(1.1rem, 4vw, 2rem); border: 1px solid var(--bookedz-border, #e5ded2); border-radius: 22px; background: #fffdf9; box-shadow: 0 14px 36px rgba(41, 45, 50, .06); }
.profile-section { margin-bottom: 1.4rem; padding-bottom: 1.25rem; border-bottom: 1px solid var(--bookedz-border, #e5ded2); }
.profile-interests { border: 0; padding-bottom: 0; }
:deep(.form-control) { min-height: 46px; border-color: var(--bookedz-border, #e5ded2); border-radius: 11px; }
:deep(.form-control:focus) { border-color: var(--bookedz-primary, #e9725c); box-shadow: 0 0 0 .2rem rgba(233, 114, 92, .18); }
:deep(.btn-check:checked + .btn-outline-primary) { color: #fff; border-color: var(--bookedz-primary-dark, #aa3e2c); background: var(--bookedz-primary-dark, #aa3e2c); }
:deep(.btn-primary) { border-color: var(--bookedz-primary-dark, #aa3e2c); background: var(--bookedz-primary-dark, #aa3e2c); }
:deep(:focus-visible) { outline: 3px solid #292d32; outline-offset: 3px; }
</style>
