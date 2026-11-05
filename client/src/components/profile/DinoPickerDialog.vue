<script setup>
import { ref, nextTick } from 'vue';
import { DINOS } from '@/lib/dinos';

// pop-up opened from the profile picture. the choice stays a draft until Save, and the parent
// does the saving (it knows about the account), then calls close() when that worked.

defineProps({
  current: {
    type: String,
    default: ''
  },
  saving: Boolean,
  error: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['save']);

const dialog = ref(null);

const draft = ref('');

/**
 * Open the dialog with a draft of the current choice. The parent calls this through a template ref.
 * @param {string} [currentId] The id of the current dino.
 */
async function open(currentId) {
  draft.value = currentId || '';
  dialog.value?.showModal();
  await nextTick();
  (dialog.value?.querySelector('input:checked') || dialog.value?.querySelector('input'))?.focus();
}

function close() {
  dialog.value?.close();
}

// Keep the dialog open while a save runs.
function cancel() {
  if (!(dialog.value && dialog.value.dataset.busy === 'true')) close();
}

defineExpose({ open, close });
</script>

<template>
  <dialog
    ref="dialog"
    class="dino-dialog"
    aria-labelledby="dino-dialog-title"
    :data-busy="saving"
    @cancel="saving && $event.preventDefault()"
    @click.self="cancel">
    <form novalidate @submit.prevent="draft && emit('save', draft)">
      <h2 id="dino-dialog-title" class="dino-dialog-title">Choose your dino</h2>

      <fieldset class="dino-grid" :disabled="saving">
        <legend class="visually-hidden">Profile picture</legend>
        <label
          v-for="dino in DINOS"
          :key="dino.id"
          class="dino-tile"
          :class="{ 'is-selected': draft === dino.id }">
          <input
            v-model="draft"
            type="radio"
            class="visually-hidden"
            name="profile-dino"
            :value="dino.id" />
          <img :src="dino.src" alt="" width="96" height="96" />
          <span class="visually-hidden">{{ dino.label }}</span>
          <span class="dino-check" aria-hidden="true">✓</span>
        </label>
      </fieldset>

      <p v-if="error" class="dino-error" role="alert">{{ error }}</p>

      <div class="dino-actions">
        <button type="submit" class="btn btn-green" :disabled="saving || !draft">
          <span v-if="saving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="cancel">Cancel</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
/* sized so every dino and both buttons fit without scrolling:
   3 columns on phones, 4 from 480px, 6 on short (landscape) screens */
.dino-dialog {
  width: min(92vw, 30rem);
  max-height: 96vh;
  padding: 1.25rem;
  overflow: visible;
  border: 1px solid var(--dino-border);
  border-radius: var(--dino-radius-card);
  background: var(--dino-surface);
  color: var(--dino-ink);
  box-shadow: var(--dino-shadow);
}

.dino-dialog::backdrop {
  background: rgb(31 41 55 / 45%);
}

.dino-dialog-title {
  margin: 0 0 .85rem;
  font-family: var(--dino-heading);
  font-size: 1.3rem;
  font-weight: 650;
}

.dino-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: .5rem;
  margin: 0;
  padding: 0;
  border: 0;
}

.dino-tile {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  padding: .4rem;
  border: 2px solid transparent;
  border-radius: 14px;
  background: var(--dino-orange-soft, var(--dino-glass-active));
  cursor: pointer;
  transition: transform var(--dino-motion-fast) var(--dino-ease), border-color var(--dino-motion-fast) var(--dino-ease);
}

.dino-tile:nth-child(3n+2) {
  background: color-mix(in srgb, var(--dino-mint) 35%, var(--dino-surface));
}

.dino-tile:nth-child(3n) {
  background: var(--dino-teal-soft, #e7f3ee);
}

.dino-tile img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.dino-tile:hover {
  transform: translateY(-2px);
}

.dino-tile.is-selected {
  border-color: #267a56;
}

.dino-tile:has(input:focus-visible) {
  outline: 3px solid var(--dino-focus);
  outline-offset: 2px;
}

.dino-check {
  position: absolute;
  top: .3rem;
  right: .3rem;
  display: none;
  width: 1.4rem;
  height: 1.4rem;
  place-items: center;
  border-radius: 50%;
  background: #267a56;
  color: #fff;
  font-size: .8rem;
  font-weight: 700;
}

.dino-tile.is-selected .dino-check {
  display: grid;
}

.dino-error {
  margin: .75rem 0 0;
  color: var(--dino-danger);
  font-size: .875rem;
}

.dino-actions {
  display: flex;
  gap: .75rem;
  margin-top: 1rem;
}

@media (min-width: 480px) {
  .dino-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-height: 560px) {
  .dino-dialog {
    width: min(96vw, 40rem);
    padding: .9rem;
  }
  .dino-dialog-title {
    margin-bottom: .5rem;
    font-size: 1.1rem;
  }
  .dino-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: .35rem;
  }
  .dino-actions {
    margin-top: .6rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dino-tile {
    transition: none;
  }
  .dino-tile:hover {
    transform: none;
  }
}
</style>
