<script setup>
import '../assets/design-baseline.css'
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { signIn, signUp } from '../utils/api.js'
import { passwordErrors } from '../lib/passwordRules.js'
import { emailError } from '../lib/emailRules.js'
import { cleanUsername as cleanHandle, nameError, usernameError } from '../lib/fieldRules.js'
import { usernameAvailable } from '../lib/usernameAvailability.js'
import PasswordInput from '../components/ui/PasswordInput.vue'

// Supabase Auth: email + password. Shown on the landing page (/) for signed-out visitors;
// in demo mode Alex is always signed in, so it never appears there.
// After signing in or creating an account it goes to ?redirect= if there is one, otherwise Discover.
defineEmits(['signed-in'])

const route = useRoute()
const router = useRouter()

const mode = ref('signin') // 'signin' or 'signup'
const name = ref('')
const username = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')
const infoMessage = ref('')
const triedSubmit = ref(false)
// A field's error appears once it has been left (blur) or the form was submitted, never on an untouched field.
const touched = ref({ name: false, username: false, email: false, password: false })
const touch = field => { touched.value[field] = true }

// Three wrong sign-ins in a row lock the form for a minute. The count lives in this browser
// (localStorage), so a refresh does not reset it. It slows down someone guessing in the form;
// it cannot stop someone calling Supabase directly, which has its own rate limits.
const LOCK_KEY = 'bookedz-signin-lock'
const MAX_FAILS = 3
const LOCK_MS = 60_000
const now = ref(Date.now())
let ticker
function readLock() {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || { fails: 0, until: 0 } } catch { return { fails: 0, until: 0 } }
}
function writeLock(state) {
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(state)) } catch { /* the lock still works for this page view */ }
}
const lockedUntil = ref(readLock().until)
const secondsLeft = computed(() => Math.max(0, Math.ceil((lockedUntil.value - now.value) / 1000)))
function startTicker() {
  clearInterval(ticker)
  ticker = setInterval(() => {
    now.value = Date.now()
    if (secondsLeft.value === 0) clearInterval(ticker)
  }, 500)
}
if (secondsLeft.value > 0) startTicker()
onBeforeUnmount(() => clearInterval(ticker))
function recordFailure() {
  const state = readLock()
  state.fails = (state.fails || 0) + 1
  if (state.fails >= MAX_FAILS) {
    state.fails = 0
    state.until = Date.now() + LOCK_MS
    lockedUntil.value = state.until
    now.value = Date.now()
    startTicker()
  }
  writeLock(state)
}

// People type usernames as @handle; the @ is a prefix, not part of the name.
const handle = computed(() => cleanHandle(username.value))

// Live "is this username free?" while creating an account (needs docs/sql/username-available-draft.sql;
// without it the indicator stays hidden and the database still refuses duplicates on save).
const usernameState = ref('idle') // 'idle' | 'checking' | 'available' | 'taken'
let usernameTimer
watch([handle, mode], ([value, currentMode]) => {
  clearTimeout(usernameTimer)
  usernameState.value = 'idle'
  if (currentMode !== 'signup' || usernameError(value)) return
  usernameState.value = 'checking'
  usernameTimer = setTimeout(async () => {
    const free = await usernameAvailable(value)
    if (value !== handle.value) return
    usernameState.value = free === true ? 'available' : free === false ? 'taken' : 'idle'
  }, 450)
})
onBeforeUnmount(() => clearTimeout(usernameTimer))

// What is wrong with each field right now. Create account is strict; Sign in only checks that
// the fields are filled and the email is well formed, so older accounts can still get in.
const fieldErrors = computed(() => {
  const signingUp = mode.value === 'signup'
  const errors = { name: '', username: '', email: emailError(email.value, { simple: !signingUp }), password: [] }
  if (signingUp) {
    errors.name = nameError(name.value)
    errors.username = usernameError(username.value) || (usernameState.value === 'taken' ? 'This username is already taken.' : '')
    errors.password = password.value === '' ? ['Password is required.'] : passwordErrors(password.value)
  } else if (password.value === '') {
    errors.password = ['Password is required.']
  }
  return errors
})
const hasErrors = computed(() => Object.values(fieldErrors.value).some(value => (Array.isArray(value) ? value.length : value)))
// Problems only the server can report (email already used).
const serverErrors = ref({ email: '' })
const visible = field => triedSubmit.value || touched.value[field]
const nameMessage = computed(() => (visible('name') ? fieldErrors.value.name : ''))
const usernameMessage = computed(() => (visible('username') ? fieldErrors.value.username : ''))
const emailMessage = computed(() => (visible('email') ? fieldErrors.value.email : '') || serverErrors.value.email)
const passwordMessages = computed(() => (visible('password') ? fieldErrors.value.password : []))

function switchMode(newMode) {
  mode.value = newMode
  serverErrors.value = { email: '' }
  triedSubmit.value = false
  touched.value = { name: false, username: false, email: false, password: false }
  errorMessage.value = ''
  infoMessage.value = ''
}

async function submit() {
  triedSubmit.value = true
  if (loading.value) return
  if (mode.value === 'signin' && secondsLeft.value > 0) return
  if (hasErrors.value) return

  loading.value = true
  errorMessage.value = ''
  infoMessage.value = ''
  try {
    if (mode.value === 'signin') {
      await signIn(email.value.trim(), password.value)
      writeLock({ fails: 0, until: 0 })
    } else {
      const { mustConfirmEmail, usernameTaken } = await signUp(name.value.trim(), email.value.trim(), password.value, handle.value)
      if (mustConfirmEmail) {
        switchMode('signin') // clears the messages, so set the info message after
        infoMessage.value = 'Account created. Check your email for the confirmation link, then sign in.'
        return
      }
      // They are signed in; only the username needs another try, so Profile opens with that error.
      if (usernameTaken) { router.push({ path: '/profile', query: { username: 'taken' } }); return }
    }
    // Back to the page they were trying to open (the router put it in ?redirect=), otherwise Discover
    router.push(typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/discover')
  } catch (error) {
    if (mode.value === 'signin' && error.kind === 'credentials') recordFailure()
    // The entered details stay in the form; only a message appears.
    if (/already (been )?registered/i.test(error.message)) serverErrors.value.email = 'An account with this email already exists. Try signing in.'
    else errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="auth-wrap">
    <div class="auth-intro">
      <p class="auth-kicker">Your next good day starts here</p>
      <h1 class="auth-title">Find your people.<br />Make a plan.</h1>
      <p class="auth-copy">Sign in to keep your event plans close, or create an account to join in.</p>
      <RouterLink to="/discover" class="auth-browse">Just looking? Browse events without signing in</RouterLink>
    </div>
    <div class="card auth-card">
      <div class="card-body p-4 p-md-5">
        <!-- Two tabs switch the form between Sign in and Create account (mode) -->
        <ul class="nav nav-pills nav-fill auth-tabs mb-4">
          <li class="nav-item">
            <button type="button" class="nav-link" :class="{ active: mode === 'signin' }" @click="switchMode('signin')">Sign in</button>
          </li>
          <li class="nav-item">
            <button type="button" class="nav-link" :class="{ active: mode === 'signup' }" @click="switchMode('signup')">Create account</button>
          </li>
        </ul>

        <!-- .prevent stops the page reloading; novalidate turns off browser pop-ups so our messages show under each field instead -->
        <form :aria-busy="loading" @submit.prevent="submit" novalidate>
          <!-- Name and username are only needed when creating an account -->
          <div v-if="mode === 'signup'" class="mb-3">
            <label for="name" class="form-label">Name</label>
            <input id="name" class="form-control" :class="{ 'is-invalid': nameMessage }" v-model="name" autocomplete="name" :aria-invalid="Boolean(nameMessage)" aria-describedby="name-msg" @blur="touch('name')" />
            <p v-if="nameMessage" id="name-msg" class="field-error" role="alert">{{ nameMessage }}</p>
          </div>
          <div v-if="mode === 'signup'" class="mb-3">
            <label for="username" class="form-label">Username</label>
            <input id="username" class="form-control" :class="{ 'is-invalid': usernameMessage }" v-model="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="21" :aria-invalid="Boolean(usernameMessage)" aria-describedby="username-msg" @blur="touch('username')" />
            <p v-if="usernameMessage" id="username-msg" class="field-error" role="alert">{{ usernameMessage }}</p>
            <p v-else-if="usernameState === 'checking'" id="username-msg" class="field-note" role="status">Checking…</p>
            <p v-else-if="usernameState === 'available'" id="username-msg" class="field-ok" role="status">✓ @{{ handle }} is available</p>
          </div>
          <div class="mb-3">
            <label for="email" class="form-label">Email</label>
            <input id="email" type="email" class="form-control" :class="{ 'is-invalid': emailMessage }" v-model="email" autocomplete="email" :aria-invalid="Boolean(emailMessage)" aria-describedby="email-msg" @blur="touch('email')" @input="serverErrors.email = ''" />
            <p v-if="emailMessage" id="email-msg" class="field-error" role="alert">{{ emailMessage }}</p>
          </div>
          <div class="mb-3">
            <label for="password" class="form-label">Password</label>
            <!-- autocomplete tells password managers to fill a saved password (sign in) or suggest a new one (sign up) -->
            <PasswordInput id="password" v-model="password" :class="{ 'is-invalid': passwordMessages.length }" :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'" :aria-invalid="passwordMessages.length > 0" aria-describedby="password-msg" @blur="touch('password')" />
            <ul v-if="passwordMessages.length" id="password-msg" class="field-error field-list" role="alert"><li v-for="message in passwordMessages" :key="message">{{ message }}</li></ul>
          </div>

          <!-- Passwords can only be reset with an email link, which sample accounts cannot receive -->
          <p v-if="mode === 'signin'" class="auth-forgot">Forgot your password? Password recovery is unavailable for demo accounts. Once signed in, you can change it in Profile.</p>

          <div v-if="mode === 'signin' && secondsLeft > 0" class="alert alert-danger" role="alert">Too many wrong attempts. Please wait {{ secondsLeft }} second{{ secondsLeft === 1 ? '' : 's' }} before trying again.</div>
          <div v-else-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</div>
          <!-- Shown after sign-up: tells them to check their email for the confirmation link -->
          <div v-dismissible v-if="infoMessage" class="alert alert-success" role="status">{{ infoMessage }}</div>

          <!-- Disabled while the request runs, so it cannot be sent twice; the label changes with the mode -->
          <button type="submit" class="btn btn-primary w-100" :disabled="loading || (mode === 'signin' && secondsLeft > 0)">
            <span v-if="loading" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            {{ loading ? (mode === 'signin' ? 'Signing in…' : 'Creating account…') : mode === 'signin' ? 'Sign in' : 'Create account' }}
          </button>
        </form>
      </div>
    </div>
  </section>
</template>

<style scoped>
.auth-wrap { max-width: 920px; margin: clamp(1.5rem, 6vh, 4rem) auto; display: grid; grid-template-columns: 1fr minmax(300px, 420px); gap: clamp(2rem, 7vw, 5.5rem); align-items: start; }
/* Top-aligned, so the headline stays put when the card grows for Create account. */
.auth-intro { max-width: 430px; padding-top: clamp(0rem, 3vw, 2.5rem); }
.auth-kicker { margin: 0 0 .9rem; color: var(--bookedz-ink-soft, #636975); font-size: .9rem; }
.auth-title { color: var(--bookedz-ink, #1f2937); font-family: var(--bookedz-heading); font-size: clamp(2.5rem, 5vw, 4.2rem); line-height: 1.02; letter-spacing: -.045em; }
.auth-copy { max-width: 34ch; margin: 1.25rem 0 0; color: var(--bookedz-ink-soft, #636975); font-size: 1.05rem; line-height: 1.6; }
/* Theme tokens: a fixed light card stayed light in dark mode, hiding the (white) labels.
   --bookedz-peach is the palette's #ffe4d6 in light mode and its dark equivalent in dark mode. */
.auth-browse { display: inline-flex; align-items: center; min-height: 44px; margin-top: 1rem; color: var(--bookedz-primary-dark); font-weight: 600; }
.auth-card { border: 1px solid var(--bookedz-border, #e9ded3); border-radius: 24px; background: var(--bookedz-surface); box-shadow: var(--bookedz-shadow); }
.field-error, .field-ok, .field-note { margin: .35rem 0 0; font-size: .875rem; line-height: 1.4; overflow-wrap: anywhere; }
.field-error { color: var(--bookedz-danger); }
.field-list { padding-left: 1.1rem; }
.field-ok { color: var(--bookedz-success); }
.field-note { color: var(--bookedz-muted); }
/* Browser autofill paints inputs pale blue/yellow; keep them matching the form, light or dark */
:deep(input:-webkit-autofill) { -webkit-box-shadow: 0 0 0 1000px var(--bookedz-surface) inset; -webkit-text-fill-color: var(--bookedz-ink); caret-color: var(--bookedz-ink); }
.auth-forgot { margin: -.25rem 0 1rem; color: var(--bookedz-muted); font-size: .9rem; line-height: 1.45; }
.auth-link { min-height: 44px; padding: 0; border: 0; background: transparent; color: var(--bookedz-primary-dark); font-weight: 600; text-decoration: underline; text-underline-offset: .2em; }
.auth-tabs { padding: .3rem; border-radius: 14px; background: var(--bookedz-peach); }
:deep(.form-control.is-invalid) { background-image: none; padding-right: .9rem; }
:deep(.password-input .form-control.is-invalid) { padding-right: 3rem; }
.auth-tabs .nav-link { padding-inline: .5rem; white-space: nowrap; }
.auth-tabs .nav-item { flex: 1 1 0; min-width: 0; }
.auth-tabs .nav-link { width: 100%; border-radius: 11px; color: var(--bookedz-muted); }
.auth-tabs .nav-link.active { color: var(--bookedz-on-action); background: var(--bookedz-primary); }
:deep(.form-control) { min-height: 46px; border-color: var(--bookedz-border, #e9ded3); border-radius: 12px; }
:deep(.form-control:focus) { border-color: var(--bookedz-primary, #ff6b35); box-shadow: 0 0 0 .2rem rgba(233, 114, 92, .18); }
:deep(.btn-primary) { min-height: 46px; border-color: var(--bookedz-primary); border-radius: 12px; background: var(--bookedz-primary); }
:deep(:focus-visible) { outline: 3px solid var(--bookedz-focus); outline-offset: 3px; }
@media (max-width: 700px) { .auth-wrap { max-width: 480px; grid-template-columns: 1fr; gap: 1.5rem; margin: 1.25rem auto; } .auth-title { font-size: clamp(2.3rem, 12vw, 3.2rem); } .auth-copy { margin-top: .8rem; } }
</style>
