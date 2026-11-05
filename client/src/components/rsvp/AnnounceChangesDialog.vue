<script setup>
import { ref, computed } from 'vue';
import ConfirmationDialog from '../event-operations/ConfirmationDialog.vue';
import { defaultAnnouncementTitle, defaultAnnouncementMessage } from '../../utils/eventChanges.js';

// review event edits and optionally announce them before saving
// after a partial save, retry only the announcement


const props = defineProps({
  eventTitle: String,
  changes: {
    type: Array,
    default: () => []
  },
  pending: Boolean,
  error: String,
  saved: Boolean
});

const emit = defineEmits(['confirm', 'cancel']);

const announce = ref(true);

const title = ref(defaultAnnouncementTitle(props.changes));

const message = ref(defaultAnnouncementMessage(props.changes));

const confirmLabel = computed(() => {
  if (props.saved) return 'Retry announcement';
  return announce.value ? 'Save and announce' : 'Save changes';
});

const incomplete = computed(() => announce.value && (!title.value.trim() || !message.value.trim()));

function confirm() {
  emit('confirm', {
    announce: announce.value,
    title: title.value,
    message: message.value
  });
}
</script>

<template>
  <ConfirmationDialog
    class="announce-dialog"
    :title="saved ? 'Changes saved' : `Save changes to “${eventTitle}”?`"
    :pending="pending"
    :error="error"
    :confirm-label="confirmLabel"
    confirm-variant="primary"
    :confirm-disabled="incomplete"
    @confirm="confirm"
    @cancel="emit('cancel')"
  >
    <h3 class="h6 mt-3">What changed</h3>
    <ul class="change-list">
      <li v-for="change in changes" :key="change.field + change.text">{{ change.text }}</li>
    </ul>

    <div class="form-check form-switch mt-3">
      <input
        id="announce-changes"
        v-model="announce"
        class="form-check-input"
        type="checkbox"
        role="switch"
        :disabled="pending || saved" />
      <label class="form-check-label" for="announce-changes">Announce these changes to attendees</label>
    </div>
    <p class="form-text mt-1">Posts to the event page’s announcements, which anyone viewing the event can read.</p>

    <div v-if="announce" class="announce-fields">
      <label for="announce-title" class="form-label">Announcement title</label>
      <input id="announce-title" v-model="title" class="form-control" maxlength="100" :disabled="pending" />
      <label for="announce-message" class="form-label mt-2">Message</label>
      <textarea
      id="announce-message"
      v-model="message"
      class="form-control"
      rows="5"
      :disabled="pending"></textarea>
    </div>
    <p v-if="saved" class="form-text mt-2">Cancel keeps your saved changes without posting an announcement.</p>
  </ConfirmationDialog>
</template>

<style scoped>
/* keep this dialog on screen and use the current theme */

.confirmation.announce-dialog {
  position: fixed;
  height: fit-content;
  max-height: calc(100dvh - 2rem);
  color: var(--dino-ink);
  background: var(--dino-surface);
}

.change-list {
  display: grid;
  gap: .35rem;
  margin: 0;
  padding-left: 1.1rem;
  color: var(--dino-ink);
  overflow-wrap: anywhere;
}

.announce-fields {
  display: grid;
  margin-top: .5rem;
}

.announce-fields textarea {
  min-height: 7rem;
}
</style>
