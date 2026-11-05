<script setup>
import { ref } from 'vue';

// a password box with an eye button inside it, so people can check what they typed.
// any attribute (id, autocomplete, aria-*, class, key handlers) goes to the input itself.
defineOptions({
  inheritAttrs: false
});
defineProps({
  modelValue: {
    type: String,
    default: ''
  }
});
defineEmits(['update:modelValue']);

const shown = ref(false);
</script>

<template>
  <div class="password-input">
    <input
      v-bind="$attrs"
      :type="shown ? 'text' : 'password'"
      :value="modelValue"
      class="form-control"
      autocapitalize="none"
      spellcheck="false"
      @input="$emit('update:modelValue', $event.target.value)"
    />
    <button
    type="button"
    class="password-eye"
    :aria-label="shown ? 'Hide password' : 'Show password'"
    :aria-pressed="shown"
    @click="shown = !shown">
      <svg
      v-if="!shown"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" /></svg>
      <svg
      v-else
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
    </button>
  </div>
</template>

<style scoped>
.password-input {
  position: relative;
}

.password-input .form-control {
  padding-right: 3rem;
}

.password-eye {
  position: absolute;
  top: 50%;
  right: .35rem;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--bookedz-muted);
  translate: 0 -50%;
}

.password-eye:hover {
  color: var(--bookedz-ink);
  background: var(--bookedz-hover);
}
</style>
