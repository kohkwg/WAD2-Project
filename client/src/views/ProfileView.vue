<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { USING_SUPABASE, changePassword } from '@/utils/api'
import { cleanUsername, nameError, usernameError as usernameFormatError, postalCodeError } from '@/lib/fieldRules'
import { profileLabel } from '@/lib/profileLabel'
import { geocodePostalCode } from '@/lib/onemap'
import { INTEREST_OPTIONS } from '@/lib/constants'
import { passwordErrors } from '@/lib/passwordRules'
import PasswordInput from '@/components/ui/PasswordInput.vue'
import { usernameAvailable as checkUsernameFree } from '@/lib/usernameAvailability'
import DeleteAccount from '@/components/profile/DeleteAccount.vue'
import DinoPicker from '@/components/profile/DinoPicker.vue'

defineProps({ embedded: { type: Boolean, default: false } })

const route = useRoute()
const userId = ref(null)
const displayName = ref('')
const username = ref('')
const usernameError = ref('')
const usernameAvailable = ref(true)
const postalCode = ref('')
const email = ref('')
const touched = ref({ name: false, username: false, postal: false })
const triedSave = ref(false)
const editing = ref(false)
// Password change opens inline, in the same grid as the other fields
const passwordOpen = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordTried = ref(false)
const passwordServerError = ref('')
const passwordBanner = ref('') // failures that are not about one field (e.g. network)
const usernameState = ref('idle') // 'idle' | 'checking' | 'available' | 'taken'
let usernameTimer
const passwordBusy = ref(false)
let snapshot = null
const selected = ref([])          // interest names the user ticks
// The chosen mascot lives in the account's metadata, so no database change is needed.
const dino = ref('')
const dinoSaving = ref(false)
const dinoError = ref('')

const loading = ref(true)
const saving = ref(false)
const success = ref('')
const error = ref('')

let active = true
onBeforeUnmount(() => { active = false; clearTimeout(usernameTimer) })
// While editing, show whether the typed username is free (your own current one counts as free).
watch(username, handle => {
  clearTimeout(usernameTimer)
  usernameState.value = 'idle'
  const clean = cleanUsername(handle)
  if (!editing.value || !usernameAvailable.value || clean === (snapshot?.username ?? '') || usernameFormatError(clean)) return
  usernameState.value = 'checking'
  usernameTimer = setTimeout(async () => {
    const free = await checkUsernameFree(clean)
    if (clean !== cleanUsername(username.value)) return
    usernameState.value = free === true ? 'available' : free === false ? 'taken' : 'idle'
  }, 450)
})
async function chooseDino(id) {
  const previous = dino.value
  dino.value = id
  dinoSaving.value = true
  dinoError.value = ''
  try {
    const { error: dinoFailure } = await supabase.auth.updateUser({ data: { dino: id } })
    if (dinoFailure) throw dinoFailure
  } catch (failure) {
    dino.value = previous
    dinoError.value = failure.message || 'Could not save your dino.'
  } finally {
    dinoSaving.value = false
  }
}
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
    const columns = 'id, display_name, postal_code, profile_interests(interests(slug))'
    let { data, error: profileError } = await supabase.from('profiles')
      .select(`username, ${columns}`).eq('id', auth.user.id).maybeSingle()
    if (!active) return
    // Older live schemas can still load existing details without the new column.
    usernameAvailable.value = true
    if (profileError && ['42703', 'PGRST204'].includes(profileError.code) && /username/i.test(profileError.message || '')) {
      usernameAvailable.value = false
      ;({ data, error: profileError } = await supabase.from('profiles')
        .select(columns).eq('id', auth.user.id).maybeSingle())
    }
    if (profileError) throw profileError
    if (!active) return
    if (!data) throw new Error('Your profile could not be found. Please contact the organiser.')
    userId.value = auth.user.id
    email.value = auth.user.email || ''
    displayName.value = data.display_name || ''
    dino.value = auth.user.user_metadata?.dino || ''
    username.value = data.username || ''
    profileLabel.value = { username: username.value, displayName: data.display_name || '' }
    // The username picked on Create account travels in the account's metadata. If it could not be
    // saved at that moment (email confirmation, or a slow first sign-in), claim it now.
    const chosen = String(auth.user.user_metadata?.username || '').trim().toLowerCase()
    if (!data.username && usernameAvailable.value && /^[a-z0-9_]{3,20}$/.test(chosen)) {
      const { error: claimError } = await supabase.from('profiles').update({ username: chosen }).eq('id', auth.user.id)
      if (!claimError) username.value = chosen
      else if (claimError.code === '23505') usernameError.value = 'The username you chose when signing up is already taken. Choose another in Account, below.'
    }
    // Sent here by Create account when the chosen username was already taken.
    if (route.query.username === 'taken') usernameError.value = 'That username is already taken. Choose another.'
    postalCode.value = data.postal_code || ''
    selected.value = (data.profile_interests || []).map(link => link.interests.slug)
      .filter(interest => INTEREST_OPTIONS.includes(interest))
  } catch (failure) {
    if (active) error.value = ['PGRST204', '42703'].includes(failure.code)
      ? 'Username setup is not available yet. Please ask the team to finish the database setup.'
      : failure.message || 'Could not load your profile.'
  } finally {
    if (active) loading.value = false
  }
}
onMounted(loadProfile)

function startEdit() {
  snapshot = { displayName: displayName.value, username: username.value, postalCode: postalCode.value, selected: [...selected.value] }
  touched.value = { name: false, username: false, postal: false }
  triedSave.value = false
  success.value = ''
  error.value = ''
  usernameError.value = ''
  editing.value = true
}
function cancelEdit() {
  if (snapshot) {
    displayName.value = snapshot.displayName
    username.value = snapshot.username
    postalCode.value = snapshot.postalCode
    selected.value = [...snapshot.selected]
  }
  usernameError.value = ''
  error.value = ''
  editing.value = false
}
const initial = () => (displayName.value || username.value || email.value || '?').trim().charAt(0).toUpperCase()

// ---- Validation: shown once a field has been left or Save was pressed, and cleared as it is fixed
const fieldErrors = computed(() => ({
  name: nameError(displayName.value),
  username: usernameAvailable.value
    ? (usernameFormatError(username.value) || (usernameState.value === 'taken' ? 'This username is already taken.' : ''))
    : '',
  postal: postalCodeError(postalCode.value),
}))
const visible = field => triedSave.value || touched.value[field]
const nameMessage = computed(() => (visible('name') ? fieldErrors.value.name : ''))
const usernameMessage = computed(() => usernameError.value || (visible('username') ? fieldErrors.value.username : ''))
const postalMessage = computed(() => (visible('postal') ? fieldErrors.value.postal : ''))

// ---- Unsaved changes: nothing is sent if nothing changed, and leaving mid-edit asks first
const hasChanges = computed(() => Boolean(snapshot) && (
  displayName.value.trim() !== snapshot.displayName.trim()
  || cleanUsername(username.value) !== cleanUsername(snapshot.username)
  || postalCode.value.trim() !== snapshot.postalCode.trim()
  || [...selected.value].sort().join() !== [...snapshot.selected].sort().join()
))
const isDirty = computed(() => editing.value && hasChanges.value)
function warnBeforeUnload(event) { if (isDirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))
onBeforeRouteLeave(() => (isDirty.value ? window.confirm('You have unsaved changes. Leave without saving?') : true))

// ---- Change password (inline, saved separately from the profile)
const passwordErrorsNow = computed(() => ({
  current: currentPassword.value ? '' : 'Current password is required.',
  next: newPassword.value === '' ? 'New password is required.'
    : passwordErrors(newPassword.value)[0]
      || (newPassword.value === currentPassword.value ? 'Your new password must be different from the current one.' : ''),
  confirm: confirmPassword.value === '' ? 'Please confirm your new password.'
    : confirmPassword.value !== newPassword.value ? 'Passwords do not match.' : '',
}))
const currentPasswordMessage = computed(() => (passwordTried.value ? passwordErrorsNow.value.current : '') || passwordServerError.value)
const newPasswordMessage = computed(() => (passwordTried.value ? passwordErrorsNow.value.next : ''))
const confirmPasswordMessage = computed(() => (passwordTried.value ? passwordErrorsNow.value.confirm : ''))

function togglePassword() {
  passwordOpen.value = !passwordOpen.value
  currentPassword.value = newPassword.value = confirmPassword.value = ''
  passwordTried.value = false
  passwordServerError.value = ''
  passwordBanner.value = ''
}
async function savePassword() {
  if (passwordBusy.value) return
  passwordTried.value = true
  passwordServerError.value = ''
  passwordBanner.value = ''
  if (Object.values(passwordErrorsNow.value).some(Boolean)) return
  passwordBusy.value = true
  try {
    await changePassword(currentPassword.value, newPassword.value)
    togglePassword() // clears the three boxes
    success.value = 'Password updated successfully.'
  } catch (failure) {
    // A wrong current password belongs under that field; anything else (e.g. network) is a banner.
    if (/current password is incorrect/i.test(failure.message)) passwordServerError.value = failure.message
    else passwordBanner.value = failure.message
  } finally {
    passwordBusy.value = false
  }
}

async function save() {
  if (saving.value || !userId.value) return
  triedSave.value = true
  success.value = ''
  error.value = ''
  usernameError.value = ''
  if (Object.values(fieldErrors.value).some(Boolean)) return
  // Nothing changed: no request, just leave edit mode.
  if (!hasChanges.value) { editing.value = false; return }
  const handle = cleanUsername(username.value)
  saving.value = true
  try {
    let lat = null, lng = null
    if (postalCode.value.trim()) {
      ;({ lat, lng } = await geocodePostalCode(postalCode.value.trim()))
    }

    if (!active) return

    // One transaction saves details and replaces only explicit interest links.
    const payload = {
      p_display_name: displayName.value.trim(),
      p_postal_code: postalCode.value.trim() || null,
      p_lat: lat, p_lng: lng, p_interests: [...selected.value],
    }
    const { error: err } = usernameAvailable.value
      ? await supabase.rpc('update_profile_with_username', { ...payload, p_username: handle })
      : await supabase.rpc('update_recommendation_profile', payload)
    if (!active) return
    if (err) throw err
    username.value = handle
    displayName.value = displayName.value.trim()
    profileLabel.value = { username: handle, displayName: displayName.value }

    success.value = 'Profile updated successfully.'
    editing.value = false
  } catch (e) {
    if (!active) return
    // Stay in edit mode with everything the person typed still in place.
    if (e.code === '23505') usernameError.value = 'This username is already taken.'
    else if (['PGRST202', 'PGRST204', '42703', '42883'].includes(e.code)) error.value = usernameAvailable.value
      ? 'Username saving is not available yet. Your changes are kept; please try again after account updates are available.'
      : 'Profile saving is temporarily unavailable. Your changes are kept; please try again later.'
    else error.value = /failed to fetch|network/i.test(e.message || '')
      ? 'Could not reach the server. Your changes are kept here; check your connection and try again.'
      : e.message || 'Could not save your profile. Your changes are kept; please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="profile-page" :class="{ 'container py-4 py-md-5': !embedded, 'profile-page--embedded': embedded }">
    <header v-if="!embedded" class="profile-heading">
      <p class="profile-kicker">Your Dino account</p>
      <h1 class="profile-title page-title">Your profile</h1>
      <p class="profile-lede">Keep your details current and shape the events you discover.</p>
    </header>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border" role="status"><span class="visually-hidden">Loading profile</span></div>
    </div>

    <form v-else-if="userId" class="profile-form" :aria-busy="saving" @submit.prevent="save">
      <div v-dismissible v-if="success" class="alert alert-success" role="status">{{ success }}</div>
      <div v-dismissible v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

      <section class="profile-section" aria-labelledby="dino-heading">
        <h2 id="dino-heading" class="profile-section-title">Pick your dino</h2>
        <p class="profile-help">Your mascot shows next to your name. Change it any time.</p>
        <DinoPicker :model-value="dino" :disabled="dinoSaving" @update:model-value="chooseDino" />
        <p v-dismissible v-if="dinoError" class="text-danger mt-2 mb-0" role="alert">{{ dinoError }}</p>
      </section>

      <div class="profile-summary" :class="{ 'is-viewing': !editing }">
      <div class="profile-top">
        <span class="profile-avatar" aria-hidden="true">{{ initial() }}</span>
        <div class="profile-id">
          <h2 class="profile-name">{{ displayName || 'No name yet' }}</h2>
          <template v-if="!editing">
            <p v-if="usernameAvailable" class="profile-handle">{{ username ? `@${username}` : 'No username yet' }}</p>
            <p class="profile-email">{{ email }}</p>
            <p class="profile-postal">Postal code: {{ postalCode || 'not set' }}</p>
          </template>
        </div>
        <button v-if="!editing" type="button" class="btn btn-outline-secondary btn-sm profile-edit" @click="startEdit">Edit profile</button>
      </div>

      <!-- View mode: interests as chips -->
      <div v-if="!editing" class="profile-block">
        <h3 class="profile-block-title">Interests</h3>
        <p v-if="!selected.length" class="profile-empty">No interests yet. Add some to get better event suggestions.</p>
        <ul v-else class="profile-chips"><li v-for="i in selected" :key="i" class="text-capitalize">{{ i }}</li></ul>
      </div>

      <!-- Edit mode: the same details become inputs -->
      <template v-else>
        <fieldset class="profile-section" :disabled="saving">
          <legend class="visually-hidden">Your details</legend>
          <div class="row g-4 profile-details-grid">
            <div class="col-12 col-md-6 col-xl-4">
              <label for="name" class="form-label">Name</label>
              <input id="name" v-model="displayName" class="form-control" :class="{ 'is-invalid': nameMessage }" autocomplete="name" :aria-invalid="Boolean(nameMessage)" aria-describedby="name-error" @blur="touched.name = true" />
              <p v-if="nameMessage" id="name-error" class="field-error" role="alert">{{ nameMessage }}</p>
            </div>
            <div class="col-12 col-md-6 col-xl-4">
              <label for="username" class="form-label">Username</label>
              <div class="input-group" :class="{ 'has-validation': usernameMessage }">
                <span class="input-group-text" aria-hidden="true">@</span>
                <input id="username" v-model="username" class="form-control" :class="{ 'is-invalid': usernameMessage }" autocomplete="username" :disabled="!usernameAvailable"
                       autocapitalize="none" :spellcheck="false" maxlength="21"
                       aria-describedby="username-help username-error" :aria-invalid="Boolean(usernameMessage)"
                       @blur="touched.username = true" @input="usernameError = ''; success = ''" />
              </div>
              <p v-if="usernameMessage" id="username-error" class="field-error" role="alert">{{ usernameMessage }}</p>
              <p v-else-if="usernameState === 'checking'" class="profile-note mb-0" role="status">Checking…</p>
              <p v-else-if="usernameState === 'available'" class="profile-ok mb-0" role="status">✓ @{{ cleanUsername(username) }} is available</p>
              <div v-if="usernameAvailable" id="username-help" class="form-text">3–20 letters, numbers or underscores. People find you by it.</div>
              <div v-else id="username-help" class="form-text">Username setup is coming soon.</div>
            </div>
            <div class="col-12 col-md-6 col-xl-4">
              <label for="email" class="form-label">Email</label>
              <input id="email" :value="email" type="email" class="form-control" readonly aria-describedby="email-help" />
              <div id="email-help" class="form-text">Your email is your sign-in and cannot be edited here.</div>
            </div>
            <div class="col-12 col-xl-4">
              <label for="postal" class="form-label">Postal code</label>
              <input id="postal" v-model="postalCode" class="form-control" :class="{ 'is-invalid': postalMessage }" inputmode="numeric"
                     maxlength="6" placeholder="e.g. 188065" autocomplete="postal-code" aria-describedby="postal-help postal-error" :aria-invalid="Boolean(postalMessage)" @blur="touched.postal = true" />
              <p v-if="postalMessage" id="postal-error" class="field-error" role="alert">{{ postalMessage }}</p>
              <div id="postal-help" class="form-text">Optional. Used to find events near you.</div>
            </div>
          </div>
        </fieldset>

        <fieldset class="profile-section profile-interests" :disabled="saving" aria-describedby="interests-help">
          <legend>Interests</legend>
          <p id="interests-help" class="profile-help">Choose what you enjoy. Your picks improve as you RSVP to and attend events.</p>
          <p class="interest-count" role="status" aria-atomic="true">{{ selected.length }} {{ selected.length === 1 ? 'interest' : 'interests' }} selected</p>
          <div class="interest-options">
            <template v-for="i in INTEREST_OPTIONS" :key="i">
              <input :id="`int-${i}`" v-model="selected" type="checkbox" class="btn-check" :value="i" />
              <label :for="`int-${i}`" class="btn btn-outline-primary text-capitalize"><span class="interest-check" aria-hidden="true"></span>{{ i }}</label>
            </template>
          </div>
        </fieldset>
      </template>
      </div>

      <div class="profile-block">
        <div class="profile-password">
          <h3 class="profile-block-title">Password</h3>
          <button type="button" class="btn btn-outline-secondary btn-sm" :aria-expanded="passwordOpen" aria-controls="password-fields" @click="togglePassword">{{ passwordOpen ? 'Cancel' : 'Change password' }}</button>
        </div>
        <!-- Not a nested form: Enter here saves the password, not the whole profile -->
        <div v-if="passwordOpen" id="password-fields" class="password-fields">
          <div class="row g-3">
            <div class="col-12">
              <label for="current-password" class="form-label">Current password</label>
              <PasswordInput id="current-password" v-model="currentPassword" :class="{ 'is-invalid': currentPasswordMessage }" autocomplete="current-password" :aria-invalid="Boolean(currentPasswordMessage)" aria-describedby="current-password-msg" @keydown.enter.prevent="savePassword" @input="passwordServerError = ''" />
              <p v-if="currentPasswordMessage" id="current-password-msg" class="field-error" role="alert">{{ currentPasswordMessage }}</p>
            </div>
            <div class="col-12">
              <label for="new-password-field" class="form-label">New password</label>
              <PasswordInput id="new-password-field" v-model="newPassword" :class="{ 'is-invalid': newPasswordMessage }" autocomplete="new-password" :aria-invalid="Boolean(newPasswordMessage)" aria-describedby="new-password-msg" @keydown.enter.prevent="savePassword" />
              <p v-if="newPasswordMessage" id="new-password-msg" class="field-error" role="alert">{{ newPasswordMessage }}</p>
            </div>
            <div class="col-12">
              <label for="confirm-password" class="form-label">Confirm new password</label>
              <PasswordInput id="confirm-password" v-model="confirmPassword" :class="{ 'is-invalid': confirmPasswordMessage }" autocomplete="new-password" :aria-invalid="Boolean(confirmPasswordMessage)" aria-describedby="confirm-password-msg" @keydown.enter.prevent="savePassword" />
              <p v-if="confirmPasswordMessage" id="confirm-password-msg" class="field-error" role="alert">{{ confirmPasswordMessage }}</p>
            </div>
          </div>
          <div v-if="passwordBanner" class="alert alert-danger mt-3" role="alert">{{ passwordBanner }}</div>
          <button type="button" class="btn btn-primary mt-3" :disabled="passwordBusy" @click="savePassword">
            <span v-if="passwordBusy" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            Save password
          </button>
        </div>
      </div>

      <div v-if="editing" class="profile-actions">
        <button type="submit" class="btn btn-primary" :disabled="saving">
          <span v-if="saving" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="cancelEdit">Cancel</button>
      </div>
    </form>

    <div v-dismissible v-else class="profile-unavailable alert alert-warning" :role="USING_SUPABASE ? 'alert' : 'status'">
      <p>{{ error }}</p>
      <button v-if="USING_SUPABASE" type="button" class="btn btn-outline-secondary" @click="loadProfile">Retry profile</button>
      <RouterLink v-else to="/discover" class="btn btn-outline-secondary">Explore demo events</RouterLink>
    </div>
    <DeleteAccount v-if="userId" />
  </div>
</template>

<style scoped>
.profile-page { max-width: 760px; }
.profile-page--embedded { width: 100%; max-width: none; }
.profile-heading { max-width: 600px; margin-bottom: 2rem; }
.profile-kicker { margin: 0 0 .55rem; color: var(--bookedz-ink-soft, #636975); font-size: .9rem; }
.profile-title { margin: 0; color: var(--bookedz-ink, #1f2937); }
.profile-lede { max-width: 48ch; margin: .85rem 0 0; color: var(--bookedz-ink-soft, #636975); line-height: 1.6; }
.profile-form { padding: clamp(1.1rem, 4vw, 2rem); border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); background: var(--bookedz-surface); box-shadow: var(--bookedz-shadow); }
.profile-summary { display: block; }
@media (min-width: 992px) {
  .profile-summary.is-viewing { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 2rem; align-items: start; }
  .profile-summary.is-viewing > .profile-block { height: 100%; padding: 0 0 0 2rem; border-top: 0; border-left: 1px solid var(--bookedz-border); }
}
.profile-top { display: flex; align-items: flex-start; gap: 1rem; padding-bottom: 1.25rem; }
.profile-avatar { display: grid; place-items: center; flex: none; width: 56px; height: 56px; border-radius: 50%; background: var(--bookedz-orange-soft, var(--bookedz-glass-active)); color: var(--bookedz-ink); font: 700 1.4rem var(--bookedz-heading); }
.profile-id { flex: 1; min-width: 0; }
.profile-name { margin: 0; font-family: var(--bookedz-heading); font-size: 1.5rem; font-weight: 700; overflow-wrap: anywhere; }
.profile-handle, .profile-email, .profile-postal { margin: .15rem 0 0; color: var(--bookedz-muted); overflow-wrap: anywhere; }
.profile-handle { color: var(--bookedz-primary-dark); font-weight: 600; }
.profile-link { padding: 0; border: 0; background: transparent; color: var(--bookedz-primary-dark); font-size: .85rem; font-weight: 600; text-decoration: underline; text-underline-offset: .2em; }
.profile-block { padding: 1.1rem 0; border-top: 1px solid var(--bookedz-border); }
.profile-block-title { margin: 0 0 .5rem; font-family: var(--bookedz-heading); font-size: 1.1rem; font-weight: 650; }
.profile-password { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.password-fields { max-width: 28rem; margin-top: 1rem; }
.profile-password .profile-block-title { margin: 0; }
.field-error { margin: .35rem 0 0; color: var(--bookedz-danger); font-size: .875rem; overflow-wrap: anywhere; }
:deep(.form-control.is-invalid) { background-image: none; }
.profile-note { color: var(--bookedz-muted); font-size: .875rem; }
.profile-ok { color: var(--bookedz-success); font-size: .875rem; }
.profile-empty { margin: 0; color: var(--bookedz-muted); }
.profile-chips { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0; padding: 0; list-style: none; }
.profile-chips li { padding: .3rem .85rem; border-radius: 99px; background: var(--bookedz-orange-soft, var(--bookedz-glass-active)); color: var(--bookedz-ink); font-size: .9rem; font-weight: 600; }
.profile-section { min-width: 0; margin: 0 0 1.75rem; padding: 0 0 1.5rem; border: 0; border-bottom: 1px solid var(--bookedz-border); }
.profile-section legend, .profile-section-title { float: none; width: auto; margin-bottom: .5rem; font-family: var(--bookedz-heading); font-size: 1.35rem; font-weight: 650; }
.profile-section legend, .profile-section .form-label { color: var(--bookedz-ink, #1f2937); }
.profile-help { max-width: 55ch; margin-bottom: 1.25rem; color: var(--bookedz-muted); }
.profile-interests { padding-bottom: 0; border: 0; }
.interest-count { color: var(--bookedz-muted); font-size: .875rem; margin-bottom: .75rem; font-variant-numeric: tabular-nums; }
.interest-options { display: flex; flex-wrap: wrap; gap: .65rem; }
.interest-options label { gap: .6rem; text-align: left; overflow-wrap: anywhere; max-width: 100%; }
.interest-check { display: inline-block; flex: 0 0 1rem; width: 1rem; height: 1rem; border: 1px solid currentColor; border-radius: 50%; }
.btn-check:checked + label .interest-check::after { content: ''; display: block; width: .3rem; height: .55rem; margin: .1rem auto 0; border: solid currentColor; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.btn-check:checked + .btn-outline-primary { color: var(--bookedz-on-action); border-color: var(--bookedz-primary); background: var(--bookedz-primary); }
.btn-check:focus-visible + label { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 4px; box-shadow: var(--bookedz-focus-glow); }
.profile-actions { display: flex; flex-wrap: wrap; gap: .75rem; padding-top: 1.5rem; border-top: 1px solid var(--bookedz-border); }
.profile-actions p { flex-basis: 100%; margin: 0; font-size: .875rem; color: var(--bookedz-muted); }
.profile-unavailable,.profile-form .alert { overflow-wrap: anywhere; }
@media(max-width:575px) { .profile-actions .btn { flex: 1 1 100%; } }
</style>
