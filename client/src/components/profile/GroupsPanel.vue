<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as groups from '../../utils/profileGroups.js'

const props = defineProps({ visible: { type: Boolean, default: true }, updates: { type: Number, default: 0 } })
let pendingUpdate = false

const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const actionError = ref('')
const message = ref('')
const feedback = ref(null)
const busy = ref('')
const myGroups = ref([])
const invitations = ref([])
const selectedId = ref('')
const members = ref([])
const membersLoading = ref(false)
const membersError = ref('')
const groupName = ref('')
const query = ref('')
const results = ref([])
const searching = ref(false)
const searched = ref(false)
const searchError = ref('')
const selected = computed(() => myGroups.value.find(group => group.id === selectedId.value))
const isOwner = computed(() => selected.value?.isOwner)
let active = true
let overviewVersion = 0
let memberVersion = 0
let searchVersion = 0
let createAttempt = null
onBeforeUnmount(() => { active = false; overviewVersion++; memberVersion++; searchVersion++ })
watch(query, () => { searchVersion++; results.value = []; searched.value = false; searching.value = false; searchError.value = '' })
watch(selectedId, () => {
  searchVersion++; results.value = []; searched.value = false; searching.value = false
  query.value = ''; actionError.value = ''; loadMembers()
})

async function refresh({ silent = false } = {}) {
  if (!groups.USING_SUPABASE) return
  const version = ++overviewVersion
  if (!silent) loading.value = true
  error.value = ''
  try {
    const data = await groups.getGroups()
    if (!active || version !== overviewVersion) return
    myGroups.value = data.groups || []
    invitations.value = data.invitations || []
    loaded.value = true
    if (!myGroups.value.some(group => group.id === selectedId.value)) selectedId.value = myGroups.value[0]?.id || ''
  } catch (failure) {
    if (active && version === overviewVersion) error.value = failure.message
  } finally { if (active && version === overviewVersion) loading.value = false }
}
onMounted(refresh)
watch(() => [props.visible, props.updates], () => { pendingUpdate = true; refreshWhenReady() })
watch(busy, () => refreshWhenReady())
watch(loading, () => refreshWhenReady())
async function refreshWhenReady() {
  if (!active || !props.visible || busy.value || !pendingUpdate || loading.value) return
  pendingUpdate = false
  const id = selectedId.value
  await refresh({ silent: true })
  if (active && selectedId.value === id && id) await loadMembers({ silent: true })
}


async function loadMembers({ silent = false } = {}) {
  const id = selectedId.value
  const version = ++memberVersion
  if (!silent) { members.value = []; membersLoading.value = Boolean(id) }
  membersError.value = ''
  if (!id) return
  try {
    const data = await groups.getGroupMembers(id)
    if (active && version === memberVersion) members.value = data || []
  } catch (failure) {
    if (active && version === memberVersion) membersError.value = failure.message
  } finally { if (active && version === memberVersion) membersLoading.value = false }
}
async function announce(text) {
  message.value = text
  await nextTick()
  if (active) feedback.value?.focus({ preventScroll: true })
}
async function mutate(key, action, success) {
  if (busy.value) return
  busy.value = key; actionError.value = ''; message.value = ''
  try {
    await action()
    if (!active) return
    await refresh()
    if (active) await announce(success)
  } catch (failure) { if (active) actionError.value = failure.message }
  finally { if (active) busy.value = '' }
}
async function create() {
  const name = groupName.value.trim()
  if (!name || name.length > 60) { actionError.value = 'Enter a group name of 1–60 characters.'; return }
  if (!createAttempt || createAttempt.name !== name) createAttempt = { name, id: crypto.randomUUID() }
  await mutate('create', async () => {
    const id = await groups.createGroup(name, createAttempt.id)
    if (!active) return
    groupName.value = ''; createAttempt = null
    selectedId.value = id
  }, 'Group created. Find friends below to invite them.')
}
async function search() {
  const term = query.value.trim().replace(/^@/, '').toLowerCase()
  const version = ++searchVersion
  if (!/^[a-z0-9_]{3,20}$/.test(term)) { searchError.value = 'Enter at least 3 letters, numbers or underscores from a username.'; return }
  searching.value = true; searchError.value = ''; searched.value = false
  try {
    const data = await groups.searchPeople(term)
    if (active && version === searchVersion) { results.value = data || []; searched.value = true }
  } catch (failure) { if (active && version === searchVersion) searchError.value = failure.message }
  finally { if (active && version === searchVersion) searching.value = false }
}
const memberStatus = id => members.value.find(member => member.id === id)?.status
async function invite(person) {
  const id = selectedId.value
  await mutate(`invite-${person.id}`, async () => {
    await groups.inviteMember(id, person.id)
    if (active && id === selectedId.value) await loadMembers()
  }, `Invitation sent to @${person.username}.`)
}
async function respond(invitation, accept) {
  await mutate(`respond-${invitation.id}`, () => groups.respondToInvite(invitation.id, accept), accept ? `You joined ${invitation.name}.` : `Invitation to ${invitation.name} declined.`)
}
</script>

<template>
  <section class="groups-panel" aria-labelledby="groups-title">
    <header class="groups-heading"><div><h2 id="groups-title">Groups</h2><p class="text-body-secondary mb-0">Bring your friends together. Invitations need their approval before they join.</p></div><button v-if="groups.USING_SUPABASE" class="btn btn-outline-secondary" type="button" :disabled="loading || Boolean(busy)" @click="refresh">Refresh groups</button></header>
    <p v-if="!groups.USING_SUPABASE" class="alert alert-info">Sign in in live mode to create groups and invite friends.</p>
    <template v-else>
      <p v-if="loading" role="status">Loading groups…</p>
      <div v-if="error" class="alert alert-warning" role="alert">{{ error }} <button class="btn btn-outline-secondary" type="button" :disabled="loading || Boolean(busy)" @click="refresh">Retry groups</button></div>
      <p v-if="actionError" class="alert alert-danger" role="alert">{{ actionError }} Try again using the same action.</p>
      <p v-if="message" ref="feedback" class="alert alert-success" role="status" tabindex="-1">{{ message }}</p>
      <template v-if="loaded">
        <section v-if="invitations.length" class="group-section" aria-labelledby="invites-title">
          <h3 id="invites-title">Invitations</h3>
          <ul class="group-list"><li v-for="invitation in invitations" :key="invitation.id"><div><strong>{{ invitation.name }}</strong><p class="text-body-secondary mb-0">From {{ invitation.ownerName || 'Group owner' }}<span v-if="invitation.ownerUsername"> (@{{ invitation.ownerUsername }})</span></p></div><div class="group-actions"><button class="btn btn-primary" type="button" :disabled="Boolean(busy)" :aria-label="`Accept invitation to ${invitation.name}`" @click="respond(invitation, true)">Accept</button><button class="btn btn-outline-secondary" type="button" :disabled="Boolean(busy)" :aria-label="`Decline invitation to ${invitation.name}`" @click="respond(invitation, false)">Decline</button></div></li></ul>
        </section>
        <form class="group-section" @submit.prevent="create">
          <h3>Create a group</h3>
          <label class="form-label" for="group-name">Group name</label>
          <div class="group-form-row"><input id="group-name" v-model="groupName" class="form-control" maxlength="60" required :disabled="Boolean(busy)"><button class="btn btn-primary" :disabled="Boolean(busy)" type="submit">{{ busy === 'create' ? 'Creating…' : 'Create group' }}</button></div>
        </form>
        <section class="group-section" aria-labelledby="my-groups-title">
          <h3 id="my-groups-title">Your groups</h3>
          <p v-if="!myGroups.length" class="text-body-secondary">No groups yet. Create one or accept an invitation from a friend.</p>
          <template v-else>
            <label class="form-label" for="selected-group">Choose a group</label>
            <select id="selected-group" v-model="selectedId" class="form-select mb-3" :disabled="Boolean(busy)"><option v-for="group in myGroups" :key="group.id" :value="group.id">{{ group.name }}{{ group.isOwner ? ' (you own this group)' : '' }}</option></select>
            <p v-if="membersLoading" role="status">Loading members…</p>
            <div v-else-if="membersError" class="alert alert-danger" role="alert">{{ membersError }} <button class="btn btn-outline-secondary" type="button" @click="loadMembers">Retry members</button></div>
            <ul v-else class="group-list mb-3"><li v-for="member in members" :key="member.id"><div><strong>{{ member.displayName || member.username || 'Group member' }}</strong><span v-if="member.username" class="d-block text-body-secondary">@{{ member.username }}</span></div><span class="member-status">{{ member.isOwner ? 'Owner' : member.status === 'invited' ? 'Invited' : 'Member' }}</span></li></ul>
            <form v-if="isOwner" @submit.prevent="search">
              <h3>Invite friends</h3>
              <label for="friend-username" class="form-label">Find by username</label>
              <p id="friend-search-help" class="form-text">Enter at least 3 characters from the start of their username. Only people with a username appear.</p>
              <div class="group-form-row"><input id="friend-username" v-model="query" class="form-control" maxlength="21" autocomplete="off" autocapitalize="none" :spellcheck="false" aria-describedby="friend-search-help" :disabled="Boolean(busy)"><button class="btn btn-outline-primary" :disabled="searching || Boolean(busy)" type="submit">{{ searching ? 'Searching…' : 'Find people' }}</button></div>
              <p v-if="searchError" class="text-danger mt-2" role="alert">{{ searchError }}</p>
              <p v-if="searched && !results.length" class="text-body-secondary mt-2" role="status">No usernames found. Check the spelling or ask your friend to set a username in Profile.</p>
              <ul v-if="results.length" class="group-list mt-3"><li v-for="person in results" :key="person.id"><div><strong>{{ person.displayName || person.username }}</strong><span class="d-block text-body-secondary">@{{ person.username }}</span></div><button class="btn btn-primary" type="button" :disabled="Boolean(busy) || membersLoading || Boolean(membersError) || Boolean(memberStatus(person.id))" :aria-label="`Invite @${person.username}`" @click="invite(person)">{{ memberStatus(person.id) === 'accepted' ? 'Already a member' : memberStatus(person.id) === 'invited' ? 'Invited' : 'Invite' }}</button></li></ul>
            </form>
            <p v-else class="text-body-secondary">The group owner can invite more friends.</p>
          </template>
        </section>
      </template>
    </template>
  </section>
</template>

<style scoped>
.groups-panel { padding: clamp(1rem, 4vw, 2rem); border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); background: var(--bookedz-surface); }
.groups-heading { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
.groups-heading h2 { font-family: var(--bookedz-heading); }
.group-section { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--bookedz-border); min-width: 0; }
h3 { font-size: 1.2rem; font-family: var(--bookedz-heading); }
.group-form-row { display: flex; gap: .75rem; }
.group-form-row input { min-width: 0; }
.group-form-row .btn { flex-shrink: 0; }
.group-list { padding: 0; margin: 0; list-style: none; }
.group-list li { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .85rem 0; border-bottom: 1px solid var(--bookedz-border); }
.group-list li > div:first-child { min-width: 0; overflow-wrap: anywhere; }
.group-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
.member-status { color: var(--bookedz-muted); font-size: .85rem; }
.btn { min-height: 44px; }
.alert { overflow-wrap: anywhere; }
@media (max-width: 575px) { .group-form-row { flex-direction: column; } .group-list li { flex-wrap: wrap; } }
</style>
