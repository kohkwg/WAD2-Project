<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { signIn, signUp } from '../utils/api.js'

// Supabase Auth: email + password. Only used when the app runs on Supabase
// (the router skips this page in mock mode, where Alex is always logged in).

const route = useRoute()
const router = useRouter()

const mode = ref('signin') // 'signin' or 'signup'
const name = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')
const infoMessage = ref('')
const triedSubmit = ref(false)

const formErrors = computed(() => {
  const errors = []
  if (mode.value === 'signup' && name.value.trim() === '') errors.push('Please enter your name.')
  if (!email.value.includes('@')) errors.push('Please enter a valid email.')
  if (password.value.length < 6) errors.push('Password must be at least 6 characters.')
  return errors
})

function switchMode(newMode) {
  mode.value = newMode
  triedSubmit.value = false
  errorMessage.value = ''
  infoMessage.value = ''
}

async function submit() {
  triedSubmit.value = true
  if (formErrors.value.length > 0) return

  loading.value = true
  errorMessage.value = ''
  infoMessage.value = ''
  try {
    if (mode.value === 'signin') {
      await signIn(email.value.trim(), password.value)
    } else {
      const mustConfirmEmail = await signUp(name.value.trim(), email.value.trim(), password.value)
      if (mustConfirmEmail) {
        switchMode('signin') // clears the messages, so set the info message after
        infoMessage.value = 'Account created. Check your email for the confirmation link, then sign in.'
        return
      }
    }
    // Back to the page they were trying to open (the router put it in ?redirect=)
    router.push(route.query.redirect || '/events')
  } catch (error) {
    errorMessage.value = error.message
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
    </div>
    <div class="card auth-card">
      <div class="card-body p-4 p-md-5">
        <!-- Two tabs switch the form between Sign in and Create account (mode) -->
        <ul class="nav nav-pills nav-fill auth-tabs mb-4">
          <li class="nav-item">
            <button
              type="button"
              class="nav-link"
              :class="{ active: mode === 'signin' }"
              @click="switchMode('signin')"
            >
              Sign in
            </button>
          </li>
          <li class="nav-item">
            <button
              type="button"
              class="nav-link"
              :class="{ active: mode === 'signup' }"
              @click="switchMode('signup')"
            >
              Create account
            </button>
          </li>
        </ul>

        <!-- .prevent stops the page reloading; novalidate turns off browser pop-ups so our formErrors show instead -->
        <form @submit.prevent="submit" novalidate>
          <!-- Name is only needed when creating an account -->
          <div v-if="mode === 'signup'" class="mb-3">
            <label for="name" class="form-label">Name</label>
            <input id="name" class="form-control" v-model="name" autocomplete="name" />
          </div>
          <div class="mb-3">
            <label for="email" class="form-label">Email</label>
            <input id="email" type="email" class="form-control" v-model="email" autocomplete="email" />
          </div>
          <div class="mb-3">
            <label for="password" class="form-label">Password</label>
            <!-- autocomplete tells password managers to fill a saved password (sign in) or suggest a new one (sign up) -->
            <input
              id="password"
              type="password"
              class="form-control"
              v-model="password"
              :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
            />
          </div>

          <!-- Validation errors only appear after the first submit attempt (triedSubmit) -->
          <div v-if="triedSubmit && formErrors.length > 0" class="alert alert-danger">
            <ul class="mb-0">
              <li v-for="error in formErrors" :key="error">{{ error }}</li>
            </ul>
          </div>
          <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
          <!-- Shown after sign-up: tells them to check their email for the confirmation link -->
          <div v-if="infoMessage" class="alert alert-success">{{ infoMessage }}</div>

          <!-- Disabled while loading; label changes with the mode -->
          <button type="submit" class="btn btn-primary w-100" :disabled="loading">
            <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
            {{ mode === 'signin' ? 'Sign in' : 'Create account' }}
          </button>
        </form>
      </div>
    </div>
  </section>
</template>

<style scoped>
.auth-wrap { max-width: 920px; margin: clamp(1.5rem, 6vh, 4rem) auto; display: grid; grid-template-columns: 1fr minmax(300px, 420px); gap: clamp(2rem, 7vw, 5.5rem); align-items: center; }
.auth-intro { max-width: 430px; }
.auth-kicker { margin: 0 0 .9rem; color: var(--bookedz-ink-soft, #62676b); font-size: .9rem; }
.auth-title { color: var(--bookedz-ink, #292d32); font-family: var(--bookedz-heading); font-size: clamp(2.5rem, 5vw, 4.2rem); line-height: 1.02; letter-spacing: -.045em; }
.auth-copy { max-width: 34ch; margin: 1.25rem 0 0; color: var(--bookedz-ink-soft, #62676b); font-size: 1.05rem; line-height: 1.6; }
.auth-card { border: 1px solid var(--bookedz-border, #e5ded2); border-radius: 24px; background: #fffdf9; box-shadow: 0 18px 50px rgba(41, 45, 50, .08); }
.auth-tabs { padding: .3rem; border-radius: 14px; background: #f4efe7; }
.auth-tabs .nav-link { border-radius: 11px; color: #565b60; }
.auth-tabs .nav-link.active { color: #fff; background: var(--bookedz-primary-dark, #aa3e2c); }
:deep(.form-control) { min-height: 46px; border-color: var(--bookedz-border, #e5ded2); border-radius: 12px; }
:deep(.form-control:focus) { border-color: var(--bookedz-primary, #e9725c); box-shadow: 0 0 0 .2rem rgba(233, 114, 92, .18); }
:deep(.btn-primary) { min-height: 46px; border-color: var(--bookedz-primary-dark, #aa3e2c); border-radius: 12px; background: var(--bookedz-primary-dark, #aa3e2c); }
:deep(:focus-visible) { outline: 3px solid #292d32; outline-offset: 3px; }
@media (max-width: 700px) { .auth-wrap { max-width: 480px; grid-template-columns: 1fr; gap: 1.5rem; margin: 1.25rem auto; } .auth-title { font-size: clamp(2.3rem, 12vw, 3.2rem); } .auth-copy { margin-top: .8rem; } }
</style>
