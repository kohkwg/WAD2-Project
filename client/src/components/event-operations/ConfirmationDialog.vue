<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  title: String,
  pending: Boolean,
  confirmDisabled: Boolean,
  error: String,
  focusFallback: {
    type: String,
    default: ''
  },
  confirmLabel: {
    type: String,
    default: 'Delete'
  },
  pendingLabel: {
    type: String,
    default: 'Saving…'
  },
  confirmVariant: {
    type: String,
    default: 'danger',
    validator: value => ['primary', 'danger'].includes(value)
  }
});

const emit = defineEmits(['confirm', 'cancel']);

const dialog = ref(null);

let opener;

let owner;

onMounted(() => {
  opener = document.activeElement;
  owner = dialog.value.closest('section');
  dialog.value.showModal();
});

function cancel() {
  if (props.pending) return;
  if (dialog.value?.open) dialog.value.close();
  emit('cancel');
}

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close();
  nextTick(() => {
    if (opener?.isConnected && !opener.disabled && opener.getClientRects().length) opener.focus({
      preventScroll: true
    });else if (props.focusFallback && owner?.isConnected) owner.querySelector(props.focusFallback)?.focus({
      preventScroll: true
    });
  });
});
</script>

<template>
  <dialog ref="dialog" class="confirmation card border-0 shadow" aria-labelledby="confirmation-title"
    @cancel.prevent="cancel">
    <div class="card-body">
      <h2 id="confirmation-title" class="h5">{{ title }}</h2>
      <slot />
      <p v-dismissible v-if="error" class="text-danger" role="alert">{{ error }}</p>
      <div class="d-flex flex-wrap justify-content-end gap-2 mt-4">
        <button class="btn btn-outline-secondary" type="button" :disabled="pending" autofocus
          @click="cancel">Cancel</button>
        <button class="btn" :class="'btn-' + confirmVariant" type="button" :disabled="pending || confirmDisabled"
          @click="emit('confirm')">{{ pending ? pendingLabel : confirmLabel }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
/* keep the dialog centred on screen and readable in both themes */

.confirmation {
  position: fixed;
  width: min(32rem, calc(100% - 2rem));
  height: fit-content;
  max-height: calc(100dvh - 2rem);
  margin: auto;
  border: 1px solid var(--bookedz-border, #e9ded3) !important;
  border-radius: 20px;
  color: var(--bookedz-ink);
  background: var(--bookedz-surface, #ffffff);
}

.confirmation::backdrop {
  background: rgb(0 0 0 / 45%);
}

.confirmation :deep(.btn-primary) {
  background: #9a3412;
  border-color: #9a3412;
}
</style>
