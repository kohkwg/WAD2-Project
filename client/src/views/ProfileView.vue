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
      <p class="profile-kicker">Your Bookedz account</p>
      <h1 class="profile-title">Your profile</h1>
      <p class="profile-lede">Keep your details current and shape the events you discover.</p>
    </header>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border" role="status"><span class="visually-hidden">Loading profile</span></div>
    </div>

    <form v-else-if="userId" class="profile-form" :aria-busy="saving" @submit.prevent="save">
      <div v-if="success" class="alert alert-success" role="status">{{ success }}</div>
      <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

      <fieldset class="profile-section" :disabled="saving" aria-describedby="profile-details-help">
        <legend>Make yourself at home</legend>
        <p id="profile-details-help" class="profile-help">A name to go by, and a starting point for nearby plans.</p>
        <div class="mb-4">
          <label for="name" class="form-label">Name</label>
          <input id="name" v-model="displayName" class="form-control" autocomplete="name" />
        </div>

        <div class="mb-3">
          <label for="postal" class="form-label">Postal code</label>
          <input id="postal" v-model="postalCode" class="form-control" inputmode="numeric"
                 maxlength="6" pattern="\d{6}" placeholder="e.g. 188065" autocomplete="postal-code" aria-describedby="postal-help" />
          <div id="postal-help" class="form-text">Optional. Used to find events near you.</div>
        </div>

      </fieldset>

      <fieldset class="profile-section profile-interests" :disabled="saving" aria-describedby="interests-help">
        <legend>Follow your interests</legend>
        <p id="interests-help" class="profile-help">Choose what you enjoy. Your picks improve as you RSVP to and attend events.</p>
        <p class="interest-count" role="status" aria-atomic="true">{{ selected.length }} {{ selected.length === 1 ? 'interest' : 'interests' }} selected</p>
        <div class="interest-options">
          <template v-for="i in INTEREST_OPTIONS" :key="i">
            <input :id="`int-${i}`" v-model="selected" type="checkbox" class="btn-check" :value="i" />
            <label :for="`int-${i}`" class="btn btn-outline-primary text-capitalize"><span class="interest-check" aria-hidden="true"></span>{{ i }}</label>
          </template>
        </div>
      </fieldset>

      <div class="profile-actions">
        <button type="submit" class="btn btn-primary" :disabled="saving">
          <span v-if="saving" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
          {{ saving ? 'Saving profile…' : 'Save profile' }}
        </button>
        <RouterLink to="/discover" class="btn btn-outline-secondary">Back to Discover</RouterLink>
        <p>Save your changes before heading back to explore.</p>
      </div>
    </form>

    <div v-else class="profile-unavailable alert alert-warning" :role="USING_SUPABASE ? 'alert' : 'status'">
      <p>{{ error }}</p>
      <button v-if="USING_SUPABASE" type="button" class="btn btn-outline-secondary" @click="loadProfile">Retry profile</button>
      <RouterLink v-else to="/discover" class="btn btn-outline-secondary">Explore demo events</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.profile-page { max-width: 760px; }
.profile-heading { max-width: 600px; margin-bottom: 2rem; }
.profile-kicker { margin: 0 0 .55rem; color: var(--bookedz-ink-soft, #62676b); font-size: .9rem; }
.profile-title { margin: 0; color: var(--bookedz-ink, #292d32); font: 500 clamp(2.2rem, 5vw, 3.25rem)/1.05 var(--bookedz-heading); letter-spacing: -.04em; }
.profile-lede { max-width: 48ch; margin: .85rem 0 0; color: var(--bookedz-ink-soft, #62676b); line-height: 1.6; }
.profile-form { padding: clamp(1.1rem, 4vw, 2rem); border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); background: var(--bookedz-surface); box-shadow: var(--bookedz-shadow); }
.profile-section { min-width: 0; margin: 0 0 1.75rem; padding: 0 0 1.5rem; border: 0; border-bottom: 1px solid var(--bookedz-border); }
.profile-section legend { float: none; width: auto; margin-bottom: .5rem; font-family: var(--bookedz-heading); font-size: 1.35rem; font-weight: 650; }
.profile-help { max-width: 55ch; margin-bottom: 1.25rem; color: var(--bookedz-muted); }
.profile-interests { padding-bottom: 0; border: 0; }
.interest-count { color: var(--bookedz-muted); font-size: .875rem; margin-bottom: .75rem; font-variant-numeric: tabular-nums; }
.interest-options { display: flex; flex-wrap: wrap; gap: .65rem; }
.interest-options label { gap: .6rem; text-align: left; overflow-wrap: anywhere; max-width: 100%; }
.interest-check { display: inline-block; flex: 0 0 1rem; width: 1rem; height: 1rem; border: 1px solid currentColor; border-radius: 50%; }
.btn-check:checked + label .interest-check::after { content: ''; display: block; width: .3rem; height: .55rem; margin: .1rem auto 0; border: solid currentColor; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.btn-check:checked + .btn-outline-primary { color: var(--bookedz-on-action); border-color: var(--bookedz-primary-dark); background: var(--bookedz-primary-dark); }
.btn-check:focus-visible + label { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 4px; box-shadow: var(--bookedz-focus-glow); }
.profile-actions { display: flex; flex-wrap: wrap; gap: .75rem; padding-top: 1.5rem; border-top: 1px solid var(--bookedz-border); }
.profile-actions p { flex-basis: 100%; margin: 0; font-size: .875rem; color: var(--bookedz-muted); }
.profile-unavailable,.profile-form .alert { overflow-wrap: anywhere; }
@media(max-width:575px) { .profile-actions .btn { flex: 1 1 100%; } }
</style>
