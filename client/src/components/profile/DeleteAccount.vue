<script setup>
import { ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { deleteAccount } from '../../utils/api.js'
import PasswordInput from '../ui/PasswordInput.vue'

// Deleting is permanent, so the red button opens a confirmation modal that says what will happen
// and asks for the password again before anything is sent to the server.
const router = useRouter()
const dialog = ref(null)
const password = ref('')
const busy = ref(false)
const passwordMessage = ref('')
const banner = ref('')

async function openDialog() {
  password.value = ''
  passwordMessage.value = ''
  banner.value = ''
  dialog.value?.showModal()
  await nextTick()
  dialog.value?.querySelector('input')?.focus()
}
function closeDialog() {
  if (busy.value) return // no closing mid-request
  dialog.value?.close()
}

async function remove() {
  if (busy.value) return
  passwordMessage.value = ''
  banner.value = ''
  if (!password.value) { passwordMessage.value = 'Password is required.'; return }
  busy.value = true
  try {
    await deleteAccount(password.value)
    dialog.value?.close()
    router.push('/discover')
  } catch (failure) {
    // Only a wrong password belongs under the field; everything else is about the request itself.
    if (/password is incorrect/i.test(failure.message)) passwordMessage.value = failure.message
    else banner.value = failure.message
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
      <button type="button" class="btn btn-outline-danger btn-sm" @click="openDialog">Delete account</button>
    </div>

    <dialog ref="dialog" class="delete-dialog" aria-labelledby="delete-dialog-title" @cancel="busy && $event.preventDefault()" @click.self="closeDialog">
      <form novalidate @submit.prevent="remove">
        <h2 id="delete-dialog-title" class="delete-dialog-title">Delete your account?</h2>
        <p>This permanently deletes:</p>
        <ul class="delete-list">
          <li>your account and sign-in, so you can no longer sign in with it</li>
          <li>your profile, username and interests</li>
          <li>your RSVPs, saved events and waitlist places</li>
        </ul>
        <p class="delete-note">If you host events, delete them from My Events first. Other people have RSVPs on them, so your account can't be deleted while you still host any.</p>

        <label for="delete-password" class="form-label">Enter your password to confirm</label>
        <PasswordInput id="delete-password" v-model="password" :class="{ 'is-invalid': passwordMessage }" autocomplete="current-password" :aria-invalid="Boolean(passwordMessage)" aria-describedby="delete-password-msg" />
        <p v-if="passwordMessage" id="delete-password-msg" class="field-error" role="alert">{{ passwordMessage }}</p>
        <div v-if="banner" class="alert alert-danger" role="alert">{{ banner }}</div>

        <div class="delete-actions">
          <button type="submit" class="btn btn-danger" :disabled="busy">
            <span v-if="busy" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            {{ busy ? 'Deleting…' : 'Permanently delete my account' }}
          </button>
          <button type="button" class="btn btn-outline-secondary" :disabled="busy" @click="closeDialog">Cancel</button>
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped>
.delete-account { margin-top: 1.5rem; padding: clamp(1.1rem, 4vw, 2rem); border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); background: var(--bookedz-surface); }
.delete-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.delete-title { margin: 0; font-family: var(--bookedz-heading); font-size: 1.2rem; font-weight: 650; color: var(--bookedz-danger); }
.delete-copy { margin: .25rem 0 0; color: var(--bookedz-muted); font-size: .9rem; }
.delete-dialog { width: min(92vw, 30rem); padding: 1.75rem; border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); background: var(--bookedz-surface); color: var(--bookedz-ink); box-shadow: var(--bookedz-shadow); }
.delete-dialog::backdrop { background: rgb(31 41 55 / 45%); }
.delete-dialog form { display: grid; gap: .5rem; }
.delete-dialog p { margin: 0; }
.delete-dialog-title { margin: 0 0 .25rem; font-family: var(--bookedz-heading); font-size: 1.35rem; font-weight: 650; color: var(--bookedz-danger); }
.delete-list { margin: 0 0 .25rem; padding-left: 1.2rem; }
.delete-note { color: var(--bookedz-muted); font-size: .9rem; margin-bottom: .5rem !important; }
.field-error { color: var(--bookedz-danger); font-size: .875rem; }
.delete-dialog .alert { margin: .5rem 0 0; }
.delete-actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: .75rem; }
:deep(.form-control.is-invalid) { background-image: none; }
</style>
