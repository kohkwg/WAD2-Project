<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import { getCurrentUser } from '../utils/api.js'
import islandImage from '../assets/illustrations/singapore-clean.webp'

// Posts are kept in this browser only (no shared backend table yet).
const STORAGE_KEY = 'bookedz-community-posts'
const MAX_LENGTH = 280

const user = ref(null)
const posts = ref(load())
const draft = ref('')
const query = ref('')

// Attached photos/videos live in IndexedDB (too big for localStorage); a post only
// keeps { kind, id } and the object URLs below are rebuilt on load.
const MAX_MEDIA_BYTES = 25 * 1024 * 1024
const attachment = ref(null) // { file, url, kind }
const attachError = ref('')
const fileInput = ref(null)
const mediaUrls = ref({}) // post id -> object URL

function mediaDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('bookedz-community', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('media')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function mediaTx(mode, run) {
  const db = await mediaDb()
  try {
    return await new Promise((resolve, reject) => {
      const req = run(db.transaction('media', mode).objectStore('media'))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally { db.close() }
}
const putMedia = (id, blob) => mediaTx('readwrite', store => store.put(blob, id))
const getMedia = (id) => mediaTx('readonly', store => store.get(id))
const deleteMedia = (id) => mediaTx('readwrite', store => store.delete(id))

async function restoreMedia() {
  for (const post of posts.value) {
    if (!post.media || mediaUrls.value[post.id]) continue
    try {
      const blob = await getMedia(post.media.id)
      if (blob) mediaUrls.value = { ...mediaUrls.value, [post.id]: URL.createObjectURL(blob) }
    } catch { /* media unavailable: show the text only */ }
  }
}

function clearAttachment() {
  if (attachment.value) URL.revokeObjectURL(attachment.value.url)
  attachment.value = null
  if (fileInput.value) fileInput.value.value = ''
}
function onFilePicked(event) {
  const file = event.target.files?.[0]
  if (!file) return
  attachError.value = ''
  const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : ''
  if (!kind) { attachError.value = 'Choose a photo or a video.'; event.target.value = ''; return }
  if (file.size > MAX_MEDIA_BYTES) { attachError.value = 'That file is over 25 MB.'; event.target.value = ''; return }
  clearAttachment()
  attachment.value = { file, kind, url: URL.createObjectURL(file) }
}

// Images are saved by key, not URL, because built asset URLs change between builds.
const IMAGES = { island: { src: islandImage, alt: 'Illustrated map of Singapore' } }

function samplePosts() {
  const now = Date.now()
  const minutes = (n) => now - n * 60 * 1000
  return [
    { id: 'sample-1', authorId: 'sample', handle: 'ethan', text: 'coders assembly is so fun!', createdAt: minutes(25), likedBy: [], baseLikes: 12 },
    { id: 'sample-2', authorId: 'sample', handle: 'mei', text: 'what event should i go to...', createdAt: minutes(95), likedBy: [], baseLikes: 3 },
    { id: 'sample-3', authorId: 'sample', handle: 'priya', text: 'this event is so fun!', image: 'island', createdAt: minutes(240), likedBy: [], baseLikes: 27 },
  ]
}

// Sample posts always appear (they can be liked but not deleted); a saved copy,
// with this browser's like, replaces its sample.
function load() {
  let saved = []
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (Array.isArray(parsed)) saved = parsed
  } catch { /* unreadable storage: start from the samples */ }
  const have = new Set(saved.map(p => p.id))
  return [...saved, ...samplePosts().filter(p => !have.has(p.id))]
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(posts.value)) } catch { /* storage unavailable */ }
}

// Below lg the composer scrolls away; once it is above the viewport a floating
// button takes you back to it.
const composerEl = ref(null)
const draftEl = ref(null)
const composerPassed = ref(false)
let observer = null
watch(composerEl, (el) => {
  observer?.disconnect()
  composerPassed.value = false
  if (!el || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(([entry]) => {
    composerPassed.value = !entry.isIntersecting && entry.boundingClientRect.bottom < 0
  })
  observer.observe(el)
}, { flush: 'post' })
onBeforeUnmount(() => {
  observer?.disconnect()
  clearAttachment()
  Object.values(mediaUrls.value).forEach(url => URL.revokeObjectURL(url))
})

async function goToComposer() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  composerEl.value?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  await nextTick()
  draftEl.value?.focus({ preventScroll: true })
}

onMounted(async () => {
  restoreMedia()
  try { user.value = await getCurrentUser() } catch { user.value = null }
})

const handle = computed(() => user.value?.email?.split('@')[0] || '')
const remaining = computed(() => MAX_LENGTH - draft.value.length)
const canPost = computed(() => !!user.value && (draft.value.trim().length > 0 || !!attachment.value) && remaining.value >= 0 && !posting.value)
const posting = ref(false)

const visiblePosts = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = [...posts.value].sort((a, b) => b.createdAt - a.createdAt)
  if (!q) return list
  return list.filter(p => p.text.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q) || (p.replies || []).some(r => r.text.toLowerCase().includes(q)))
})

async function submit() {
  if (!canPost.value) return
  posting.value = true
  attachError.value = ''
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const attached = attachment.value
  try {
    if (attached) await putMedia(id, attached.file)
  } catch {
    attachError.value = 'Could not save that file in this browser. Try a smaller one.'
    posting.value = false
    return
  }
  posts.value = [...posts.value, {
    id,
    authorId: user.value.id,
    handle: handle.value,
    text: draft.value.trim(),
    media: attached ? { kind: attached.kind, id } : undefined,
    createdAt: Date.now(),
    likedBy: [],
  }]
  if (attached) {
    mediaUrls.value = { ...mediaUrls.value, [id]: attached.url } // keep the preview's URL
    attachment.value = null
    if (fileInput.value) fileInput.value.value = ''
  }
  draft.value = ''
  persist()
  posting.value = false
}

function toggleLike(post) {
  if (!user.value) return
  const id = user.value.id
  post.likedBy = post.likedBy.includes(id) ? post.likedBy.filter(x => x !== id) : [...post.likedBy, id]
  persist()
}
const likeCount = (post) => (post.baseLikes || 0) + post.likedBy.length
// Replies are stored on their post (post.replies), shown in an expandable thread.
const openThreads = ref({}) // post id -> true when the thread is open
const replyDrafts = ref({}) // post id -> text being typed
const replyCount = (post) => (post.replies || []).length
const toggleThread = (post) => { openThreads.value = { ...openThreads.value, [post.id]: !openThreads.value[post.id] } }
const canReply = (post) => !!user.value && (replyDrafts.value[post.id] || '').trim().length > 0

function addReply(post) {
  if (!canReply(post)) return
  post.replies = [...(post.replies || []), {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    authorId: user.value.id,
    handle: handle.value,
    text: replyDrafts.value[post.id].trim(),
    createdAt: Date.now(),
  }]
  replyDrafts.value = { ...replyDrafts.value, [post.id]: '' }
  persist()
}
function removeReply(post, reply) {
  post.replies = post.replies.filter(r => r.id !== reply.id)
  persist()
}
const liked = (post) => !!user.value && post.likedBy.includes(user.value.id)

function remove(post) {
  if (post.media) {
    deleteMedia(post.media.id).catch(() => {})
    if (mediaUrls.value[post.id]) URL.revokeObjectURL(mediaUrls.value[post.id])
    const { [post.id]: _gone, ...rest } = mediaUrls.value
    mediaUrls.value = rest
  }
  posts.value = posts.value.filter(p => p.id !== post.id)
  persist()
}

function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return new Date(ts).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}
</script>

<template>
  <div class="container community-page">
    <div class="community-feed">
      <h1 class="h3 mb-3 community-title">Community</h1>

      <div class="community-side">
      <form class="community-search" role="search" @submit.prevent>
        <label class="visually-hidden" for="community-search">Search posts</label>
        <input id="community-search" v-model="query" type="search" class="form-control" placeholder="Search posts" autocomplete="off">
      </form>

      <form v-if="user" ref="composerEl" class="community-composer" @submit.prevent="submit">
        <span class="community-avatar" aria-hidden="true">{{ handle.charAt(0).toUpperCase() }}</span>
        <div class="flex-grow-1">
          <label class="visually-hidden" for="community-draft">What's happening?</label>
          <textarea id="community-draft" ref="draftEl" v-model="draft" class="form-control" rows="2" placeholder="What's happening?" maxlength="280" />
          <div v-if="attachment" class="community-attachment mt-2">
            <img v-if="attachment.kind === 'image'" :src="attachment.url" alt="Selected photo preview">
            <video v-else :src="attachment.url" controls preload="metadata" aria-label="Selected video preview" />
            <button class="community-attachment-remove" type="button" aria-label="Remove attachment" @click="clearAttachment">&times;</button>
          </div>
          <p v-if="attachError" class="small text-danger mt-2 mb-0" role="alert">{{ attachError }}</p>
          <div class="d-flex align-items-center gap-3 mt-2">
            <input ref="fileInput" class="visually-hidden" type="file" accept="image/*,video/*" tabindex="-1" @change="onFilePicked">
            <button class="community-attach" type="button" aria-label="Add photo or video" title="Add photo or video" @click="fileInput.click()">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg>
            </button>
            <span class="ms-auto" />
            <span class="small" :class="remaining < 20 ? 'text-danger' : 'text-secondary'" aria-live="polite">{{ remaining }}</span>
            <button class="btn btn-primary btn-sm px-3" type="submit" :disabled="!canPost">Post</button>
          </div>
        </div>
      </form>
      <p v-else class="community-signin">
        <RouterLink to="/login?redirect=/community">Sign in</RouterLink> to post and like.
      </p>

      </div>

      <div class="community-main">
      <ul class="community-posts list-unstyled mb-0">
        <li v-for="post in visiblePosts" :key="post.id" class="community-post">
          <span class="community-avatar" aria-hidden="true">{{ post.handle.charAt(0).toUpperCase() }}</span>
          <div class="flex-grow-1 min-w-0">
            <div class="d-flex align-items-baseline gap-2">
              <strong>{{ post.handle }}</strong>
              <span class="text-secondary small">· {{ ago(post.createdAt) }}</span>
              <button v-if="user && user.id === post.authorId" class="btn btn-link btn-sm ms-auto p-0 text-secondary" type="button" @click="remove(post)">Delete</button>
            </div>
            <p class="community-text mb-2">{{ post.text }}</p>
            <img v-if="IMAGES[post.image]" class="community-image mb-2" :src="IMAGES[post.image].src" :alt="IMAGES[post.image].alt" loading="lazy">
            <template v-if="post.media && mediaUrls[post.id]">
              <img v-if="post.media.kind === 'image'" class="community-image mb-2" :src="mediaUrls[post.id]" alt="Photo attached to this post" loading="lazy">
              <video v-else class="community-image mb-2" :src="mediaUrls[post.id]" controls preload="metadata" aria-label="Video attached to this post" />
            </template>
            <div class="d-flex align-items-center gap-3">
              <button class="community-like" type="button" :aria-pressed="liked(post)" :disabled="!user" @click="toggleLike(post)">
                <span aria-hidden="true">{{ liked(post) ? '♥' : '♡' }}</span>
                <span>{{ likeCount(post) }}</span>
                <span class="visually-hidden">likes</span>
              </button>
              <button class="community-like" type="button" :aria-expanded="!!openThreads[post.id]" :aria-controls="`replies-${post.id}`" @click="toggleThread(post)">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12Z"/></svg>
                <span>{{ replyCount(post) }}</span>
                <span class="visually-hidden">replies</span>
              </button>
            </div>

            <div v-if="openThreads[post.id]" :id="`replies-${post.id}`" class="community-thread">
              <ul v-if="replyCount(post)" class="list-unstyled mb-2">
                <li v-for="reply in post.replies" :key="reply.id" class="community-reply">
                  <span class="community-avatar community-avatar-sm" aria-hidden="true">{{ reply.handle.charAt(0).toUpperCase() }}</span>
                  <div class="flex-grow-1 min-w-0">
                    <div class="d-flex align-items-baseline gap-2">
                      <strong>{{ reply.handle }}</strong>
                      <span class="text-secondary small">· {{ ago(reply.createdAt) }}</span>
                      <button v-if="user && user.id === reply.authorId" class="btn btn-link btn-sm ms-auto p-0 text-secondary" type="button" @click="removeReply(post, reply)">Delete</button>
                    </div>
                    <p class="community-text mb-0">{{ reply.text }}</p>
                  </div>
                </li>
              </ul>
              <p v-else class="small text-secondary mb-2">No replies yet.</p>
              <form v-if="user" class="d-flex gap-2" @submit.prevent="addReply(post)">
                <label class="visually-hidden" :for="`reply-${post.id}`">Reply to {{ post.handle }}</label>
                <input :id="`reply-${post.id}`" v-model="replyDrafts[post.id]" type="text" class="form-control form-control-sm" placeholder="Post your reply" maxlength="280" autocomplete="off">
                <button class="btn btn-primary btn-sm px-3" type="submit" :disabled="!canReply(post)">Reply</button>
              </form>
              <p v-else class="small text-secondary mb-0"><RouterLink to="/login?redirect=/community">Sign in</RouterLink> to reply.</p>
            </div>
          </div>
        </li>
      </ul>

      <p v-if="!visiblePosts.length" class="text-secondary text-center py-5" role="status">
        {{ query.trim() ? 'No posts match your search.' : 'No posts yet. Be the first to say something.' }}
      </p>
      </div>
    </div>

    <button v-if="user && composerPassed" class="community-fab" type="button" aria-label="Create new post" @click="goToComposer">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
    </button>
  </div>
</template>

<style scoped>
.community-page { padding-block: 1.5rem 3rem; }
.community-feed {
  max-width: 600px;
  margin-inline: auto;
}
/* lg and up: posts take ~70% on the left; search + composer stay fixed on the
   right while only the posts scroll with the page. */
@media (min-width: 992px) {
  .community-feed {
    max-width: none;
    display: grid;
    grid-template-columns: 7fr 3fr;
    grid-template-areas: 'title side' 'main side';
    column-gap: 1.5rem;
    align-items: start;
  }
  .community-title { grid-area: title; }
  .community-main { grid-area: main; min-width: 0; }
  .community-side {
    grid-area: side;
    position: sticky;
    top: 7rem;
  }
}
.community-search { margin-bottom: 1rem; }
.community-composer { scroll-margin-top: 7rem; }
.community-attach {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--bookedz-primary-dark);
}
.community-attach:hover { background: var(--bookedz-border); }
.community-attachment { position: relative; }
.community-attachment img,
.community-attachment video {
  display: block;
  width: 100%;
  max-height: 16rem;
  object-fit: cover;
  border: 1px solid var(--bookedz-border);
  border-radius: 1rem;
}
.community-attachment-remove {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 1.5rem;
  line-height: 1;
}
.community-thread {
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--bookedz-border);
}
.community-reply { display: flex; gap: 0.5rem; padding-block: 0.5rem; }
.community-avatar-sm { width: 1.75rem; height: 1.75rem; font-size: 0.8rem; }
.community-fab {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 1030;
  width: 3.5rem;
  height: 3.5rem;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: var(--bookedz-primary-dark);
  color: #fff;
  box-shadow: var(--bookedz-shadow, 0 6px 18px rgba(0, 0, 0, 0.35));
}
.community-fab:focus-visible { outline: 3px solid var(--bookedz-ink); outline-offset: 3px; }
@media (min-width: 992px) { .community-fab { display: none; } }
.community-composer,
.community-post {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--bookedz-border);
  background: var(--bookedz-surface);
}
.community-composer { border-radius: 1rem; margin-bottom: 1rem; }
.community-posts { border-radius: 1rem; overflow: hidden; }
.community-post + .community-post { border-top: 0; }
.community-post:first-child { border-radius: 1rem 1rem 0 0; }
.community-post:last-child { border-radius: 0 0 1rem 1rem; }
.community-post:only-child { border-radius: 1rem; }
.community-avatar {
  flex: none;
  width: 2.5rem;
  height: 2.5rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--bookedz-primary-dark);
  color: #fff;
  font-weight: 700;
}
.community-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.community-image {
  display: block;
  width: 100%;
  max-height: 22rem;
  object-fit: cover;
  border: 1px solid var(--bookedz-border);
  border-radius: 1rem;
}
.community-like {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.75rem;
  padding: 0 0.5rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--bookedz-muted);
}
.community-like:hover:not(:disabled),
.community-like[aria-pressed='true'] { color: var(--bookedz-primary-dark); }
.community-signin {
  padding: 1rem;
  margin-bottom: 1rem;
  border: 1px dashed var(--bookedz-border);
  border-radius: 1rem;
  color: var(--bookedz-muted);
}
.min-w-0 { min-width: 0; }
</style>
