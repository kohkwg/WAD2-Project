<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { deleteAccount } from '../../utils/api.js'
import PasswordInput from '../ui/PasswordInput.vue'

// Below the Account card. Deleting is permanent, so it takes two steps: open the panel, then
// type the password and press the red button.
const router = useRouter()
const open = ref(false)
const password = ref('')
const busy = ref(false)
const error = ref('')

function toggle() {
  open.value = !open.value
  password.value = ''
  error.value = ''
}

async function remove() {
  if (!password.value) { error.value = 'Please enter your password to confirm.'; return }
  busy.value = true
  error.value = ''
  try {
    await deleteAccount(password.value)
    router.push('/')
  } catch (failure) {
    error.value = failure.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="delete-account" aria-labelledby="delete-account-title">
    <div class="delete-head">
      <div>
        <h2 id="delete-account-title" class="delete-title">Delete account</h2>
        <p class="delete-copy">Permanently remove your account, profile and RSVPs. This cannot be undone.</p>
      </div>
      <button type="button" class="btn btn-outline-danger btn-sm" :aria-expanded="open" aria-controls="delete-account-form" @click="toggle">{{ open ? 'Cancel' : 'Delete account' }}</button>
    </div>
    <form v-if="open" id="delete-account-form" class="delete-form" novalidate @submit.prevent="remove">
      <label for="delete-password" class="form-label">Enter your password to confirm</label>
      <PasswordInput id="delete-password" v-model="password" autocomplete="current-password" />
      <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>
      <button type="submit" class="btn btn-danger" :disabled="busy">
        <span v-if="busy" class="spinner-border spinner-border-sm me-2"></span>Permanently delete my account
      </button>
    </form>
  </section>
</template>

<style scoped>
.delete-account { margin-top: 1.5rem; padding: clamp(1.1rem, 4vw, 2rem); border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); background: var(--bookedz-surface); }
.delete-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.delete-title { margin: 0; font-family: var(--bookedz-heading); font-size: 1.2rem; font-weight: 650; color: var(--bookedz-danger); }
.delete-copy { margin: .25rem 0 0; color: var(--bookedz-muted); font-size: .9rem; }
.delete-form { display: grid; gap: .5rem; max-width: 28rem; margin-top: 1rem; }
.delete-form .btn-danger { justify-self: start; margin-top: .5rem; }
.delete-form .alert { margin: .5rem 0 0; }
</style>
