<script setup>
import { nextTick, ref } from 'vue'
import ConfirmationDialog from './ConfirmationDialog.vue'
defineProps({ posts: { type: Array, required: true }, pending: Boolean, actionError: String })
const emit = defineEmits(['create', 'update', 'delete', 'cancel-action'])
const body = ref('')
const bodyInput = ref(null)
const editingId = ref(null)
const deleting = ref(null)
const validation = ref('')
async function focusEditor() {
  await nextTick()
  bodyInput.value?.focus({ preventScroll: true })
  bodyInput.value?.scrollIntoView({ block: 'center' })
}
function edit(post) {
  editingId.value = post.id; body.value = post.body; validation.value = ''
  focusEditor()
}
function clearDraft() { body.value = ''; editingId.value = null; validation.value = '' }
function save() {
  if (!body.value.trim()) { validation.value = 'Enter announcement text.'; return }
  const savedBody = body.value; const id = editingId.value
  emit(id ? 'update' : 'create', { id, body: savedBody.trim(), done: () => { if (body.value === savedBody && editingId.value === id) clearDraft() } })
}
function deletePost() { const id = deleting.value.id; emit('delete', { id, done: () => { if (editingId.value === id) clearDraft(); deleting.value = null } }) }
function cancelDelete() { deleting.value = null; emit('cancel-action') }
function date(value) { return new Date(value).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' }) + ' SGT' }
</script>

<template>
  <section aria-labelledby="announcements-heading">
    <div class="tool-heading"><div><h2 id="announcements-heading" tabindex="-1">Announcements</h2><p class="tool-description">Keep participants up to date. Published updates appear on the public event page.</p></div><button id="announcements-write" class="btn btn-outline-primary" type="button" :disabled="pending" @click="focusEditor">{{ editingId ? 'Continue editing' : 'Write announcement' }}</button></div>

    <p v-if="!posts.length" class="text-secondary">No announcements yet.</p>
    <TransitionGroup name="organiser-list" tag="div">
    <article v-for="post in posts" :key="post.id" data-organiser-enter class="announcement-entry border-bottom py-3">
      <p class="post-body">{{ post.body }}</p>
      <p class="small text-secondary"><time :datetime="post.createdAt">{{ date(post.createdAt) }}</time><span v-if="post.updatedAt"> · Edited {{ date(post.updatedAt) }}</span></p>
      <div v-if="post.kind === 'manual'" class="d-flex gap-2"><button type="button" class="btn btn-sm btn-outline-primary" :disabled="pending" :aria-label="'Edit announcement: ' + post.body" @click="edit(post)">Edit</button><button type="button" class="btn btn-sm btn-outline-danger" :disabled="pending" :aria-label="'Delete announcement: ' + post.body" @click="deleting = post">Delete</button></div>
      <p v-else class="small text-secondary mb-0"><span class="badge text-bg-info me-1">Venue update</span>Automatic event history · cannot be edited or deleted.</p>
    </article>
    </TransitionGroup>
    <form class="workspace-panel announcement-editor mt-4" data-workspace-tour="announcements" @submit.prevent="save">
      <h3 class="section-heading">{{ editingId ? 'Edit announcement' : 'New announcement' }}</h3>
      <fieldset :disabled="pending"><label for="announcement-body" class="form-label">Announcement text</label><textarea id="announcement-body" ref="bodyInput" v-model="body" class="form-control mb-3" required rows="4" /><p v-if="validation" class="text-danger" role="alert">{{ validation }}</p><div class="d-flex flex-wrap gap-2"><button type="submit" class="btn btn-primary">{{ editingId ? 'Save announcement' : 'Publish announcement' }}</button><button v-if="editingId" type="button" class="btn btn-outline-secondary" @click="clearDraft">Cancel edit</button></div></fieldset>
    </form>
    <ConfirmationDialog v-if="deleting" title="Delete announcement?" focus-fallback="#announcements-write" :pending="pending" :error="actionError" @cancel="cancelDelete" @confirm="deletePost"><p>This removes the announcement from the public event feed.</p></ConfirmationDialog>
  </section>
</template>
<style scoped>
.announcement-editor { max-width: 56rem; padding: clamp(1rem, 2vw, 1.4rem); border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.announcement-editor .btn, .announcement-entry .btn { min-height: 44px; }
.announcement-entry { padding: 1.1rem 1.15rem !important; margin-bottom: .75rem; border: 1px solid var(--bookedz-border) !important; border-radius: .95rem; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); transition: border-color .18s ease, transform .18s ease; }
.announcement-entry:first-of-type { border-top: 1px solid var(--bookedz-border); }
.announcement-entry:hover { border-color: var(--bookedz-control-border) !important; transform: translateY(-1px); }
.post-body { margin-bottom: .65rem; color: var(--bookedz-ink); line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.announcement-entry time { color: var(--bookedz-muted); }
@media (prefers-reduced-motion: reduce) { .announcement-entry { transition: none; } }
</style>
