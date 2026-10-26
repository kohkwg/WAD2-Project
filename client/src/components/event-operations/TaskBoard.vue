<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import ConfirmationDialog from './ConfirmationDialog.vue'
import TaskListRow from './TaskListRow.vue'

const props = defineProps({ tasks: { type: Array, required: true }, pending: Boolean, actionError: String })
const emit = defineEmits(['create', 'update', 'delete', 'saveBoard', 'cancel-action'])

const statuses = [
  { id: 'in_progress', label: 'In progress' },
  { id: 'todo', label: 'To do' },
  { id: 'done', label: 'Completed' },
]
const activeFilter = ref('all')
const search = ref('')
const completedExpanded = ref(false)
const expandedIds = ref(new Set())
const editingId = ref(null)
const createDraft = ref({ title: '', notes: '' })
const editDraft = ref({ title: '', notes: '' })
const editDirty = ref(false)
const createValidation = ref('')
const editValidation = ref('')
const createNotesOpen = ref(false)
const deleting = ref(null)
const openMenuId = ref(null)
const pendingTaskId = ref(null)
const rowControls = new Map()
const searchInput = ref(null)

const sortedTasks = computed(() => [...props.tasks].sort((a, b) => a.position - b.position))
const orderedIdsByStatus = computed(() => Object.fromEntries(['todo', 'in_progress', 'done'].map(status => [
  status,
  sortedTasks.value.filter(task => task.status === status).map(task => task.id),
])))
const indexByTaskId = computed(() => new Map(Object.entries(orderedIdsByStatus.value).flatMap(([, ids]) => ids.map((id, index) => [id, index]))))
const counts = computed(() => Object.fromEntries(statuses.map(({ id }) => [id, props.tasks.filter(task => task.status === id).length])))
const matchingTasks = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return sortedTasks.value.filter(task => !query || `${task.title}\n${task.notes || ''}`.toLocaleLowerCase().includes(query))
})
const filteredTasks = computed(() => activeFilter.value === 'all'
  ? matchingTasks.value
  : matchingTasks.value.filter(task => task.status === activeFilter.value))
const matchingCounts = computed(() => Object.fromEntries(statuses.map(({ id }) => [id, matchingTasks.value.filter(task => task.status === id).length])))
const resultCount = computed(() => filteredTasks.value.length)
const isSearching = computed(() => Boolean(search.value.trim()))
const completedForcedOpen = computed(() => activeFilter.value === 'done' || (isSearching.value && matchingCounts.value.done > 0))
const completedIsExpanded = computed(() => completedForcedOpen.value || completedExpanded.value)
const visibleGroups = computed(() => statuses.filter(({ id }) => activeFilter.value === 'all' || activeFilter.value === id))
const dirtyEdit = computed(() => editingId.value !== null && editDirty.value)
const pinnedEditingTask = computed(() => {
  const task = props.tasks.find(row => row.id === editingId.value)
  return task && isPinnedEdit(task) ? task : null
})

watch(() => props.tasks.map(task => task.id).join('|'), () => {
  const ids = new Set(props.tasks.map(task => task.id))
  expandedIds.value = new Set([...expandedIds.value].filter(id => ids.has(id)))
  if (editingId.value && !ids.has(editingId.value)) clearEditor()
})

function toggleExpanded(id) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

function setRowControl(id, element) {
  if (element) rowControls.set(id, element)
  else rowControls.delete(id)
}

async function restoreEditFocus(id) {
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
  const title = rowControls.get(id)?.querySelector('[data-task-title]')
  if (title?.getClientRects().length) title.focus({ preventScroll: true })
  else searchInput.value?.focus({ preventScroll: true })
}

function boardIds() {
  return Object.fromEntries(Object.entries(orderedIdsByStatus.value).map(([status, ids]) => [status, [...ids]]))
}

function saveBoard(board, taskId, kind) {
  pendingTaskId.value = taskId
  const fallback = async () => {
    try { await focusAfterBoardSave(taskId, kind) }
    finally { if (pendingTaskId.value === taskId) pendingTaskId.value = null }
  }
  emit('saveBoard', { input: board, done: fallback, failed: fallback })
}

async function focusAfterBoardSave(taskId, kind) {
  await nextTick()
  // ManageEventView clears the shared pending flag in its finally block after
  // invoking this callback; one task turn lets that happen before restoring focus.
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
  const rowStillVisible = rowControls.has(taskId) && rowControls.get(taskId)?.isConnected
  if (rowStillVisible) {
    const row = rowControls.get(taskId)
    const target = kind === 'complete' ? row.querySelector('[data-task-completion]') : row.querySelector('[data-task-title]')
    if (target?.getClientRects().length) {
      target.focus({ preventScroll: true })
      return
    }
  }
  const next = filteredTasks.value.find(task => task.id !== taskId && rowControls.get(task.id)?.querySelector('[data-task-completion]')?.getClientRects().length)
  const nextTarget = next && rowControls.get(next.id)?.querySelector('[data-task-completion]')
  if (nextTarget) nextTarget.focus({ preventScroll: true })
  else document.getElementById('tasks-heading')?.focus({ preventScroll: true })
}

function completeTask(task) {
  if (props.pending) return
  const board = boardIds()
  const openStatus = task.status
  board[openStatus] = board[openStatus].filter(id => id !== task.id)
  if (task.status === 'done') board.todo.push(task.id)
  else board.done.push(task.id)
  saveBoard(board, task.id, 'complete')
}

function setStatus(task, nextStatus) {
  if (props.pending || task.status === nextStatus) return
  const board = boardIds()
  board[task.status] = board[task.status].filter(id => id !== task.id)
  board[nextStatus].push(task.id)
  saveBoard(board, task.id, 'status')
}

function reorder(task, offset) {
  if (props.pending || isSearching.value) return
  const board = boardIds()
  const group = board[task.status]
  const index = group.indexOf(task.id)
  const next = index + offset
  if (next < 0 || next >= group.length) return
  ;[group[index], group[next]] = [group[next], group[index]]
  saveBoard(board, task.id, 'order')
}

function beginCreate() {
  createDraft.value = { title: '', notes: '' }
  createValidation.value = ''
  createNotesOpen.value = false
}

function openEditor(task) {
  if (editingId.value === task.id) return
  if (editingId.value !== null && editDirty.value) return
  editingId.value = task.id
  editDraft.value = { title: task.title, notes: task.notes || '' }
  editDirty.value = false
  editValidation.value = ''
  expandedIds.value = new Set([...expandedIds.value, task.id])
  openMenuId.value = null
}

function updateDraft(field, value) {
  editDraft.value = { ...editDraft.value, [field]: value }
  editDirty.value = true
  editValidation.value = ''
}

function updateCreateDraft(field, value) {
  createDraft.value = { ...createDraft.value, [field]: value }
  createValidation.value = ''
}

function clearEditor() {
  editingId.value = null
  editDraft.value = { title: '', notes: '' }
  editDirty.value = false
  editValidation.value = ''
}

function saveCreateTask() {
  if (props.pending) return
  if (!createDraft.value.title.trim()) {
    createValidation.value = 'Enter a task title.'
    return
  }
  const snapshot = { title: createDraft.value.title, notes: createDraft.value.notes }
  const input = { title: snapshot.title.trim(), notes: snapshot.notes.trim() }
  const done = () => {
    if (createDraft.value.title === snapshot.title && createDraft.value.notes === snapshot.notes) {
      beginCreate()
    }
  }
  emit('create', { input, done })
}

function saveEditTask() {
  if (props.pending || !editingId.value) return
  if (!editDraft.value.title.trim()) {
    editValidation.value = 'Enter a task title.'
    return
  }
  const id = editingId.value
  const snapshot = { title: editDraft.value.title, notes: editDraft.value.notes }
  emit('update', {
    id,
    input: { title: snapshot.title.trim(), notes: snapshot.notes.trim() },
    done: () => {
      if (editDraft.value.title === snapshot.title && editDraft.value.notes === snapshot.notes && editingId.value === id) {
        clearEditor()
        restoreEditFocus(id)
      }
    },
  })
}

function cancelEdit() {
  const id = editingId.value
  clearEditor()
  if (id) restoreEditFocus(id)
}

function requestDelete(task) {
  if (props.pending) return
  deleting.value = task
}

function deleteTask() {
  if (!deleting.value) return
  const id = deleting.value.id
  emit('delete', {
    id,
    done: () => {
      if (editingId.value === id) clearEditor()
      deleting.value = null
    },
  })
}

function cancelDelete() {
  deleting.value = null
  emit('cancel-action')
}

function clearSearch() {
  search.value = ''
  searchInput.value?.focus({ preventScroll: true })
}

function tasksForGroup(status) {
  return filteredTasks.value.filter(task => task.status === status && !isPinnedEdit(task))
}

function isPinnedEdit(task) {
  const completedIsHidden = task.status === 'done' && !completedIsExpanded.value
  return editingId.value === task.id && (!filteredTasks.value.some(match => match.id === task.id) || completedIsHidden)
}

function groupExpanded(status) {
  return status !== 'done' || completedIsExpanded.value
}

function taskIndex(task) {
  return indexByTaskId.value.get(task.id) ?? -1
}

function isLastTask(task) {
  return taskIndex(task) === orderedIdsByStatus.value[task.status].length - 1
}
</script>

<template>
  <section aria-labelledby="tasks-heading">
    <div class="task-heading">
      <div>
        <h2 id="tasks-heading" tabindex="-1">Tasks</h2>
        <p class="tool-description">{{ counts.done }} of {{ props.tasks.length }} completed. Check a task when it’s done; reopening returns it to To do.</p>
      </div>
    </div>

    <form class="task-composer" aria-label="Add task" @submit.prevent="saveCreateTask">
      <div class="composer-fields">
        <label class="visually-hidden" for="task-title">Task title</label>
        <input id="task-title" class="form-control" :value="createDraft.title" type="text" required maxlength="200" placeholder="Add a task" :disabled="pending" @input="updateCreateDraft('title', $event.target.value)" />
        <button class="btn btn-primary" type="submit" :disabled="pending">Add task</button>
      </div>
      <div class="composer-secondary">
        <button class="text-button" type="button" :aria-expanded="createNotesOpen" @click="createNotesOpen = !createNotesOpen">{{ createNotesOpen ? 'Hide notes' : 'Add notes' }}</button>
      </div>
      <div v-show="createNotesOpen" class="notes-field">
        <label for="task-notes" class="form-label">Task notes <span class="text-secondary">(optional)</span></label>
        <textarea id="task-notes" class="form-control" rows="2" :value="createDraft.notes" :disabled="pending" @input="updateCreateDraft('notes', $event.target.value)" />
      </div>
      <p v-if="createValidation" class="text-danger" role="alert">{{ createValidation }}</p>
      <p v-if="dirtyEdit" class="edit-hint">Finish this edit or choose Cancel edit before editing another task.</p>
    </form>

    <div class="task-toolbar">
      <div class="search-field">
        <label for="task-search" class="form-label">Search tasks</label>
        <input id="task-search" ref="searchInput" v-model="search" class="form-control" type="search" placeholder="Search title or notes" />
      </div>
      <div class="status-filters" role="group" aria-label="Filter tasks by status">
        <button v-for="filter in [{ id: 'all', label: 'All', count: props.tasks.length }, ...statuses.map(status => ({ ...status, count: counts[status.id] }))]" :key="filter.id" type="button" class="filter-button" :class="{ active: activeFilter === filter.id }" :aria-pressed="activeFilter === filter.id" @click="activeFilter = filter.id">
          {{ filter.label }} <span class="filter-count">{{ filter.count }}</span>
        </button>
      </div>
      <p v-if="isSearching" class="result-count" role="status">{{ resultCount }} matching {{ resultCount === 1 ? 'task' : 'tasks' }}</p>
    </div>

    <div v-if="pinnedEditingTask" class="pinned-editor">
      <p class="pinned-label">Editing task outside the current results</p>
      <ul class="pinned-list">
        <TaskListRow
          :task="pinnedEditingTask"
          :pending="pending"
          :saving="false"
          :expanded="true"
          :editing="true"
          :draft="editDraft"
          :draft-dirty="editDirty"
          :menu-open="false"
          :editor-only="true"
          :show-reorder="false"
          :error="editValidation"
          @draft="updateDraft"
          @save-edit="saveEditTask"
          @cancel-edit="cancelEdit"
        />
      </ul>
    </div>

    <p v-if="!props.tasks.length" class="empty-state">No tasks yet. Add the first task above.</p>
    <div v-else-if="!filteredTasks.length" class="empty-state">
      <template v-if="isSearching">
        <p>No matching tasks.</p>
        <button class="text-button" type="button" @click="clearSearch">Clear search</button>
      </template>
      <p v-else>No tasks in {{ statuses.find(status => status.id === activeFilter)?.label }}.</p>
    </div>

    <div v-if="filteredTasks.length" class="task-groups" :aria-busy="pending">
      <section v-for="group in visibleGroups" :key="group.id" class="task-group" :aria-labelledby="'task-group-' + group.id">
        <h3 v-if="group.id === 'done' && completedForcedOpen" :id="'task-group-' + group.id" class="group-heading">Completed tasks <span class="group-count">{{ isSearching ? matchingCounts.done : counts.done }}</span></h3>
        <div v-else-if="group.id === 'done'" class="group-heading">
          <button :id="'task-group-' + group.id" class="group-toggle" type="button" :aria-expanded="completedIsExpanded" @click="completedExpanded = !completedExpanded">
            <span>Completed tasks</span><span class="group-count">{{ isSearching ? matchingCounts.done : counts.done }}</span><span aria-hidden="true">{{ completedIsExpanded ? '−' : '+' }}</span>
          </button>
        </div>
        <h3 v-else :id="'task-group-' + group.id" class="group-heading">{{ group.label }} <span class="group-count">{{ isSearching ? matchingCounts[group.id] : counts[group.id] }}</span></h3>
        <ul v-show="groupExpanded(group.id)" class="task-list" :aria-label="group.label + ' tasks'">
          <TaskListRow
            v-for="task in tasksForGroup(group.id)"
            :key="task.id"
            :ref="element => setRowControl(task.id, element?.$el || element)"
            :task="task"
            :pending="pending"
            :saving="pendingTaskId === task.id"
            :expanded="expandedIds.has(task.id)"
            :editing="editingId === task.id"
            :draft="editDraft"
            :draft-dirty="editDirty"
            :menu-open="openMenuId === task.id"
            :error="editingId === task.id ? editValidation : ''"
            :show-reorder="!isSearching"
            :is-first="taskIndex(task) === 0"
            :is-last="isLastTask(task)"
            @expand="toggleExpanded(task.id)"
            @complete="completeTask(task)"
            @start="setStatus(task, 'in_progress')"
            @back="setStatus(task, 'todo')"
            @edit="openEditor(task)"
            @delete="requestDelete(task)"
            @move-up="reorder(task, -1)"
            @move-down="reorder(task, 1)"
            @menu="openMenuId = openMenuId === task.id ? null : task.id"
            @draft="updateDraft"
            @save-edit="saveEditTask"
            @cancel-edit="cancelEdit"
          />
        </ul>
      </section>
    </div>
    <ConfirmationDialog v-if="deleting" title="Delete task?" focus-fallback="#task-title" :pending="pending" :error="actionError" @cancel="cancelDelete" @confirm="deleteTask">
      <p>Delete “{{ deleting.title }}”? This cannot be undone.</p>
    </ConfirmationDialog>
  </section>
</template>

<style scoped>
.task-heading h2 { margin: 0; color: var(--bookedz-ink); }
.task-heading { display: flex; justify-content: space-between; align-items: start; gap: 1rem; margin-bottom: 1rem; }
.tool-description { margin: .35rem 0 0; color: var(--bookedz-muted); }
.task-composer { padding: 1rem; border: 1px solid var(--bookedz-border); border-radius: .9rem; background: var(--bookedz-surface); }
.composer-fields { display: flex; gap: .65rem; }
.composer-fields .form-control { min-width: 0; }
.composer-fields .btn { flex: 0 0 auto; min-height: 44px; }
.composer-secondary { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; margin-top: .45rem; }
.text-button { min-height: 44px; padding: .25rem .4rem; border: 0; background: transparent; color: var(--bookedz-primary-dark); font: inherit; text-decoration: underline; text-underline-offset: .15em; }
.text-button:disabled { opacity: .6; }
.edit-context, .edit-hint, .pinned-label { color: var(--bookedz-muted); font-size: .9rem; }
.notes-field { max-width: 48rem; margin-top: .65rem; }
.task-toolbar { display: grid; grid-template-columns: minmax(13rem, 1fr) auto; align-items: end; gap: .75rem 1rem; margin: 1.2rem 0 .75rem; }
.search-field { max-width: 28rem; }
.search-field .form-label { margin-bottom: .3rem; color: var(--bookedz-ink); font-size: .9rem; }
.status-filters { display: flex; flex-wrap: wrap; gap: .35rem; }
.filter-button { min-height: 44px; padding: .4rem .65rem; border: 1px solid var(--bookedz-border); border-radius: 999px; background: var(--bookedz-surface); color: var(--bookedz-ink); font: inherit; font-size: .9rem; }
.filter-button.active { border-color: var(--bookedz-primary-dark); background: var(--bookedz-glass-active); }
.filter-count, .group-count { margin-left: .2rem; color: var(--bookedz-muted); font-size: .82rem; }
.result-count { grid-column: 1 / -1; margin: -.25rem 0 0; color: var(--bookedz-muted); font-size: .9rem; }
.task-groups { border-top: 1px solid var(--bookedz-border); }
.task-group { border-bottom: 1px solid var(--bookedz-border); }
.group-heading { margin: 0; padding: .7rem .15rem; color: var(--bookedz-ink); font-size: .98rem; font-weight: 650; }
.group-toggle { display: flex; width: 100%; min-height: 44px; align-items: center; gap: .35rem; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; }
.group-toggle > span:last-child { margin-left: auto; color: var(--bookedz-muted); }
.task-list { margin: 0; padding: 0; list-style: none; }
.empty-state { padding: 1rem .25rem; color: var(--bookedz-muted); }
.empty-state p { margin: 0; }
.pinned-editor { margin: 1rem 0; padding: .65rem .85rem; border: 1px solid var(--bookedz-border); border-radius: .75rem; background: var(--bookedz-surface); }
.pinned-list { margin: 0; padding: 0; list-style: none; }
.pinned-label { margin: 0 0 .35rem; }
@media (max-width: 767.98px) {
  .task-toolbar { grid-template-columns: 1fr; }
  .status-filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .filter-button { text-align: left; }
  .composer-fields { align-items: stretch; flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) { .filter-button, .text-button { scroll-behavior: auto; } }
</style>
