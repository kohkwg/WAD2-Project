<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { getGroupComments, addGroupComment, deleteGroupComment } from '../../utils/api.js'

// The group's chat: short messages for members (where to meet, running late…).
const props = defineProps({ groupId: { type: String, required: true }, canPost: Boolean })
const emit = defineEmits(['changed'])
const comments = ref([])
const loaded = ref(false)
const draft = ref('')
const posting = ref(false)
const error = ref('')
const list = ref(null)
const initials = (name) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()

async function load() {
  try { comments.value = await getGroupComments(props.groupId) } catch (e) { error.value = e.message }
  loaded.value = true
}
// Keep up with others' messages while the page is open
let timer
onMounted(() => { load(); timer = setInterval(() => { if (!document.hidden) load() }, 30000) })
onBeforeUnmount(() => clearInterval(timer))

async function post() {
  if (!draft.value.trim() || posting.value) return
  posting.value = true
  error.value = ''
  try {
    await addGroupComment(props.groupId, draft.value)
    draft.value = ''
    await load()
    emit('changed')
    await nextTick()
    (list.value?.$el || list.value)?.lastElementChild?.scrollIntoView({ block: 'nearest' })
  } catch (e) {
    error.value = e.message
  } finally {
    posting.value = false
  }
}
async function remove(comment) {
  try {
    await deleteGroupComment(comment.id)
    comments.value = comments.value.filter((c) => c.id !== comment.id)
    emit('changed')
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <section class="group-chat" aria-labelledby="group-chat-title">
    <h2 id="group-chat-title" class="section-title">Chat</h2>
    <TransitionGroup v-if="comments.length" ref="list" tag="ul" name="chat-in" class="list-unstyled m-0 group-chat-list">
      <li v-for="comment in comments" :key="comment.id" class="group-chat-item">
        <span class="group-chat-avatar" aria-hidden="true">{{ initials(comment.name) }}</span>
        <p class="m-0"><strong>{{ comment.mine ? 'You' : comment.name }}</strong>{{ ' ' }}{{ comment.text }}</p>
        <button v-if="comment.mine" type="button" class="btn btn-link btn-sm p-0 ms-auto text-secondary" @click="remove(comment)">Delete</button>
      </li>
    </TransitionGroup>
    <p v-else-if="loaded" class="text-meta text-secondary m-0">No messages yet. Say where to meet or ask a question.</p>
    <form v-if="canPost" class="group-chat-form" @submit.prevent="post">
      <label class="visually-hidden" for="group-chat-input">Message</label>
      <input id="group-chat-input" v-model="draft" class="form-control" maxlength="280" autocomplete="off" placeholder="Write a message…" />
      <button type="submit" class="btn btn-primary" :disabled="!draft.trim() || posting">Send</button>
    </form>
    <p v-else class="text-caption text-secondary m-0">Join the group to chat.</p>
    <p v-dismissible v-if="error" class="group-chat-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.group-chat { display: grid; gap: 12px; }
.group-chat .section-title { margin: 0; }
.group-chat-list { display: grid; gap: 4px; max-height: 320px; overflow-y: auto; }
.group-chat-item { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; font-size: .95rem; }
.group-chat-item p { overflow-wrap: anywhere; }
.group-chat-avatar { display: inline-grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--bookedz-orange-soft); color: var(--bookedz-primary-dark); font-size: .7rem; font-weight: 700; }
.chat-in-enter-active { transition: opacity var(--bookedz-motion-normal, .24s) var(--bookedz-ease, ease), transform var(--bookedz-motion-normal, .24s) var(--bookedz-ease, ease); }
.chat-in-enter-from { opacity: 0; transform: translateY(10px); }
.chat-in-leave-active { transition: opacity var(--bookedz-motion-fast, .16s) var(--bookedz-ease, ease); }
.chat-in-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .chat-in-enter-active, .chat-in-leave-active { transition: none; } }
.group-chat-form { display: flex; gap: 8px; }
.group-chat-form .form-control,.group-chat-form .btn { min-height: 44px; }
.group-chat-error { margin: 0; color: var(--bookedz-danger); font-size: .9rem; }
</style>
