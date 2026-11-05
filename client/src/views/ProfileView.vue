<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { USING_SUPABASE, changePassword } from '@/utils/api'
import {
  cleanUsername,
  nameError,
  usernameError as usernameFormatError,
  postalCodeError,
} from '@/lib/fieldRules'
import { profileLabel } from '@/lib/profileLabel'
import { geocodePostalCode } from '@/lib/onemap'
import { INTEREST_OPTIONS } from '@/lib/constants'
import { passwordErrors } from '@/lib/passwordRules'
import { usernameAvailable as checkUsernameFree } from '@/lib/usernameAvailability'
import PasswordInput from '@/components/ui/PasswordInput.vue'
import DeleteAccount from '@/components/profile/DeleteAccount.vue'
import DinoPicker from '@/components/profile/DinoPicker.vue'

defineProps({ embedded: { type: Boolean, default: false } })
// Wait this long (ms) after typing stops before checking the username
const USERNAME_CHECK_DELAY = 450
// Database error codes this page knows how to handle
const UNIQUE_VIOLATION = '23505' // the value already exists, e.g. username taken
const MISSING_COLUMN_CODES = ['42703', 'PGRST204'] // the column is not in the database yet
const SAVE_UNAVAILABLE_CODES = ['PGRST202', 'PGRST204', '42703', '42883'] // column or function missing
const route = useRoute()
// ---- State
// Profile details
const userId = ref(null)
const displayName = ref('')
const username = ref('')
const postalCode = ref('')
const email = ref('')
const selected = ref([]) // the interests the user has ticked
// Dino (saved in the user's account data, not in the profiles table)
const dino = ref('')
const dinoSaving = ref(false)
const dinoError = ref('')
// Username checking
const usernameError = ref('')
const usernameAvailable = ref(true) // false if the database has no username column yet
const usernameState = ref('idle') // 'idle' | 'checking' | 'available' | 'taken'
// Edit mode
const editing = ref(false)
const touched = ref({ name: false, username: false, postal: false }) // fields the user has left
const triedSave = ref(false) // true once Save has been pressed

// Change password (opens inside the page)
const passwordOpen = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordTried = ref(false)
const passwordBusy = ref(false)
const passwordServerError = ref('') // error shown under the "current password" box
const passwordBanner = ref('') // other errors, e.g. no internet
// Page status
const loading = ref(true)
const saving = ref(false)
const success = ref('')
const error = ref('')
let usernameTimer // the waiting timer for the username check
let snapshot = null // a copy of the details taken when Edit is pressed
let active = true // becomes false when the page is closed, so late replies are ignored

// ---- Values worked out from the state
// The first letter shown in the avatar circle
const initial = computed(() => {
  return (displayName.value || username.value || email.value || '?').trim().charAt(0).toUpperCase()
})
const handleText = computed(() => {
  return username.value ? `@${username.value}` : 'No username yet'
})

const interestCountLabel = computed(() => {
  const noun = selected.value.length === 1 ? 'interest' : 'interests'
  return `${selected.value.length} ${noun} selected`
})

// ---- Username check
// Turn the result of the username check into a state word
function availabilityState(free) {
  if (free === true) return 'available'
  if (free === false) return 'taken'
  return 'idle' // the check could not tell us
}

// Checks if the typed username is free, while the user is editing.
// It waits a moment after typing stops, so we do not ask the database on every key.
watch(username, (handle) => {
  // Step 1: cancel the previous check and start again
  clearTimeout(usernameTimer)
  usernameState.value = 'idle'
  const clean = cleanUsername(handle)
  const unchanged = clean === (snapshot?.username ?? '')
  // Step 2: skip the check when it is not needed
  // (not editing, usernames not supported, same as the current one, or wrongly formatted)
  if (!editing.value || !usernameAvailable.value || unchanged || usernameFormatError(clean)) {
    return
  }
  // Step 3: wait, then ask the database
  usernameState.value = 'checking'
  usernameTimer = setTimeout(async () => {
    const free = await checkUsernameFree(clean)
    // The user kept typing while we were checking, so this answer is out of date
    if (clean !== cleanUsername(username.value)) {
      return
    }
    usernameState.value = availabilityState(free)
  }, USERNAME_CHECK_DELAY)
})
// Clear old messages when the user types in the username box
function onUsernameInput() {
  usernameError.value = ''
  success.value = ''
}
// Save the chosen dino. If saving fails, go back to the old one.
async function chooseDino(id) {
  const previous = dino.value
  dino.value = id
  dinoSaving.value = true
  dinoError.value = ''
  try {
    const { error: dinoFailure } = await supabase.auth.updateUser({ data: { dino: id } })
    if (dinoFailure) {
      throw dinoFailure
    }
  } catch (failure) {
    dino.value = previous
    dinoError.value = failure.message || 'Could not save your dino.'
  } finally {
    dinoSaving.value = false
  }
}

// ---- Load the profile
// True when the database has no username column yet (an older version of the database)
function isMissingUsernameColumn(failure) {
  return (
    failure && MISSING_COLUMN_CODES.includes(failure.code) && /username/i.test(failure.message || '')
  )
}
function loadErrorMessage(failure) {
  if (MISSING_COLUMN_CODES.includes(failure.code)) {
    return 'Username setup is not available yet. Please ask the team to finish the database setup.'
  }
  return failure.message || 'Could not load your profile.'
}

// Put the loaded details into the page
function fillProfileFields(authUser, profile) {
  userId.value = authUser.id
  email.value = authUser.email || ''
  displayName.value = profile.display_name || ''
  dino.value = authUser.user_metadata?.dino || ''
  username.value = profile.username || ''
  profileLabel.value = { username: username.value, displayName: profile.display_name || '' }
}
// Save the sign-up username if it is missing from the profile.
async function claimSignupUsername(authUser, profile) {
  // Step 1: get the username they picked at sign-up
  const chosen = String(authUser.user_metadata?.username || '').trim().toLowerCase()
  // Continue only if usernames are supported,
  // the profile has none and the chosen username is valid.
  const canClaim = !profile.username && usernameAvailable.value && /^[a-z0-9_]{3,20}$/.test(chosen)
  if (!canClaim) {
    return
  }
  // Step 3: save it
  const { error: claimError } = await supabase
    .from('profiles')
    .update({ username: chosen })
    .eq('id', authUser.id)
  // Step 4: show the saved name, or tell the user if somebody else already took it
  if (!claimError) {
    username.value = chosen
  } else if (claimError.code === UNIQUE_VIOLATION) {
    usernameError.value =
      'The username you chose when signing up is already taken. Choose another in Account, below.'
  }
}
// Loads the logged-in user's profile when the page opens.
// After every wait we check "active", in case the user has already left the page.
async function loadProfile() {
  loading.value = true
  error.value = ''

  // Step 1: demo mode has no real accounts, so there is nothing to edit
  if (!USING_SUPABASE) {
    error.value = 'Profile editing requires live mode. Demo events are available in Discover.'
    loading.value = false
    return
  }
  try {
    // Step 2: find out who is logged in
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!active) return
    if (!auth.user) throw new Error('Please log in to edit your profile.')
    // Step 3: load this user's row from the profiles table (with their interests)
    const columns = 'id, display_name, postal_code, profile_interests(interests(slug))'
    let { data, error: profileError } = await supabase
      .from('profiles')
      .select(`username, ${columns}`)
      .eq('id', auth.user.id)
      .maybeSingle()
    if (!active) return
    usernameAvailable.value = true
    // Step 4: an older database may have no username column.
    // If so, load again without it and switch the username feature off.
    if (isMissingUsernameColumn(profileError)) {
      usernameAvailable.value = false
      const retry = await supabase
        .from('profiles')
        .select(columns)
        .eq('id', auth.user.id)
        .maybeSingle()
      data = retry.data
      profileError = retry.error
    }
    if (profileError) throw profileError
    if (!active) return
    if (!data) throw new Error('Your profile could not be found. Please contact the organiser.')
    // Step 5: put everything into the page
    fillProfileFields(auth.user, data)
    await claimSignupUsername(auth.user, data)
    // The sign-up page sends the user here when the username they picked was already taken
    if (route.query.username === 'taken') {
      usernameError.value = 'That username is already taken. Choose another.'
    }
    postalCode.value = data.postal_code || ''
    // Keep only the interests that are in our list of options
    selected.value = (data.profile_interests || [])
      .map((link) => link.interests.slug)
      .filter((interest) => INTEREST_OPTIONS.includes(interest))
  } catch (failure) {
    if (active) {
      error.value = loadErrorMessage(failure)
    }
  } finally {
    if (active) {
      loading.value = false
    }
  }
}

// Start editing: remember the current details so we can undo or compare later
function startEdit() {
  snapshot = {
    displayName: displayName.value,
    username: username.value,
    postalCode: postalCode.value,
    selected: [...selected.value],
  }
  touched.value = { name: false, username: false, postal: false }
  triedSave.value = false
  success.value = ''
  error.value = ''
  usernameError.value = ''
  editing.value = true
}

// Stop editing: put the old details back
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

// ---- Checking the fields

// The username error: wrong format first, then "taken"
function usernameFieldError() {
  if (!usernameAvailable.value) {
    return ''
  }
  const formatMessage = usernameFormatError(username.value)
  if (formatMessage) {
    return formatMessage
  }

  return usernameState.value === 'taken' ? 'This username is already taken.' : ''
}
// The current error for each field (an empty string means no error)
const fieldErrors = computed(() => ({
  name: nameError(displayName.value),
  username: usernameFieldError(),
  postal: postalCodeError(postalCode.value),
}))
// An error is only shown after the user has left the field, or pressed Save
function showError(field) {
  return triedSave.value || touched.value[field]
}
const nameMessage = computed(() => (showError('name') ? fieldErrors.value.name : ''))
const postalMessage = computed(() => (showError('postal') ? fieldErrors.value.postal : ''))
const usernameMessage = computed(() => {
  return usernameError.value || (showError('username') ? fieldErrors.value.username : '')
})
// ---- Unsaved changes
// True if the two lists have the same interests (order does not matter)
function sameInterests(a, b) {
  return [...a].sort().join() === [...b].sort().join()
}
// Compares the page with the copy taken when Edit was pressed.
// Spaces and capital letters are ignored, so they do not count as a change.
const hasChanges = computed(() => {
  if (!snapshot) {
    return false
  }
  const nameChanged = displayName.value.trim() !== snapshot.displayName.trim()
  const usernameChanged = cleanUsername(username.value) !== cleanUsername(snapshot.username)
  const postalChanged = postalCode.value.trim() !== snapshot.postalCode.trim()
  const interestsChanged = !sameInterests(selected.value, snapshot.selected)
  return nameChanged || usernameChanged || postalChanged || interestsChanged
})

// "isDirty" becomes true when 1.user is editing profile and they have changed smth without saving
const isDirty = computed(() => editing.value && hasChanges.value)
// Ask before the browser tab is closed or refreshed
function warnBeforeUnload(event) {
  if (isDirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
// Ask before leaving to another page inside the app
onBeforeRouteLeave(() => {
  return isDirty.value ? window.confirm('You have unsaved changes. Leave without saving?') : true
})

// ---- Change password (saved separately from the profile)
function newPasswordError() {
  if (newPassword.value === '') {
    return 'New password is required.'
  }
  // The first password rule that is broken (e.g. too short)
  const ruleError = passwordErrors(newPassword.value)[0]
  if (ruleError) {
    return ruleError
  }
  return newPassword.value === currentPassword.value
    ? 'Your new password must be different from the current one.'
    : ''
}
function confirmPasswordError() {
  if (confirmPassword.value === '') {
    return 'Please confirm your new password.'
  }
  return confirmPassword.value !== newPassword.value ? 'Passwords do not match.' : ''
}

const passwordErrorsNow = computed(() => ({
  current: currentPassword.value ? '' : 'Current password is required.',
  next: newPasswordError(),
  confirm: confirmPasswordError(),
}))
// Errors are only shown after "Save password" has been pressed.
// The "current password" box can also show an error that came back from the server.
const currentPasswordMessage = computed(() => {
  return (passwordTried.value ? passwordErrorsNow.value.current : '') || passwordServerError.value
})
const newPasswordMessage = computed(() => {
  return passwordTried.value ? passwordErrorsNow.value.next : ''
})
const confirmPasswordMessage = computed(() => {
  return passwordTried.value ? passwordErrorsNow.value.confirm : ''
})

// Empty the three boxes and clear all messages
function resetPasswordForm() {
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  passwordTried.value = false
  passwordServerError.value = ''
  passwordBanner.value = ''
}

// Open or close the password section
function togglePassword() {
  passwordOpen.value = !passwordOpen.value
  resetPasswordForm()
}

// Saves the new password
async function savePassword() {
  // Step 1: ignore extra clicks while a save is already running
  if (passwordBusy.value) {
    return
  }
  passwordTried.value = true
  passwordServerError.value = ''
  passwordBanner.value = ''
  // Step 2: stop if any box has an error
  if (Object.values(passwordErrorsNow.value).some(Boolean)) {
    return
  }

  passwordBusy.value = true

  try {
    // Step 3: send it to the server, then close and clear the section
    await changePassword(currentPassword.value, newPassword.value)
    passwordOpen.value = false
    resetPasswordForm()
    success.value = 'Password updated successfully.'
  } catch (failure) {
    // Step 4: a wrong current password goes under that box.
    // Any other problem (e.g. no internet) goes in the red banner.
    if (/current password is incorrect/i.test(failure.message)) {
      passwordServerError.value = failure.message
    } else {
      passwordBanner.value = failure.message
    }
  } finally {
    passwordBusy.value = false
  }
}

// ---- Save the profile
// Choose the message to show when saving fails
function saveErrorMessage(failure) {
  // The database is missing something (an older version)
  if (SAVE_UNAVAILABLE_CODES.includes(failure.code)) {
    return usernameAvailable.value
      ? 'Username saving is not available yet. Your changes are kept; please try again after account updates are available.'
      : 'Profile saving is temporarily unavailable. Your changes are kept; please try again later.'
  }
  // No internet or the server cannot be reached
  if (/failed to fetch|network/i.test(failure.message || '')) {
    return 'Could not reach the server. Your changes are kept here; check your connection and try again.'
  }
  return failure.message || 'Could not save your profile. Your changes are kept; please try again.'
}
// Saves the profile when the form is submitted
async function save() {
  // Step 1: ignore extra clicks, and do nothing if the profile never loaded
  if (saving.value || !userId.value) {
    return
  }
  triedSave.value = true
  success.value = ''
  error.value = ''
  usernameError.value = ''
  // Step 2: stop if any field has an error (the errors are now shown)
  if (Object.values(fieldErrors.value).some(Boolean)) {
    return
  }
  // Step 3: nothing changed, so there is nothing to send. Just leave edit mode.
  if (!hasChanges.value) {
    editing.value = false
    return
  }
  const handle = cleanUsername(username.value)
  const name = displayName.value.trim()
  const postal = postalCode.value.trim()
  saving.value = true

  try {
    // Step 4: turn the postal code into map coordinates (optional)
    let lat = null
    let lng = null
    if (postal) {
      const location = await geocodePostalCode(postal)
      lat = location.lat
      lng = location.lng
    }
    if (!active) return

    // Step 5: send everything to the database in one request
    // (the details and the full list of ticked interests)
    const payload = {
      p_display_name: name,
      p_postal_code: postal || null,
      p_lat: lat,
      p_lng: lng,
      p_interests: [...selected.value],
    }
    // If the database has no username column, use the version without the username
    const { error: err } = usernameAvailable.value
      ? await supabase.rpc('update_profile_with_username', { ...payload, p_username: handle })
      : await supabase.rpc('update_recommendation_profile', payload)
    if (!active) return
    if (err) throw err
    // Step 6: show the saved values and leave edit mode
    username.value = handle
    displayName.value = name
    profileLabel.value = { username: handle, displayName: name }

    success.value = 'Profile updated successfully.'
    editing.value = false
  } catch (e) {
    if (!active) return

    // Stay in edit mode so everyth the user typed is still there.
    // "Username taken" goes under the username box and other errors go in the red banner.
    if (e.code === UNIQUE_VIOLATION) {
      usernameError.value = 'This username is already taken.'
    } else {
      error.value = saveErrorMessage(e)
    }
  } finally {
    saving.value = false
  }
}

// ---- When the page opens and closes
onMounted(() => {
  loadProfile()
  window.addEventListener('beforeunload', warnBeforeUnload)
})

onBeforeUnmount(() => {
  active = false
  clearTimeout(usernameTimer)
  window.removeEventListener('beforeunload', warnBeforeUnload)
})
</script>

<template>
  <div
    class="profile-page"
    :class="{ 'container py-4 py-md-5': !embedded, 'profile-page--embedded': embedded }"
  >
    <header v-if="!embedded" class="profile-heading">
      <p class="profile-kicker">Your Dino account</p>
      <h1 class="profile-title page-title">Your profile</h1>
      <p class="profile-lede">Keep your details current and shape the events you discover.</p>
    </header>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading profile</span>
      </div>
    </div>

    <form v-else-if="userId" class="profile-form" :aria-busy="saving" @submit.prevent="save">
      <div v-if="success" v-dismissible class="alert alert-success" role="status">
        {{ success }}
      </div>
      <div v-if="error" v-dismissible class="alert alert-danger" role="alert">{{ error }}</div>

      <section class="profile-section" aria-labelledby="dino-heading">
        <h2 id="dino-heading" class="profile-section-title">Pick your dino</h2>
        <p class="profile-help">Your mascot shows next to your name. Change it any time.</p>
        <DinoPicker :model-value="dino" :disabled="dinoSaving" @update:model-value="chooseDino" />
        <p v-if="dinoError" v-dismissible class="text-danger mt-2 mb-0" role="alert">
          {{ dinoError }}
        </p>
      </section>

      <div class="profile-summary" :class="{ 'is-viewing': !editing }">
        <div class="profile-top">
          <span class="profile-avatar" aria-hidden="true">{{ initial }}</span>

          <div class="profile-id">
            <h2 class="profile-name">{{ displayName || 'No name yet' }}</h2>

            <template v-if="!editing">
              <p v-if="usernameAvailable" class="profile-handle">{{ handleText }}</p>
              <p class="profile-email">{{ email }}</p>
              <p class="profile-postal">Postal code: {{ postalCode || 'not set' }}</p>
            </template>
          </div>

          <button
            v-if="!editing"
            type="button"
            class="btn btn-outline-secondary btn-sm profile-edit"
            @click="startEdit"
          >
            Edit profile
          </button>
        </div>

        <!-- Viewing: interests shown as small tags -->
        <div v-if="!editing" class="profile-block">
          <h3 class="profile-block-title">Interests</h3>
          <p v-if="!selected.length" class="profile-empty">
            No interests yet. Add some to get better event suggestions.
          </p>
          <ul v-else class="profile-chips">
            <li v-for="i in selected" :key="i" class="text-capitalize">{{ i }}</li>
          </ul>
        </div>

        <!-- Editing: the same details become input boxes -->
        <template v-else>
          <fieldset class="profile-section" :disabled="saving">
            <legend class="visually-hidden">Your details</legend>

            <div class="row g-4 profile-details-grid">
              <div class="col-12 col-md-6 col-xl-4">
                <label for="name" class="form-label">Name</label>
                <input
                  id="name"
                  v-model="displayName"
                  class="form-control"
                  :class="{ 'is-invalid': nameMessage }"
                  autocomplete="name"
                  :aria-invalid="Boolean(nameMessage)"
                  aria-describedby="name-error"
                  @blur="touched.name = true"
                />
                <p v-if="nameMessage" id="name-error" class="field-error" role="alert">
                  {{ nameMessage }}
                </p>
              </div>

              <div class="col-12 col-md-6 col-xl-4">
                <label for="username" class="form-label">Username</label>
                <div class="input-group" :class="{ 'has-validation': usernameMessage }">
                  <span class="input-group-text" aria-hidden="true">@</span>
                  <input
                    id="username"
                    v-model="username"
                    class="form-control"
                    :class="{ 'is-invalid': usernameMessage }"
                    autocomplete="username"
                    :disabled="!usernameAvailable"
                    autocapitalize="none"
                    :spellcheck="false"
                    maxlength="21"
                    aria-describedby="username-help username-error"
                    :aria-invalid="Boolean(usernameMessage)"
                    @blur="touched.username = true"
                    @input="onUsernameInput"
                  />
                </div>

                <p v-if="usernameMessage" id="username-error" class="field-error" role="alert">
                  {{ usernameMessage }}
                </p>
                <p v-else-if="usernameState === 'checking'" class="profile-note mb-0" role="status">
                  Checking…
                </p>
                <p v-else-if="usernameState === 'available'" class="profile-ok mb-0" role="status">
                  ✓ @{{ cleanUsername(username) }} is available
                </p>

                <div v-if="usernameAvailable" id="username-help" class="form-text">
                  3–20 letters, numbers or underscores. People find you by it.
                </div>
                <div v-else id="username-help" class="form-text">Username setup is coming soon.</div>
              </div>

              <div class="col-12 col-md-6 col-xl-4">
                <label for="email" class="form-label">Email</label>
                <input
                  id="email"
                  :value="email"
                  type="email"
                  class="form-control"
                  readonly
                  aria-describedby="email-help"
                />
                <div id="email-help" class="form-text">
                  Your email is your sign-in and cannot be edited here.
                </div>
              </div>

              <div class="col-12 col-xl-4">
                <label for="postal" class="form-label">Postal code</label>
                <input
                  id="postal"
                  v-model="postalCode"
                  class="form-control"
                  :class="{ 'is-invalid': postalMessage }"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="e.g. 188065"
                  autocomplete="postal-code"
                  aria-describedby="postal-help postal-error"
                  :aria-invalid="Boolean(postalMessage)"
                  @blur="touched.postal = true"
                />
                <p v-if="postalMessage" id="postal-error" class="field-error" role="alert">
                  {{ postalMessage }}
                </p>
                <div id="postal-help" class="form-text">Optional. Used to find events near you.</div>
              </div>
            </div>
          </fieldset>

          <fieldset
            class="profile-section profile-interests"
            :disabled="saving"
            aria-describedby="interests-help"
          >
            <legend>Interests</legend>
            <p id="interests-help" class="profile-help">
              Choose what you enjoy. Your picks improve as you RSVP to and attend events.
            </p>
            <p class="interest-count" role="status" aria-atomic="true">{{ interestCountLabel }}</p>

            <div class="interest-options">
              <template v-for="i in INTEREST_OPTIONS" :key="i">
                <input
                  :id="`int-${i}`"
                  v-model="selected"
                  type="checkbox"
                  class="btn-check"
                  :value="i"
                />
                <label :for="`int-${i}`" class="btn btn-outline-primary text-capitalize">
                  <span class="interest-check" aria-hidden="true"></span>{{ i }}
                </label>
              </template>
            </div>
          </fieldset>
        </template>
      </div>

      <div class="profile-block">
        <div class="profile-password">
          <h3 class="profile-block-title">Password</h3>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :aria-expanded="passwordOpen"
            aria-controls="password-fields"
            @click="togglePassword"
          >
            {{ passwordOpen ? 'Cancel' : 'Change password' }}
          </button>
        </div>

        <!-- A normal div, not a second form, so Enter saves the password and not the whole profile -->
        <div v-if="passwordOpen" id="password-fields" class="password-fields">
          <div class="row g-3">
            <div class="col-12">
              <label for="current-password" class="form-label">Current password</label>
              <PasswordInput
                id="current-password"
                v-model="currentPassword"
                :class="{ 'is-invalid': currentPasswordMessage }"
                autocomplete="current-password"
                :aria-invalid="Boolean(currentPasswordMessage)"
                aria-describedby="current-password-msg"
                @keydown.enter.prevent="savePassword"
                @input="passwordServerError = ''"
              />
              <p
                v-if="currentPasswordMessage"
                id="current-password-msg"
                class="field-error"
                role="alert"
              >
                {{ currentPasswordMessage }}
              </p>
            </div>

            <div class="col-12">
              <label for="new-password-field" class="form-label">New password</label>
              <PasswordInput
                id="new-password-field"
                v-model="newPassword"
                :class="{ 'is-invalid': newPasswordMessage }"
                autocomplete="new-password"
                :aria-invalid="Boolean(newPasswordMessage)"
                aria-describedby="new-password-msg"
                @keydown.enter.prevent="savePassword"
              />
              <p v-if="newPasswordMessage" id="new-password-msg" class="field-error" role="alert">
                {{ newPasswordMessage }}
              </p>
            </div>

            <div class="col-12">
              <label for="confirm-password" class="form-label">Confirm new password</label>
              <PasswordInput
                id="confirm-password"
                v-model="confirmPassword"
                :class="{ 'is-invalid': confirmPasswordMessage }"
                autocomplete="new-password"
                :aria-invalid="Boolean(confirmPasswordMessage)"
                aria-describedby="confirm-password-msg"
                @keydown.enter.prevent="savePassword"
              />
              <p
                v-if="confirmPasswordMessage"
                id="confirm-password-msg"
                class="field-error"
                role="alert"
              >
                {{ confirmPasswordMessage }}
              </p>
            </div>
          </div>

          <div v-if="passwordBanner" class="alert alert-danger mt-3" role="alert">
            {{ passwordBanner }}
          </div>

          <button
            type="button"
            class="btn btn-primary mt-3"
            :disabled="passwordBusy"
            @click="savePassword"
          >
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
        <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="cancelEdit">
          Cancel
        </button>
      </div>
    </form>

    <div
      v-else
      v-dismissible
      class="profile-unavailable alert alert-warning"
      :role="USING_SUPABASE ? 'alert' : 'status'"
    >
      <p>{{ error }}</p>
      <button
        v-if="USING_SUPABASE"
        type="button"
        class="btn btn-outline-secondary"
        @click="loadProfile"
      >
        Retry profile
      </button>
      <RouterLink v-else to="/discover" class="btn btn-outline-secondary">
        Explore demo events
      </RouterLink>
    </div>

    <DeleteAccount v-if="userId" />
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 760px;
}
.profile-page--embedded {
  width: 100%;
  max-width: none;
}

/* Heading (only on the standalone page) */
.profile-heading {
  max-width: 600px;
  margin-bottom: 2rem;
}
.profile-kicker {
  margin: 0 0 0.55rem;
  color: var(--bookedz-ink-soft, #636975);
  font-size: 0.9rem;
}
.profile-title {
  margin: 0;
  color: var(--bookedz-ink, #1f2937);
}
.profile-lede {
  max-width: 48ch;
  margin: 0.85rem 0 0;
  color: var(--bookedz-ink-soft, #636975);
  line-height: 1.6;
}

/* The white card around the form */
.profile-form {
  padding: clamp(1.1rem, 4vw, 2rem);
  border: 1px solid var(--bookedz-border);
  border-radius: var(--bookedz-radius-card);
  background: var(--bookedz-surface);
  box-shadow: var(--bookedz-shadow);
}

.profile-summary {
  display: block;
}

/* Viewing on wide screens: details on the left, interests on the right */
@media (min-width: 992px) {
  .profile-summary.is-viewing {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0 2rem;
    align-items: start;
  }

  .profile-summary.is-viewing > .profile-block {
    height: 100%;
    padding: 0 0 0 2rem;
    border-top: 0;
    border-left: 1px solid var(--bookedz-border);
  }
}

/* Avatar, name and contact details */
.profile-top {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding-bottom: 1.25rem;
}

.profile-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--bookedz-orange-soft, var(--bookedz-glass-active));
  color: var(--bookedz-ink);
  font: 700 1.4rem var(--bookedz-heading);
}

.profile-id {
  flex: 1;
  min-width: 0;
}

.profile-name {
  margin: 0;
  font-family: var(--bookedz-heading);
  font-size: 1.5rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.profile-handle,
.profile-email,
.profile-postal {
  margin: 0.15rem 0 0;
  color: var(--bookedz-muted);
  overflow-wrap: anywhere;
}
.profile-handle {
  color: var(--bookedz-primary-dark);
  font-weight: 600;
}
/* Blocks (interests and password) */
.profile-block {
  padding: 1.1rem 0;
  border-top: 1px solid var(--bookedz-border);
}
.profile-block-title {
  margin: 0 0 0.5rem;
  font-family: var(--bookedz-heading);
  font-size: 1.1rem;
  font-weight: 650;
}
.profile-password {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.password-fields {
  max-width: 28rem;
  margin-top: 1rem;
}
.profile-password .profile-block-title {
  margin: 0;
}

/* Messages */
.field-error {
  margin: 0.35rem 0 0;
  color: var(--bookedz-danger);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}
:deep(.form-control.is-invalid) {
  background-image: none;
}
.profile-note {
  color: var(--bookedz-muted);
  font-size: 0.875rem;
}
.profile-ok {
  color: var(--bookedz-success);
  font-size: 0.875rem;
}
.profile-empty {
  margin: 0;
  color: var(--bookedz-muted);
}

/* Interest tags (viewing) */
.profile-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.profile-chips li {
  padding: 0.3rem 0.85rem;
  border-radius: 99px;
  background: var(--bookedz-orange-soft, var(--bookedz-glass-active));
  color: var(--bookedz-ink);
  font-size: 0.9rem;
  font-weight: 600;
}

/* Sections and fieldsets (editing) */
.profile-section {
  min-width: 0;
  margin: 0 0 1.75rem;
  padding: 0 0 1.5rem;
  border: 0;
  border-bottom: 1px solid var(--bookedz-border);
}

.profile-section legend,
.profile-section-title {
  float: none;
  width: auto;
  margin-bottom: 0.5rem;
  font-family: var(--bookedz-heading);
  font-size: 1.35rem;
  font-weight: 650;
}

.profile-section legend,
.profile-section .form-label {
  color: var(--bookedz-ink, #1f2937);
}

.profile-help {
  max-width: 55ch;
  margin-bottom: 1.25rem;
  color: var(--bookedz-muted);
}

.profile-interests {
  padding-bottom: 0;
  border: 0;
}

.interest-count {
  color: var(--bookedz-muted);
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
  font-variant-numeric: tabular-nums;
}
/* Interest buttons */
.interest-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}
.interest-options label {
  gap: 0.6rem;
  text-align: left;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.interest-check {
  display: inline-block;
  flex: 0 0 1rem;
  width: 1rem;
  height: 1rem;
  border: 1px solid currentColor;
  border-radius: 50%;
}
.btn-check:checked + label .interest-check::after {
  content: '';
  display: block;
  width: 0.3rem;
  height: 0.55rem;
  margin: 0.1rem auto 0;
  border: solid currentColor;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.btn-check:checked + .btn-outline-primary {
  color: var(--bookedz-on-action);
  border-color: var(--bookedz-primary);
  background: var(--bookedz-primary);
}
.btn-check:focus-visible + label {
  outline: 3px solid var(--bookedz-primary-dark);
  outline-offset: 4px;
  box-shadow: var(--bookedz-focus-glow);
}
/* Save and Cancel buttons */
.profile-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--bookedz-border);
}
.profile-unavailable,
.profile-form .alert {
  overflow-wrap: anywhere;
}
@media (max-width: 575px) {
  .profile-actions .btn {
    flex: 1 1 100%;
  }
}
</style>