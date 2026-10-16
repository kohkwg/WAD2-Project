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
  <div class="col-md-6 col-lg-5 mx-auto">
    <div class="card shadow-sm">
      <div class="card-body p-4">
        <ul class="nav nav-pills nav-fill mb-4">
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

        <form @submit.prevent="submit" novalidate>
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
            <input
              id="password"
              type="password"
              class="form-control"
              v-model="password"
              :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
            />
          </div>

          <div v-if="triedSubmit && formErrors.length > 0" class="alert alert-danger">
            <ul class="mb-0">
              <li v-for="error in formErrors" :key="error">{{ error }}</li>
            </ul>
          </div>
          <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
          <div v-if="infoMessage" class="alert alert-success">{{ infoMessage }}</div>

          <button type="submit" class="btn btn-primary w-100" :disabled="loading">
            <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
            {{ mode === 'signin' ? 'Sign in' : 'Create account' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
