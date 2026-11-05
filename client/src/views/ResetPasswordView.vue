<script setup>
import '../assets/design-baseline.css';
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { supabase } from '../lib/supabase';
import { USING_SUPABASE, updatePassword } from '../utils/api.js';
import { passwordErrors } from '../lib/passwordRules.js';
import PasswordInput from '../components/ui/PasswordInput.vue';

// the link in the reset email brings people here already signed in (a temporary recovery
// session, which supabase-js reads from the link). without that session there is nothing
// to reset, so we say the link is invalid or expired instead of showing a form.

const router = useRouter();

const status = ref('checking'); // 'checking' | 'ready' | 'invalid' | 'done'

const password = ref('');

const loading = ref(false);

const triedSubmit = ref(false);

const errorMessage = ref('');

const errors = computed(() => passwordErrors(password.value));

let stopListening;

let giveUp;

onMounted(async () => {
  if (!USING_SUPABASE) {
    status.value = 'invalid';
    return;
  }
  const listener = supabase.auth.onAuthStateChange((event, session) => {
    if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) status.value = 'ready';
  });
  stopListening = () => listener.data.subscription.unsubscribe();
  const {
    data
  } = await supabase.auth.getSession();
  if (data.session) status.value = 'ready';
  // the link can take a moment to be turned into a session.
  else giveUp = setTimeout(() => {
    if (status.value === 'checking') status.value = 'invalid';
  }, 3000);
});

onBeforeUnmount(() => {
  stopListening?.();
  clearTimeout(giveUp);
});

async function submit() {
  triedSubmit.value = true;
  if (errors.value.length) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    await updatePassword(password.value);
    status.value = 'done';
    setTimeout(() => router.push('/discover'), 1500);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="auth-wrap reset-wrap">
    <div class="card auth-card">
      <div class="card-body p-4 p-md-5">
        <h1 class="reset-title">Choose a new password</h1>

        <p v-if="status === 'checking'" class="reset-note" role="status">Checking your reset link…</p>

        <template v-else-if="status === 'invalid'">
          <div class="alert alert-danger" role="alert">This reset link is invalid or has expired.</div>
          <RouterLink to="/" class="auth-link">Request a new link</RouterLink>
        </template>

        <p
        v-else-if="status === 'done'"
        class="alert alert-success"
        role="status">Password updated. Taking you to Discover…</p>

        <form v-else novalidate @submit.prevent="submit">
          <div class="mb-3">
            <label for="new-password" class="form-label">New password</label>
            <PasswordInput id="new-password" v-model="password" autocomplete="new-password" />
          </div>
          <div v-if="triedSubmit && errors.length" class="alert alert-danger">
            <ul class="mb-0">
            <li v-for="error in errors" :key="error">{{ error }}</li></ul>
          </div>
          <div v-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</div>
          <button type="submit" class="btn btn-primary w-100" :disabled="loading">
            <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
            Save new password
          </button>
        </form>
      </div>
    </div>
  </section>
</template>

<style scoped>
.reset-wrap {
  display: block;
  max-width: 460px;
}

.reset-title {
  margin-bottom: 1.25rem;
  font-family: var(--dino-heading);
  font-size: 1.75rem;
  letter-spacing: -.03em;
}

.reset-note {
  color: var(--dino-muted);
}

.auth-link {
  color: var(--dino-primary-dark);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: .2em;
}

.auth-card {
  border: 1px solid var(--dino-border, #e9ded3);
  border-radius: 24px;
  background: var(--dino-surface);
  box-shadow: var(--dino-shadow);
}

:deep(.form-control) {
  min-height: 46px;
  border-radius: 12px;
}

:deep(.btn-primary) {
  min-height: 46px;
  border-radius: 12px;
}
</style>
