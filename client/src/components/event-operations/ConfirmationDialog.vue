<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
const props = defineProps({ title: String, pending: Boolean, confirmDisabled: Boolean, error: String, focusFallback: { type: String, default: '' }, confirmLabel: { type: String, default: 'Delete' }, confirmVariant: { type: String, default: 'danger', validator: value => ['primary', 'danger'].includes(value) } })
const emit = defineEmits(['confirm', 'cancel'])
const dialog = ref(null)
let opener
let owner
onMounted(() => {
  opener = document.activeElement
  owner = dialog.value.closest('section')
  dialog.value.showModal()
})
function cancel() {
  if (props.pending) return
  if (dialog.value?.open) dialog.value.close()
  emit('cancel')
}
onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
  nextTick(() => {
    if (opener?.isConnected && !opener.disabled && opener.getClientRects().length) opener.focus({ preventScroll: true })
    else if (props.focusFallback && owner?.isConnected) owner.querySelector(props.focusFallback)?.focus({ preventScroll: true })
  })
})
</script>

<template>
  <dialog ref="dialog" class="confirmation card border-0 shadow" aria-labelledby="confirmation-title" @cancel.prevent="cancel">
    <div class="card-body">
      <h2 id="confirmation-title" class="h5">{{ title }}</h2>
      <slot />
      <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
      <div class="d-flex flex-wrap justify-content-end gap-2 mt-4">
        <button class="btn btn-outline-secondary" type="button" :disabled="pending" autofocus @click="cancel">Cancel</button>
        <button class="btn" :class="'btn-' + confirmVariant" type="button" :disabled="pending || confirmDisabled" @click="emit('confirm')">{{ pending ? 'Saving…' : confirmLabel }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.confirmation { width: min(32rem, calc(100% - 2rem)); margin: auto; border: 1px solid var(--bookedz-border, #e5ded2) !important; border-radius: 20px; background: #fffdf8; }
.confirmation::backdrop { background: rgb(0 0 0 / 45%); }
.confirmation :deep(.btn-primary) { background: #aa3e2c; border-color: #aa3e2c; }
</style>
