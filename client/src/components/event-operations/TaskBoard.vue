<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
// SortableJS (MIT): https://github.com/SortableJS/Sortable — pointer dragging;
// native status/reorder controls below provide equivalent keyboard actions.
import Sortable from 'sortablejs'
import ConfirmationDialog from './ConfirmationDialog.vue'

const props = defineProps({ tasks: { type: Array, required: true }, pending: Boolean, actionError: String })
const emit = defineEmits(['create', 'update', 'delete', 'saveBoard', 'cancel-action'])
const statuses = [{ id: 'todo', label: 'To do' }, { id: 'in_progress', label: 'In progress' }, { id: 'done', label: 'Done' }]
const columns = computed(() => Object.fromEntries(statuses.map(({ id }) => [id, props.tasks.filter(task => task.status === id).sort((a, b) => a.position - b.position)])))
const title = ref('')
const titleInput = ref(null)
const notes = ref('')
const editingId = ref(null)
const validation = ref('')
const deleting = ref(null)
const lists = {}
let sortables = []

function clearDraft() { title.value = ''; notes.value = ''; editingId.value = null; validation.value = '' }
function saveTask() {
  if (!title.value.trim()) { validation.value = 'Enter a task title.'; return }
  const savedTitle = title.value; const savedNotes = notes.value; const id = editingId.value
  emit(id ? 'update' : 'create', { id, input: { title: savedTitle.trim(), notes: savedNotes.trim() }, done: () => { if (title.value === savedTitle && notes.value === savedNotes && editingId.value === id) clearDraft() } })
}
async function focusEditor() {
  await nextTick()
  titleInput.value?.focus({ preventScroll: true })
  titleInput.value?.scrollIntoView({ block: 'center' })
}
function edit(task) {
  editingId.value = task.id; title.value = task.title; notes.value = task.notes; validation.value = ''
  focusEditor()
}

function deleteTask() { const id = deleting.value.id; emit('delete', { id, done: () => { if (editingId.value === id) clearDraft(); deleting.value = null } }) }
function cancelDelete() { deleting.value = null; emit('cancel-action') }
async function focusTaskStatus(id) {
  await nextTick()
  const control = document.getElementById('task-status-' + id)
  control?.focus({ preventScroll: true })
  control?.scrollIntoView({ block: 'center' })
}
function boardIds() { return Object.fromEntries(statuses.map(({ id }) => [id, columns.value[id].map(task => task.id)])) }
function move(task, status, offset = null, keepStatusFocus = false) {
  const board = boardIds()
  const oldIndex = board[task.status].indexOf(task.id)
  board[task.status].splice(oldIndex, 1)
  board[status].splice(offset === null ? board[status].length : oldIndex + offset, 0, task.id)
  emit('saveBoard', { input: board, done: keepStatusFocus ? () => focusTaskStatus(task.id) : undefined, failed: keepStatusFocus ? () => focusTaskStatus(task.id) : undefined })
}
onMounted(() => {
  sortables = statuses.map(({ id }) => new Sortable(lists[id], {
    group: 'event-tasks', animation: 150, handle: '.task-handle', draggable: '.task-card', dataIdAttr: 'data-task-id', disabled: props.pending,
    onEnd(event) {
      const board = Object.fromEntries(statuses.map(({ id: status }) => [status, Array.from(lists[status].querySelectorAll('.task-card')).map(element => element.dataset.taskId)]))
      // Restore Sortable's imperative DOM change before Vue applies saved props.
      // Keeping the DOM in its original VDOM order prevents duplicate/lost cards.
      const siblings = Array.from(event.from.children).filter(element => element !== event.item && element.matches('.task-card'))
      event.from.insertBefore(event.item, siblings[event.oldDraggableIndex] || null)
      if (event.from !== event.to || event.oldDraggableIndex !== event.newDraggableIndex) emit('saveBoard', { input: board })
    },
  }))
})
watch(() => props.pending, pending => sortables.forEach(sortable => sortable.option('disabled', pending)))
onBeforeUnmount(() => sortables.forEach(sortable => sortable.destroy()))
</script>

<template>
  <section aria-labelledby="tasks-heading">
    <div class="tool-heading"><div><h2 id="tasks-heading" tabindex="-1">Tasks</h2><p class="tool-description">Keep the event moving. Drag a task, or use its status and move buttons.</p></div><button id="tasks-new-task" class="btn btn-outline-primary" type="button" :disabled="pending" @click="focusEditor">{{ editingId ? 'Continue editing' : 'New task' }}</button></div>

    <p v-if="!tasks.length" class="text-secondary">No tasks yet. Add your first task in the editor below.</p>
    <div class="row g-3" :aria-busy="pending">
      <div v-for="status in statuses" :key="status.id" class="col-12 col-xl-4">
        <div class="task-column rounded border p-3">
          <h3 class="h6"><span>{{ status.label }}</span><span class="task-count">{{ columns[status.id].length }}</span></h3>
          <div :ref="element => lists[status.id] = element" class="task-list" :aria-label="status.label + ' tasks'">
            <article v-for="(task, index) in columns[status.id]" :key="task.id" :data-task-id="task.id" class="task-card card card-body mb-2">
              <div class="d-flex align-items-start gap-2"><span class="task-handle text-secondary" aria-hidden="true" title="Drag task">⠿</span><h4 class="h6 task-text">{{ task.title }}</h4></div>
              <p v-if="task.notes" class="small task-text mb-2">{{ task.notes }}</p>
              <label class="small" :for="'task-status-' + task.id">Status for {{ task.title }}</label>
              <select :id="'task-status-' + task.id" class="form-select form-select-sm mb-2" :value="task.status" :disabled="pending" @change="move(task, $event.target.value, null, true); $event.target.value = task.status">
                <option v-for="option in statuses" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
              <div class="d-flex flex-wrap gap-1">
                <button class="btn btn-sm btn-outline-secondary" type="button" :aria-label="'Move ' + task.title + ' up'" :disabled="pending || index === 0" @click="move(task, task.status, -1)">↑ Up</button>
                <button class="btn btn-sm btn-outline-secondary" type="button" :aria-label="'Move ' + task.title + ' down'" :disabled="pending || index === columns[status.id].length - 1" @click="move(task, task.status, 1)">↓ Down</button>
                <button class="btn btn-sm btn-outline-primary" type="button" :aria-label="'Edit task: ' + task.title" :disabled="pending" @click="edit(task)">Edit</button>
                <button class="btn btn-sm btn-outline-danger" type="button" :aria-label="'Delete task: ' + task.title" :disabled="pending" @click="deleting = task">Delete</button>
              </div>
            </article>
          </div>
          <p v-if="!columns[status.id].length" class="small text-secondary mb-0">No tasks in {{ status.label.toLowerCase() }}.</p>
        </div>
      </div>
    </div>
    <form class="workspace-panel task-editor mt-4" @submit.prevent="saveTask">
      <h3 class="section-heading">{{ editingId ? 'Edit task' : 'New task' }}</h3>
      <fieldset :disabled="pending">
        <div class="mb-3"><label for="task-title" class="form-label">Task title</label><input id="task-title" ref="titleInput" v-model="title" class="form-control" required maxlength="200" /></div>
        <div class="mb-3"><label for="task-notes" class="form-label">Task notes <span class="text-secondary">(optional)</span></label><textarea id="task-notes" v-model="notes" class="form-control" rows="2" /></div>
        <p v-if="validation" class="text-danger" role="alert">{{ validation }}</p>
        <div class="d-flex flex-wrap gap-2"><button class="btn btn-primary" type="submit">{{ editingId ? 'Save task' : 'Add task' }}</button><button v-if="editingId" class="btn btn-outline-secondary" type="button" @click="clearDraft">Cancel edit</button></div>
      </fieldset>
    </form>
    <ConfirmationDialog v-if="deleting" title="Delete task?" focus-fallback="#tasks-new-task" :pending="pending" :error="actionError" @cancel="cancelDelete" @confirm="deleteTask"><p>Delete “{{ deleting.title }}”? This cannot be undone.</p></ConfirmationDialog>
  </section>
</template>

<style scoped>
.task-column { height: 100%; border-color: var(--bookedz-border) !important; border-radius: 1rem !important; background: var(--bookedz-glass-solid); }
.task-editor { max-width: 54rem; }
.task-card { box-shadow: none; border-color: var(--bookedz-border); border-radius: .85rem; background: var(--bookedz-surface); transition: border-color .18s ease, transform .18s ease, box-shadow .18s ease; }
.task-card:hover { border-color: var(--bookedz-control-border); box-shadow: var(--bookedz-glass-shadow); transform: translateY(-1px); }
.task-list { min-height: 3rem; }
.task-handle { display: inline-flex; min-width: 44px; min-height: 44px; align-items: center; justify-content: center; cursor: grab; touch-action: none; color: var(--bookedz-muted); font-size: 1.4rem; line-height: 1; }
.task-text { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--bookedz-ink); }
.task-editor { padding: clamp(1rem, 2vw, 1.4rem); border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.task-column > h3 { display: flex; justify-content: space-between; align-items: center; gap: .5rem; margin-bottom: 1rem; color: var(--bookedz-ink); }
.task-count { display: grid; min-width: 1.7rem; height: 1.7rem; place-items: center; padding: 0 .35rem; border-radius: 99px; background: var(--bookedz-glass-active); color: var(--bookedz-ink); font-size: .72rem; font-weight: 700; }
.task-card h4 { line-height: 1.35; }
.task-card .btn, .task-editor .btn { min-height: 44px; }
@media (prefers-reduced-motion: reduce) { .task-card { transition: none; } }
</style>
