<script setup>
import { ref, watch } from 'vue'
import { getEventHosts } from '@/utils/api'
import { useMyDino } from '@/lib/myDino'
import { dinoById } from '@/lib/dinos'

// "Hosted by" in the event page's banner: a chip per host (the organiser, then any co-organisers)
// with their avatar, name and @username. Public profile fields only. Renders nothing while
// loading, when there is no one to show, or if the hosts can't be loaded (the page carries on).
const props = defineProps({ eventId: { type: String, required: true } })

const hosts = ref([])
const failedAvatars = ref(new Set())
const { myId, dinoFor } = useMyDino()

let request = 0
watch(() => props.eventId, async (id) => {
  const current = ++request
  hosts.value = []
  try {
    const list = await getEventHosts(id)
    if (current === request) hosts.value = Array.isArray(list) ? list : []
  } catch {
    if (current === request) hosts.value = []
  }
}, { immediate: true })

const initials = (name = '') => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'
const roleLabel = (role) => (role === 'organiser' ? 'Organiser' : 'Co-organiser')

// Uploaded profile photos: a full URL, or a key under the public storage address (same rule as EventCard)
function photoUrl(key) {
  if (!key) return ''
  if (/^https?:\/\//i.test(key)) return key
  const base = import.meta.env?.VITE_R2_PUBLIC_URL
  if (!base || !/^https?:\/\//i.test(base)) return ''
  return `${base.replace(/\/$/, '')}/${key.replace(/^\//, '').split('/').map(encodeURIComponent).join('/')}`
}
// Their chosen dino (yours from this browser if you just changed it), then a photo, then initials
function avatarFor(host) {
  const dino = dinoFor(host.id) || dinoById(host.dino)?.src
  if (dino) return { src: dino, dino: true }
  const photo = photoUrl(host.avatarKey)
  return photo && !failedAvatars.value.has(photo) ? { src: photo, dino: false } : null
}
function avatarFailed(src) {
  failedAvatars.value = new Set([...failedAvatars.value, src])
}
</script>

<template>
  <div v-if="hosts.length" class="event-hosts">
    <span class="hosts-label">Hosted by</span>
    <ul class="hosts-list" role="list">
      <li v-for="host in hosts" :key="host.id" class="host" :title="host.username ? `${host.name} (@${host.username}) · ${roleLabel(host.role)}` : `${host.name} · ${roleLabel(host.role)}`">
        <span class="host-avatar" :class="{ 'has-dino': avatarFor(host)?.dino }" aria-hidden="true">
          <img v-if="avatarFor(host)" :src="avatarFor(host).src" alt="" loading="lazy" referrerpolicy="no-referrer"
            @error="avatarFailed(avatarFor(host).src)" />
          <template v-else>{{ initials(host.name) }}</template>
        </span>
        <span class="host-name">{{ host.name }}<template v-if="host.id === myId"> (you)</template></span>
        <span v-if="host.username" class="host-handle">@{{ host.username }}</span>
        <span v-if="host.role !== 'organiser'" class="visually-hidden">, co-organiser</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* A slim line in the event banner: "Hosted by" and a chip per host */
.event-hosts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 14px; }
.hosts-label { color: var(--bookedz-muted, #6b5d52); font-size: .85rem; font-weight: 600; }
.hosts-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.host { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; padding: 3px 10px 3px 3px; border: 1px solid var(--bookedz-border, #e9ded3); border-radius: 99px; background: color-mix(in srgb, var(--bookedz-surface, #fff) 70%, transparent); font-size: .85rem; }
.host-avatar { display: grid; place-items: center; flex: none; overflow: hidden; width: 26px; height: 26px; border-radius: 50%; background: var(--bookedz-orange-soft, #fde3d3); color: var(--bookedz-primary-dark, #b5471b); font-size: .66rem; font-weight: 800; }
.host-avatar img { width: 100%; height: 100%; object-fit: cover; }
/* A dino shows whole, not cropped to the circle */
.host-avatar.has-dino { overflow: visible; background: none; }
.host-avatar.has-dino img { object-fit: contain; }
.host-name { font-weight: 700; color: var(--bookedz-ink, #2b2118); overflow-wrap: anywhere; }
.host-handle { color: var(--bookedz-muted, #6b5d52); overflow-wrap: anywhere; }
</style>
