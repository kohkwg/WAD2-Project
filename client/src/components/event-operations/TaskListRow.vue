<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  task: { type: Object, required: true },
  pending: Boolean,
  saving: Boolean,
  expanded: Boolean,
  editing: Boolean,
  draft: { type: Object, default: () => ({ title: '', notes: '' }) },
  draftDirty: Boolean,
  error: String,
  menuOpen: Boolean,
  editorOnly: Boolean,
  showReorder: Boolean,
  isFirst: Boolean,
  isLast: Boolean,
})
const emit = defineEmits(['expand', 'complete', 'start', 'back', 'edit', 'delete', 'move-up', 'move-down', 'menu', 'draft', 'save-edit', 'cancel-edit'])
const menuButton = ref(null)
const menuWrap = ref(null)

watch(() => props.editing, async editing => {
  if (!editing) return
  await nextTick()
  if (props.pending) return
  document.getElementById('task-title-edit-' + props.task.id)?.focus({ preventScroll: true })
})

watch(() => props.menuOpen, open => {
  if (open) {
    document.addEventListener('keydown', onMenuKeydown)
    document.addEventListener('pointerdown', onOutsidePointer)
  } else {
    document.removeEventListener('keydown', onMenuKeydown)
    document.removeEventListener('pointerdown', onOutsidePointer)
  }
}, { immediate: true })
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onMenuKeydown)
  document.removeEventListener('pointerdown', onOutsidePointer)
})

function onOutsidePointer(event) {
  if (document.querySelector('dialog[open]') || menuWrap.value?.contains(event.target)) return
  emit('menu', false)
}

function onMenuKeydown(event) {
  if (event.key !== 'Escape') return
  if (document.querySelector('dialog[open]')) return
  event.preventDefault()
  emit('menu', false)
  menuButton.value?.focus({ preventScroll: true })
}

function setDraft(field, event) {
  emit('draft', field, event.target.value)
}

function requestCompletion(event) {
  // The browser toggles a checkbox before change fires. Keep the saved value
  // visible until the parent receives a successful status/order save.
  event.target.checked = props.task.status === 'done'
  emit('complete')
}
</script>

<template>
  <li data-organiser-enter class="task-row" :class="{ completed: task.status === 'done', editing }">
    <div class="task-row-main">
      <label v-if="!editorOnly" class="completion-hit" :class="{ saving }">
        <input
          :checked="task.status === 'done'"
          :disabled="pending"
          type="checkbox"
          :aria-label="(task.status === 'done' ? 'Reopen task: ' : 'Complete task: ') + task.title"
          data-task-completion
          @change="requestCompletion"
        />
        <span class="visually-hidden">{{ task.status === 'done' ? 'Reopen task: ' : 'Complete task: ' }}{{ task.title }}</span>
      </label>

      <button v-if="!editorOnly"
        class="task-title"
        type="button"
        :aria-expanded="expanded"
        :aria-label="(expanded ? 'Hide details: ' : 'Show details: ') + task.title"
        data-task-title
        @click="emit('expand')"
      >
        <span>{{ task.title }}</span>
      </button>
      <span v-else class="task-title pinned-title">{{ task.title }}</span>

      <span v-if="!editorOnly && task.status === 'in_progress'" class="status-label">In progress</span>
      <span v-if="saving" class="row-pending" aria-hidden="true">Saving…</span>

      <div v-if="!editorOnly" ref="menuWrap" class="row-menu-wrap">
        <button
          ref="menuButton"
          class="more-button"
          type="button"
          :disabled="pending"
          :aria-expanded="menuOpen"
          :aria-label="'More actions for: ' + task.title"
          @click="emit('menu')"
        >More</button>
        <div v-if="menuOpen" class="action-disclosure" :aria-label="'Actions for ' + task.title">
          <button type="button" :disabled="pending" @click="emit('edit')">Edit</button>
          <button v-if="showReorder" type="button" :disabled="pending || isFirst" @click="emit('move-up')">Move up</button>
          <button v-if="showReorder" type="button" :disabled="pending || isLast" @click="emit('move-down')">Move down</button>
          <button class="delete-action" type="button" :disabled="pending" @click="emit('delete')">Delete</button>
        </div>
      </div>
    </div>

    <div v-if="expanded" data-organiser-enter class="task-details">
      <p v-if="task.notes && !editing" class="task-notes">{{ task.notes }}</p>
      <template v-if="editing">
        <form class="edit-fields" name="task-edit" autocomplete="off" @submit.prevent="emit('save-edit')">
          <div>
            <label class="form-label" :for="'task-title-edit-' + task.id">Task title</label>
            <input :id="'task-title-edit-' + task.id" class="form-control" name="title" autocomplete="off" :value="draft.title" maxlength="200" required :disabled="pending" @input="setDraft('title', $event)" />
          </div>
          <div>
            <label class="form-label" :for="'task-notes-edit-' + task.id">Task notes <span class="text-secondary">(optional)</span></label>
            <textarea :id="'task-notes-edit-' + task.id" class="form-control" name="notes" autocomplete="off" rows="2" :value="draft.notes" :disabled="pending" @input="setDraft('notes', $event)" />
          </div>
          <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
          <div class="edit-actions">
            <button class="btn btn-primary" type="submit" :disabled="pending">Save task</button>
            <button class="btn btn-outline-secondary" type="button" :disabled="pending" @click="emit('cancel-edit')">Cancel edit</button>
          </div>
        </form>
      </template>
      <div v-else class="detail-actions">
        <button v-if="task.status === 'todo'" class="detail-action" type="button" :disabled="pending" @click="emit('start')">Start task</button>
        <button v-else-if="task.status === 'in_progress'" class="detail-action" type="button" :disabled="pending" @click="emit('back')">Back to to do</button>
        <button class="detail-action" type="button" :disabled="pending" @click="emit('edit')">Edit task</button>
        <p v-if="task.status === 'done'" class="reopen-hint">Unchecking this task moves it back to To do.</p>
      </div>
    </div>
  </li>
</template>

<style scoped>
.task-row { border-top: 1px solid var(--bookedz-border); color: var(--bookedz-ink); }
.task-row:first-child { border-top: 0; }
.task-row-main { display: flex; min-height: 58px; align-items: center; gap: .55rem; }
.completion-hit { display: flex; width: 44px; min-width: 44px; height: 44px; align-items: center; justify-content: center; margin: 0; cursor: pointer; }
.completion-hit input { width: 1.1rem; height: 1.1rem; accent-color: var(--bookedz-primary-dark); cursor: pointer; }
.completion-hit.saving { cursor: progress; }
.completion-hit input:disabled { cursor: progress; }
.task-title { display: flex; min-height: 44px; min-width: 0; flex: 1; align-items: center; padding: .4rem .2rem; border: 0; background: transparent; color: inherit; font: inherit; font-weight: 560; text-align: left; overflow-wrap: anywhere; }
.task-title span { white-space: pre-wrap; overflow-wrap: anywhere; }
.completed .task-title { color: var(--bookedz-muted); text-decoration: line-through; text-decoration-thickness: 1px; }
.status-label { flex: 0 0 auto; color: var(--bookedz-muted); font-size: .8rem; }
.row-pending { flex: 0 0 auto; color: var(--bookedz-muted); font-size: .78rem; }
.more-button { min-width: 54px; min-height: 44px; padding: .35rem .55rem; border: 1px solid transparent; border-radius: .55rem; background: transparent; color: var(--bookedz-muted); font: inherit; font-size: .85rem; }
.more-button:hover, .more-button[aria-expanded="true"] { border-color: var(--bookedz-border); background: var(--bookedz-glass-active); color: var(--bookedz-ink); }
.row-menu-wrap { position: relative; flex: 0 0 auto; }
.action-disclosure { position: absolute; z-index: 2; top: calc(100% + .15rem); right: 0; display: grid; min-width: 11rem; padding: .3rem; border: 1px solid var(--bookedz-border); border-radius: .7rem; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.action-disclosure button { min-height: 44px; padding: .4rem .55rem; border: 0; border-radius: .4rem; background: transparent; color: var(--bookedz-ink); font: inherit; text-align: left; }
.action-disclosure button:hover { background: var(--bookedz-glass-active); }
.action-disclosure .delete-action { color: var(--bookedz-danger, #a4312b); }
.task-details { padding: 0 1rem 1rem 3.65rem; }
.task-notes { margin: 0 0 .55rem; color: var(--bookedz-muted); white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .9rem; }
.detail-action { min-height: 44px; padding: .25rem 0; border: 0; background: transparent; color: var(--bookedz-primary-dark); font: inherit; text-decoration: underline; text-underline-offset: .15em; }
.reopen-hint { flex-basis: 100%; margin: 0; color: var(--bookedz-muted); font-size: .85rem; }
.edit-fields { display: grid; gap: .7rem; max-width: 48rem; }
.edit-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
.edit-actions .btn { min-height: 44px; }
.editing .task-details { padding-top: .25rem; }
@media (max-width: 575.98px) {
  .task-row-main { gap: .25rem; }
  .status-label { max-width: 5.5rem; text-align: right; }
  .row-pending { display: none; }
  .task-details { padding-left: 3.2rem; padding-right: .2rem; }
}
</style>
