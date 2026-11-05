<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, onBeforeRouteLeave } from 'vue-router';
import { supabase } from '@/lib/supabase';
import { USING_SUPABASE, changePassword } from '@/utils/api';
import { cleanUsername, nameError, usernameError as usernameFormatError, postalCodeError } from '@/lib/fieldRules';
import { profileLabel } from '@/lib/profileLabel';
import { geocodePostalCode } from '@/lib/onemap';
import { INTEREST_OPTIONS } from '@/lib/constants';
import { passwordErrors } from '@/lib/passwordRules';
import { usernameAvailable as checkUsernameFree } from '@/lib/usernameAvailability';
import PasswordInput from '@/components/ui/PasswordInput.vue';
import DeleteAccount from '@/components/profile/DeleteAccount.vue';
import DinoPicker from '@/components/profile/DinoPicker.vue';
import { dinoById } from '@/lib/dinos';
defineProps({
  embedded: {
    type: Boolean,
    default: false
  }
});
// wait this long (ms) after typing stops before checking the username

const USERNAME_CHECK_DELAY = 450;
// database error codes this page knows how to handle

const UNIQUE_VIOLATION = '23505'; // the value already exists, e.g. username taken

const MISSING_COLUMN_CODES = ['42703', 'PGRST204']; // the column is not in the database yet

const SAVE_UNAVAILABLE_CODES = ['PGRST202', 'PGRST204', '42703', '42883']; // column or function missing

const route = useRoute();
// ---- state
// profile details

const userId = ref(null);

const displayName = ref('');

const username = ref('');

const postalCode = ref('');

const email = ref('');

const selected = ref([]); // the interests the user has ticked
// dino (saved in the user's account data, not in the profiles table)

const dino = ref('');

const chosenDino = computed(() => dinoById(dino.value));

const dinoSaving = ref(false);

const dinoError = ref('');
// username checking

const usernameError = ref('');

const usernameAvailable = ref(true); // false if the database has no username column yet

const usernameState = ref('idle'); // 'idle' | 'checking' | 'available' | 'taken'
// edit mode

const editing = ref(false);

const touched = ref({
  name: false,
  username: false,
  postal: false
}); // fields the user has left

const triedSave = ref(false); // true once save has been pressed

// change password (opens inside the page)

const passwordOpen = ref(false);

const currentPassword = ref('');

const newPassword = ref('');

const confirmPassword = ref('');

const passwordTried = ref(false);

const passwordBusy = ref(false);

const passwordServerError = ref(''); // error shown under the "current password" box

const passwordBanner = ref(''); // other errors, e.g. no internet
// page status

const loading = ref(true);

const saving = ref(false);

const success = ref('');

const error = ref('');

let usernameTimer; // the waiting timer for the username check

let snapshot = null; // a copy of the details taken when edit is pressed

let active = true; // becomes false when the page is closed, so late replies are ignored

// ---- values worked out from the state
// the first letter shown in the avatar circle

const initial = computed(() => {
  return (displayName.value || username.value || email.value || '?').trim().charAt(0).toUpperCase();
});

const handleText = computed(() => {
  return username.value ? `@${username.value}` : 'No username yet';
});

const interestCountLabel = computed(() => {
  const noun = selected.value.length === 1 ? 'interest' : 'interests';
  return `${selected.value.length} ${noun} selected`;
});

// ---- username check
// turn the result of the username check into a state word

function availabilityState(free) {
  if (free === true) return 'available';
  if (free === false) return 'taken';
  return 'idle'; // the check could not tell us
}

// checks if the typed username is free, while the user is editing.
// it waits a moment after typing stops, so we do not ask the database on every key.

watch(username, handle => {
  // step 1: cancel the previous check and start again
  clearTimeout(usernameTimer);
  usernameState.value = 'idle';
  const clean = cleanUsername(handle);
  const unchanged = clean === (snapshot?.username ?? '');
  // step 2: skip the check when it is not needed
  // (not editing, usernames not supported, same as the current one, or wrongly formatted)
  if (!editing.value || !usernameAvailable.value || unchanged || usernameFormatError(clean)) {
    return;
  }
  // step 3: wait, then ask the database
  usernameState.value = 'checking';
  usernameTimer = setTimeout(async () => {
    const free = await checkUsernameFree(clean);
    // the user kept typing while we were checking, so this answer is out of date
    if (clean !== cleanUsername(username.value)) {
      return;
    }
    usernameState.value = availabilityState(free);
  }, USERNAME_CHECK_DELAY);
});
// clear old messages when the user types in the username box

function onUsernameInput() {
  usernameError.value = '';
  success.value = '';
}
// The picture popup: the avatar opens it, picking a dino only highlights it, and Save keeps it.
const pictureDialog = ref(null)
const draftDino = ref('') // the dino highlighted in the popup; only saved when Save is pressed
function openPicture() {
  dinoError.value = ''
  draftDino.value = dino.value
  pictureDialog.value?.showModal()
}
function closePicture() {
  if (dinoSaving.value) return // no closing mid-save
  pictureDialog.value?.close()
}
async function savePicture() {
  if (dinoSaving.value || !draftDino.value) return
  if (draftDino.value === dino.value) { pictureDialog.value?.close(); return } // nothing changed
  await chooseDino(draftDino.value)
  if (!dinoError.value) pictureDialog.value?.close() // on failure it stays open with the message
}
// Save the chosen dino. If saving fails, go back to the old one.
async function chooseDino(id) {
  const previous = dino.value;
  dino.value = id;
  dinoSaving.value = true;
  dinoError.value = '';
  try {
    const {
      error: dinoFailure
    } = await supabase.auth.updateUser({
      data: {
        dino: id
      }
    });
    if (dinoFailure) {
      throw dinoFailure;
    }
  } catch (failure) {
    dino.value = previous;
    dinoError.value = failure.message || 'Could not save your dino.';
  } finally {
    dinoSaving.value = false;
  }
}

// ---- load the profile
// true when the database has no username column yet (an older version of the database)

function isMissingUsernameColumn(failure) {
  return failure && MISSING_COLUMN_CODES.includes(failure.code) && /username/i.test(failure.message || '');
}

function loadErrorMessage(failure) {
  if (MISSING_COLUMN_CODES.includes(failure.code)) {
    return 'Username setup is not available yet. Please ask the team to finish the database setup.';
  }
  return failure.message || 'Could not load your profile.';
}

// put the loaded details into the page

function fillProfileFields(authUser, profile) {
  userId.value = authUser.id;
  email.value = authUser.email || '';
  displayName.value = profile.display_name || '';
  dino.value = authUser.user_metadata?.dino || '';
  username.value = profile.username || '';
  profileLabel.value = {
    username: username.value,
    displayName: profile.display_name || ''
  };
}
// save the sign-up username if it is missing from the profile.

async function claimSignupUsername(authUser, profile) {
  // step 1: get the username they picked at sign-up
  const chosen = String(authUser.user_metadata?.username || '').trim().toLowerCase();
  // continue only if usernames are supported,
  // the profile has none and the chosen username is valid.
  const canClaim = !profile.username && usernameAvailable.value && /^[a-z0-9_]{3,20}$/.test(chosen);
  if (!canClaim) {
    return;
  }
  // step 3: save it
  const {
    error: claimError
  } = await supabase.from('profiles').update({
    username: chosen
  }).eq('id', authUser.id);
  // step 4: show the saved name, or tell the user if somebody else already took it
  if (!claimError) {
    username.value = chosen;
  } else if (claimError.code === UNIQUE_VIOLATION) {
    usernameError.value = 'The username you chose when signing up is already taken. Choose another in Account, below.';
  }
}
// loads the logged-in user's profile when the page opens.
// after every wait we check "active", in case the user has already left the page.

async function loadProfile() {
  loading.value = true;
  error.value = '';

  // step 1: demo mode has no real accounts, so there is nothing to edit
  if (!USING_SUPABASE) {
    error.value = 'Profile editing requires live mode. Demo events are available in Discover.';
    loading.value = false;
    return;
  }
  try {
    // step 2: find out who is logged in
    const {
      data: auth,
      error: authError
    } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!active) return;
    if (!auth.user) throw new Error('Please log in to edit your profile.');
    // step 3: load this user's row from the profiles table (with their interests)
    const columns = 'id, display_name, postal_code, profile_interests(interests(slug))';
    let {
      data,
      error: profileError
    } = await supabase.from('profiles').select(`username, ${columns}`).eq('id', auth.user.id).maybeSingle();
    if (!active) return;
    usernameAvailable.value = true;
    // step 4: an older database may have no username column.
    // if so, load again without it and switch the username feature off.
    if (isMissingUsernameColumn(profileError)) {
      usernameAvailable.value = false;
      const retry = await supabase.from('profiles').select(columns).eq('id', auth.user.id).maybeSingle();
      data = retry.data;
      profileError = retry.error;
    }
    if (profileError) throw profileError;
    if (!active) return;
    if (!data) throw new Error('Your profile could not be found. Please contact the organiser.');
    // step 5: put everything into the page
    fillProfileFields(auth.user, data);
    await claimSignupUsername(auth.user, data);
    // the sign-up page sends the user here when the username they picked was already taken
    if (route.query.username === 'taken') {
      usernameError.value = 'That username is already taken. Choose another.';
    }
    postalCode.value = data.postal_code || '';
    // keep only the interests that are in our list of options
    selected.value = (data.profile_interests || []).map(link => link.interests.slug).filter(interest => INTEREST_OPTIONS.includes(interest));
  } catch (failure) {
    if (active) {
      error.value = loadErrorMessage(failure);
    }
  } finally {
    if (active) {
      loading.value = false;
    }
  }
}

// start editing: remember the current details so we can undo or compare later

function startEdit() {
  snapshot = {
    displayName: displayName.value,
    username: username.value,
    postalCode: postalCode.value,
    selected: [...selected.value]
  };
  touched.value = {
    name: false,
    username: false,
    postal: false
  };
  triedSave.value = false;
  success.value = '';
  error.value = '';
  usernameError.value = '';
  editing.value = true;
}

// stop editing: put the old details back

function cancelEdit() {
  if (snapshot) {
    displayName.value = snapshot.displayName;
    username.value = snapshot.username;
    postalCode.value = snapshot.postalCode;
    selected.value = [...snapshot.selected];
  }
  usernameError.value = '';
  error.value = '';
  editing.value = false;
}

// ---- checking the fields

// the username error: wrong format first, then "taken"

function usernameFieldError() {
  if (!usernameAvailable.value) {
    return '';
  }
  const formatMessage = usernameFormatError(username.value);
  if (formatMessage) {
    return formatMessage;
  }
  return usernameState.value === 'taken' ? 'This username is already taken.' : '';
}
// the current error for each field (an empty string means no error)

const fieldErrors = computed(() => ({
  name: nameError(displayName.value),
  username: usernameFieldError(),
  postal: postalCodeError(postalCode.value)
}));
// an error is only shown after the user has left the field, or pressed save

function showError(field) {
  return triedSave.value || touched.value[field];
}

const nameMessage = computed(() => showError('name') ? fieldErrors.value.name : '');

const postalMessage = computed(() => showError('postal') ? fieldErrors.value.postal : '');

const usernameMessage = computed(() => {
  return usernameError.value || (showError('username') ? fieldErrors.value.username : '');
});
// ---- unsaved changes
// true if the two lists have the same interests (order does not matter)

function sameInterests(a, b) {
  return [...a].sort().join() === [...b].sort().join();
}
// compares the page with the copy taken when edit was pressed.
// spaces and capital letters are ignored, so they do not count as a change.

const hasChanges = computed(() => {
  if (!snapshot) {
    return false;
  }
  const nameChanged = displayName.value.trim() !== snapshot.displayName.trim();
  const usernameChanged = cleanUsername(username.value) !== cleanUsername(snapshot.username);
  const postalChanged = postalCode.value.trim() !== snapshot.postalCode.trim();
  const interestsChanged = !sameInterests(selected.value, snapshot.selected);
  return nameChanged || usernameChanged || postalChanged || interestsChanged;
});

// "isdirty" becomes true when 1.user is editing profile and they have changed smth without saving

const isDirty = computed(() => editing.value && hasChanges.value);
// ask before the browser tab is closed or refreshed

function warnBeforeUnload(event) {
  if (isDirty.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}
// ask before leaving to another page inside the app
onBeforeRouteLeave(() => {
  return isDirty.value ? window.confirm('You have unsaved changes. Leave without saving?') : true;
});

// ---- change password (saved separately from the profile)

function newPasswordError() {
  if (newPassword.value === '') {
    return 'New password is required.';
  }
  // the first password rule that is broken (e.g. too short)
  const ruleError = passwordErrors(newPassword.value)[0];
  if (ruleError) {
    return ruleError;
  }
  return newPassword.value === currentPassword.value ? 'Your new password must be different from the current one.' : '';
}

function confirmPasswordError() {
  if (confirmPassword.value === '') {
    return 'Please confirm your new password.';
  }
  return confirmPassword.value !== newPassword.value ? 'Passwords do not match.' : '';
}

const passwordErrorsNow = computed(() => ({
  current: currentPassword.value ? '' : 'Current password is required.',
  next: newPasswordError(),
  confirm: confirmPasswordError()
}));
// errors are only shown after "save password" has been pressed.
// the "current password" box can also show an error that came back from the server.

const currentPasswordMessage = computed(() => {
  return (passwordTried.value ? passwordErrorsNow.value.current : '') || passwordServerError.value;
});

const newPasswordMessage = computed(() => {
  return passwordTried.value ? passwordErrorsNow.value.next : '';
});

const confirmPasswordMessage = computed(() => {
  return passwordTried.value ? passwordErrorsNow.value.confirm : '';
});

// empty the three boxes and clear all messages

function resetPasswordForm() {
  currentPassword.value = '';
  newPassword.value = '';
  confirmPassword.value = '';
  passwordTried.value = false;
  passwordServerError.value = '';
  passwordBanner.value = '';
}

// open or close the password section

function togglePassword() {
  passwordOpen.value = !passwordOpen.value
  resetPasswordForm()
  // The button that was clicked disappears or reappears, so keep keyboard focus somewhere sensible
  nextTick(() => {
    const target = passwordOpen.value ? document.querySelector('#password-fields input') : document.getElementById('change-password-btn')
    target?.focus()
  })
}

// saves the new password

async function savePassword() {
  // step 1: ignore extra clicks while a save is already running
  if (passwordBusy.value) {
    return;
  }
  passwordTried.value = true;
  passwordServerError.value = '';
  passwordBanner.value = '';
  // step 2: stop if any box has an error
  if (Object.values(passwordErrorsNow.value).some(Boolean)) {
    return;
  }
  passwordBusy.value = true;
  try {
    // step 3: send it to the server, then close and clear the section
    await changePassword(currentPassword.value, newPassword.value);
    passwordOpen.value = false;
    resetPasswordForm();
    success.value = 'Password updated successfully.';
  } catch (failure) {
    // step 4: a wrong current password goes under that box.
    // any other problem (e.g. no internet) goes in the red banner.
    if (/current password is incorrect/i.test(failure.message)) {
      passwordServerError.value = failure.message;
    } else {
      passwordBanner.value = failure.message;
    }
  } finally {
    passwordBusy.value = false;
  }
}

// ---- save the profile
// choose the message to show when saving fails

function saveErrorMessage(failure) {
  // the database is missing something (an older version)
  if (SAVE_UNAVAILABLE_CODES.includes(failure.code)) {
    return usernameAvailable.value ? 'Username saving is not available yet. Your changes are kept; please try again after account updates are available.' : 'Profile saving is temporarily unavailable. Your changes are kept; please try again later.';
  }
  // no internet or the server cannot be reached
  if (/failed to fetch|network/i.test(failure.message || '')) {
    return 'Could not reach the server. Your changes are kept here; check your connection and try again.';
  }
  return failure.message || 'Could not save your profile. Your changes are kept; please try again.';
}
// saves the profile when the form is submitted

async function save() {
  // step 1: ignore extra clicks, and do nothing if the profile never loaded
  if (saving.value || !userId.value) {
    return;
  }
  triedSave.value = true;
  success.value = '';
  error.value = '';
  usernameError.value = '';
  // step 2: stop if any field has an error (the errors are now shown)
  if (Object.values(fieldErrors.value).some(Boolean)) {
    return;
  }
  // step 3: nothing changed, so there is nothing to send. just leave edit mode.
  if (!hasChanges.value) {
    editing.value = false;
    return;
  }
  const handle = cleanUsername(username.value);
  const name = displayName.value.trim();
  const postal = postalCode.value.trim();
  saving.value = true;
  try {
    // step 4: turn the postal code into map coordinates (optional)
    let lat = null;
    let lng = null;
    if (postal) {
      const location = await geocodePostalCode(postal);
      lat = location.lat;
      lng = location.lng;
    }
    if (!active) return;

    // step 5: send everything to the database in one request
    // (the details and the full list of ticked interests)
    const payload = {
      p_display_name: name,
      p_postal_code: postal || null,
      p_lat: lat,
      p_lng: lng,
      p_interests: [...selected.value]
    };
    // if the database has no username column, use the version without the username
    const {
      error: err
    } = usernameAvailable.value ? await supabase.rpc('update_profile_with_username', {
      ...payload,
      p_username: handle
    }) : await supabase.rpc('update_recommendation_profile', payload);
    if (!active) return;
    if (err) throw err;
    // step 6: show the saved values and leave edit mode
    username.value = handle;
    displayName.value = name;
    profileLabel.value = {
      username: handle,
      displayName: name
    };
    success.value = 'Profile updated successfully.';
    editing.value = false;
  } catch (e) {
    if (!active) return;

    // stay in edit mode so everyth the user typed is still there.
    // "username taken" goes under the username box and other errors go in the red banner.
    if (e.code === UNIQUE_VIOLATION) {
      usernameError.value = 'This username is already taken.';
    } else {
      error.value = saveErrorMessage(e);
    }
  } finally {
    saving.value = false;
  }
}

// ---- when the page opens and closes

onMounted(() => {
  loadProfile();
  window.addEventListener('beforeunload', warnBeforeUnload);
});

onBeforeUnmount(() => {
  active = false;
  clearTimeout(usernameTimer);
  window.removeEventListener('beforeunload', warnBeforeUnload);
});
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

      <div class="profile-summary" :class="{ 'is-viewing': !editing }">
        <div class="profile-top">
          <button type="button" class="profile-avatar profile-avatar-btn" :class="{ 'has-dino': chosenDino }" aria-haspopup="dialog" aria-label="Change profile picture" @click="openPicture"><img v-if="chosenDino" class="profile-avatar-dino" :src="chosenDino.src" alt=""><template v-else>{{ initial }}</template><span class="profile-avatar-edit" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg></span></button>

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

        <!-- viewing: interests shown as small tags -->
        <div v-if="!editing" class="profile-block">
          <h3 class="profile-block-title">Interests</h3>
          <p v-if="!selected.length" class="profile-empty">
            No interests yet. Add some to get better event suggestions.
          </p>
          <ul v-else class="profile-chips">
            <li v-for="i in selected" :key="i" class="text-capitalize">{{ i }}</li>
          </ul>
        </div>

        <!-- editing: the same details become input boxes -->
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

      <div v-if="editing" class="profile-actions">
        <button type="submit" class="btn btn-primary" :disabled="saving">
          <span v-if="saving" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="cancelEdit">
          Cancel
        </button>
      </div>

      <div class="profile-block profile-block--last">
        <div class="profile-password">
          <h3 class="profile-block-title">Password</h3>
          <!-- Hidden while the form is open: its own Cancel button is beside "Save password" -->
          <button
            v-if="!passwordOpen"
            id="change-password-btn"
            type="button"
            class="btn btn-outline-secondary btn-sm"
            aria-expanded="false"
            aria-controls="password-fields"
            @click="togglePassword"
          >
            Change password
          </button>
        </div>

        <!-- a normal div, not a second form, so enter saves the password and not the whole profile -->
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

          <div class="password-actions">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="passwordBusy"
              @click="savePassword"
            >
              <span v-if="passwordBusy" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              Save password
            </button>
            <button type="button" class="btn btn-outline-secondary" :disabled="passwordBusy" @click="togglePassword">
              Cancel
            </button>
          </div>
        </div>
      </div>


      <dialog ref="pictureDialog" class="picture-dialog" aria-labelledby="picture-dialog-title" @cancel="dinoSaving && $event.preventDefault()" @click.self="closePicture">
        <h2 id="picture-dialog-title" class="picture-dialog-title">Profile Picture</h2>
        <p class="profile-help">Pick a dino, then press Save. It shows next to your name, and you can change it any time.</p>
        <DinoPicker :model-value="draftDino" :disabled="dinoSaving" @update:model-value="draftDino = $event" />
        <p v-if="dinoError" v-dismissible class="text-danger mt-2 mb-0" role="alert">{{ dinoError }}</p>
        <div class="picture-dialog-actions">
          <button type="button" class="btn btn-primary" :disabled="dinoSaving || !draftDino" @click="savePicture">
            <span v-if="dinoSaving" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            {{ dinoSaving ? 'Saving…' : 'Save' }}
          </button>
          <button type="button" class="btn btn-outline-secondary" :disabled="dinoSaving" @click="closePicture">Cancel</button>
        </div>
      </dialog>
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

/* heading (only on the standalone page) */

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

/* the white card around the form */

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

/* viewing on wide screens: details on the left, interests on the right */

@media (min-width: 992px) {
  .profile-summary.is-viewing {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0 2rem;
    align-items: start;
  }
  .profile-summary.is-viewing > .profile-block {
    height: 100%;
    padding: 0 9rem 0 2rem;
    /* room on the right for the edit profile button */
    border-top: 0;
    border-left: 1px solid var(--bookedz-border);
  }
  /* edit profile sits at the far right of the whole box, past the interests */
  .profile-summary.is-viewing {
    position: relative;
  }
  .profile-summary.is-viewing .profile-edit {
    position: absolute;
    top: 0;
    right: 0;
    margin: 0;
  }
}

/* avatar, name and contact details */

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

/* The picked dino shows whole, with no circle or background behind it */
.profile-avatar.has-dino { width: 72px; height: 72px; background: none; }
.profile-avatar-dino { width: 100%; height: 100%; object-fit: contain; }
/* The avatar is a button that opens the picture popup */
.profile-avatar-btn { position: relative; padding: 0; border: 0; cursor: pointer; transition: transform var(--bookedz-motion-fast) var(--bookedz-ease); }
.profile-avatar-btn:hover { transform: scale(1.05); }
.profile-avatar-btn:focus-visible { outline: 3px solid var(--bookedz-focus); outline-offset: 3px; }
.profile-avatar-edit { position: absolute; right: -4px; bottom: -4px; display: grid; place-items: center; width: 26px; height: 26px; border: 2px solid var(--bookedz-ink); border-radius: 50%; background: var(--bookedz-surface); color: var(--bookedz-ink); }
.profile-avatar-edit svg { width: 14px; height: 14px; }
/* Wide enough for six dinos a row, and never scrolls: icons shrink on narrow or short screens instead */
.picture-dialog { width: min(94vw, 50rem); max-height: none; padding: clamp(1rem, 3dvh, 1.75rem); border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); background: var(--bookedz-surface); color: var(--bookedz-ink); box-shadow: var(--bookedz-shadow); overflow: visible; }
.picture-dialog :deep(.dino-picker) { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); }
@media (max-width: 575.98px), (max-height: 760px) {
  .picture-dialog :deep(.dino-picker) { grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; }
  .picture-dialog :deep(.dino-option) { padding: 6px 4px 5px; border-radius: 14px; font-size: 11px; }
  .picture-dialog :deep(.dino-option img) { width: 52px; height: 52px; }
  .picture-dialog .profile-help { margin-bottom: .5rem; }
  .picture-dialog-actions { margin-top: .9rem; }
}
@media (max-height: 640px) {
  .picture-dialog { padding: .85rem; }
  .picture-dialog :deep(.dino-picker) { grid-template-columns: repeat(auto-fill, minmax(62px, 1fr)); gap: 6px; }
  .picture-dialog :deep(.dino-option) { padding: 4px 2px 3px; font-size: 10px; }
  .picture-dialog :deep(.dino-option img) { width: 40px; height: 40px; }
  .picture-dialog-title { font-size: 1.15rem; margin-bottom: .25rem; }
  .picture-dialog .profile-help { display: none; }
  .picture-dialog-actions { margin-top: .65rem; }
  .picture-dialog .btn { min-height: 40px; }
}
.picture-dialog::backdrop { background: rgb(31 41 55 / 45%); }
.picture-dialog-actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.25rem; }
.picture-dialog-title { margin: 0 0 .5rem; font-family: var(--bookedz-heading); font-size: 1.35rem; font-weight: 650; }
.picture-dialog .btn { min-height: 44px; }
@media (prefers-reduced-motion: reduce) { .profile-avatar-btn { transition: none; } .profile-avatar-btn:hover { transform: none; } }

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

/* blocks (interests and password) */

.profile-block {
  padding: 1.1rem 0;
  border-top: 1px solid var(--bookedz-border);
}
/* The last block ends the card, so its padding would add to the card's own and make the bottom roomier than the top */
.profile-block--last {
  padding-bottom: 0;
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
.password-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1rem;
}
.password-actions .btn {
  min-height: 44px;
}
.password-fields {
  max-width: 28rem;
  margin-top: 1rem;
}

.profile-password .profile-block-title {
  margin: 0;
}
/* The profile buttons (Edit profile, Save, Change/Save password) use green instead of the site's orange */
.password-fields .btn-primary,
.picture-dialog .btn-primary,
.profile-password .btn,
.profile-actions .btn-primary,
.profile-edit {
  --bs-btn-bg: var(--bookedz-teal-ink);
  --bs-btn-border-color: var(--bookedz-teal-ink);
  --bs-btn-color: #fff;
  --bs-btn-hover-bg: color-mix(in srgb, var(--bookedz-teal-ink) 85%, #000);
  --bs-btn-hover-border-color: color-mix(in srgb, var(--bookedz-teal-ink) 85%, #000);
  --bs-btn-hover-color: #fff;
  --bs-btn-active-bg: color-mix(in srgb, var(--bookedz-teal-ink) 80%, #000);
  --bs-btn-active-border-color: color-mix(in srgb, var(--bookedz-teal-ink) 80%, #000);
  --bs-btn-active-color: #fff;
  --bs-btn-disabled-bg: var(--bookedz-teal-ink);
  --bs-btn-disabled-border-color: var(--bookedz-teal-ink);
  --bs-btn-disabled-color: #fff;
  font-weight: 700;
}
/* Dark theme: a light mint with dark text instead */
:global(:root[data-theme="dark"]) .password-fields .btn-primary,
:global(:root[data-theme="dark"]) .picture-dialog .btn-primary,
:global(:root[data-theme="dark"]) .profile-password .btn,
:global(:root[data-theme="dark"]) .profile-actions .btn-primary,
:global(:root[data-theme="dark"]) .profile-edit {
  --bs-btn-bg: var(--bookedz-teal);
  --bs-btn-border-color: var(--bookedz-teal);
  --bs-btn-color: var(--bookedz-on-fill);
  --bs-btn-hover-bg: color-mix(in srgb, var(--bookedz-teal) 85%, #fff);
  --bs-btn-hover-border-color: color-mix(in srgb, var(--bookedz-teal) 85%, #fff);
  --bs-btn-hover-color: var(--bookedz-on-fill);
  --bs-btn-active-bg: color-mix(in srgb, var(--bookedz-teal) 75%, #fff);
  --bs-btn-active-border-color: color-mix(in srgb, var(--bookedz-teal) 75%, #fff);
  --bs-btn-active-color: var(--bookedz-on-fill);
  --bs-btn-disabled-bg: var(--bookedz-teal);
  --bs-btn-disabled-border-color: var(--bookedz-teal);
  --bs-btn-disabled-color: var(--bookedz-on-fill);
}
/* The account pages give primary buttons an orange outline in dark mode; keep this one green */
/* ...and keep their dark-mode outline green rather than the orange one the account pages add */
:global(:root[data-theme="dark"]) .account-page.account-page :is(.password-fields, .profile-actions, .picture-dialog) .btn-primary {
  border-color: var(--bookedz-teal);
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

/* interest tags (viewing) */

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

/* sections and fieldsets (editing) */

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

/* interest buttons */

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

/* save and cancel buttons */

.profile-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-top: 1.5rem;
  margin-bottom: 1.5rem;
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