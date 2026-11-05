<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as friends from '../../utils/profileFriends.js'
// Friends: find accounts by username, send and answer requests. Shown as a
// small side panel in Community (compact) next to Go together.
const props = defineProps({ visible: { type: Boolean, default: true }, updates: { type: Number, default: 0 }, compact: Boolean })
let pendingUpdate = false

const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const actionError = ref('')
const message = ref('')
const feedback = ref(null)
const busy = ref('')
const people = ref([])
const incoming = ref([])
const outgoing = ref([])
const query = ref('')
const results = ref([])
const searching = ref(false)
const searched = ref(false)
const searchError = ref('')
let active = true
let loadVersion = 0
let searchVersion = 0
onBeforeUnmount(() => { active = false; loadVersion++; searchVersion++ })
watch(query, () => { searchVersion++; results.value = []; searching.value = false; searched.value = false; searchError.value = '' })
async function refresh({ silent = false } = {}) {
  const version = ++loadVersion
  if (!silent) loading.value = true
  error.value = ''
  try {
    const data = await friends.getFriends()
    if (!active || version !== loadVersion) return
    people.value = data.friends || []; incoming.value = data.incoming || []; outgoing.value = data.outgoing || []
    results.value = results.value.map(person => ({ ...person, relationship:
      people.value.some(row => row.id === person.id) ? 'friends' :
      incoming.value.some(row => row.id === person.id) ? 'incoming' :
      outgoing.value.some(row => row.id === person.id) ? 'outgoing' : 'none' }))
    loaded.value = true
  } catch (failure) { if (active && version === loadVersion) error.value = failure.message }
  finally { if (active && version === loadVersion) loading.value = false }
}
onMounted(refresh)
watch(() => [props.visible, props.updates], () => { pendingUpdate = true; refreshWhenReady() })
watch(busy, () => refreshWhenReady())
watch(loading, () => refreshWhenReady())
function refreshWhenReady() {
  if (!active || !props.visible || busy.value || !pendingUpdate || loading.value) return
  pendingUpdate = false
  refresh({ silent: true })
}

async function search() {
  const term = query.value.trim().replace(/^@/, '').toLowerCase()
  const version = ++searchVersion
  if (!/^[a-z0-9_]{3,20}$/.test(term)) { searchError.value = 'Enter at least 3 letters, numbers or underscores from a username.'; return }
  searching.value = true; searchError.value = ''; searched.value = false
  try {
    const data = await friends.searchPeople(term)
    if (active && version === searchVersion) { results.value = data || []; searched.value = true }
  } catch (failure) { if (active && version === searchVersion) searchError.value = failure.message }
  finally { if (active && version === searchVersion) searching.value = false }
}
function relationship(person) {
  if (people.value.some(row => row.id === person.id)) return 'friends'
  if (incoming.value.some(row => row.id === person.id)) return 'incoming'
  if (outgoing.value.some(row => row.id === person.id)) return 'outgoing'
  return person.relationship || 'none'
}
const stateLabel = person => ({ friends: 'Already friends', incoming: 'Request received', outgoing: 'Request sent', none: 'Add friend' })[relationship(person)]
async function mutate(id, action, text, status) {
  if (busy.value) return
  busy.value = id; actionError.value = ''; message.value = ''
  try {
    await action()
    if (!active) return
    results.value = results.value.map(person => person.id === id ? { ...person, relationship: status } : person)
    await refresh()
    if (!active) return
    message.value = text
    await nextTick()
    if (active) feedback.value?.focus({ preventScroll: true })
  } catch (failure) { if (active) actionError.value = failure.message }
  finally { if (active) busy.value = '' }
}
const send = person => mutate(person.id, () => friends.sendRequest(person.id), `Friend request sent to @${person.username}.`, 'outgoing')
const respond = (person, accept) => mutate(person.id, () => friends.respondToRequest(person.id, accept), accept ? `You and ${person.displayName || person.username} are now friends.` : `Friend request from ${person.displayName || person.username} declined.`, accept ? 'friends' : 'none')
</script>

<template>
  <section class="friends-panel" :class="{ 'is-compact': compact }" aria-labelledby="friends-title">
    <header class="friends-heading"><div><h2 id="friends-title">Friends</h2><p class="text-body-secondary mb-0">{{ compact ? 'Add people by username. You’re friends once they accept.' : 'Find other accounts by username. You become friends when they accept.' }}</p></div><button class="btn btn-outline-secondary" :class="{ 'btn-sm': compact }" type="button" :disabled="loading || Boolean(busy)" @click="refresh">{{ compact ? 'Refresh' : 'Refresh friends' }}</button></header>
    <p v-if="!friends.USING_SUPABASE" class="friends-demo">Demo: sample friends, saved in this browser. Try usernames like dina_r or farah_ali.</p>
    <div class="friends-body">
      <p v-if="loading" role="status">Loading friends…</p>
      <div v-dismissible v-if="error" class="alert alert-warning" role="alert">{{ error }} <button class="btn btn-outline-secondary" type="button" :disabled="loading || Boolean(busy)" @click="refresh">Retry friends</button></div>
      <p v-dismissible v-if="actionError" class="alert alert-danger" role="alert">{{ actionError }} Try the same action again.</p>
      <p v-dismissible v-if="message" ref="feedback" class="alert alert-success" role="status" tabindex="-1">{{ message }}</p>
      <template v-if="loaded">
        <form class="friend-section" @submit.prevent="search">
          <h3>Find people</h3>
          <label class="form-label" for="friend-search">Username</label>
          <p id="friend-search-hint" class="form-text">Enter at least 3 characters from the start of their username.</p>
          <div class="friend-form-row"><input id="friend-search" v-model="query" class="form-control" maxlength="21" autocomplete="off" autocapitalize="none" :spellcheck="false" aria-describedby="friend-search-hint" :disabled="Boolean(busy)"><button class="btn btn-primary" type="submit" :disabled="searching || Boolean(busy)">{{ searching ? 'Searching…' : 'Find people' }}</button></div>
          <p v-dismissible v-if="searchError" class="text-danger mt-2" role="alert">{{ searchError }}</p>
          <p v-if="searched && !results.length" class="text-body-secondary mt-2" role="status">No usernames found. Check the spelling or ask them to set a username in Profile.</p>
          <ul v-if="results.length" class="friend-list mt-3"><li v-for="person in results" :key="person.id"><div><strong>{{ person.displayName || person.username }}</strong><span class="d-block text-body-secondary">@{{ person.username }}</span></div><button class="btn btn-outline-primary" type="button" :disabled="Boolean(busy) || relationship(person) !== 'none'" :aria-label="`${stateLabel(person)} @${person.username}`" @click="send(person)">{{ stateLabel(person) }}</button></li></ul>
        </form>
        <section class="friend-section" aria-labelledby="requests-title">
          <h3 id="requests-title">Friend requests</h3>
          <p v-if="!incoming.length" class="text-body-secondary">No incoming requests.</p>
          <ul v-else class="friend-list"><li v-for="person in incoming" :key="person.id"><div><strong>{{ person.displayName || person.username }}</strong><span v-if="person.username" class="d-block text-body-secondary">@{{ person.username }}</span></div><div class="friend-actions"><button class="btn btn-primary" type="button" :disabled="Boolean(busy)" :aria-label="`Accept friend request from ${person.username || person.displayName}`" @click="respond(person, true)">Accept</button><button class="btn btn-outline-secondary" type="button" :disabled="Boolean(busy)" :aria-label="`Decline friend request from ${person.username || person.displayName}`" @click="respond(person, false)">Decline</button></div></li></ul>
        </section>
        <section class="friend-section" aria-labelledby="your-friends-title"><h3 id="your-friends-title">Your friends ({{ people.length }})</h3><p v-if="!people.length" class="text-body-secondary">No friends yet. Find someone above and send a request.</p><ul v-else class="friend-list"><li v-for="person in people" :key="person.id"><div><strong>{{ person.displayName || person.username }}</strong><span v-if="person.username" class="d-block text-body-secondary">@{{ person.username }}</span></div><span class="text-body-secondary">Friend</span></li></ul></section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.friends-panel { padding: clamp(1rem, 4vw, 2rem); border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); background: var(--bookedz-surface); }
.friends-heading { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
.friends-heading h2, h3 { font-family: var(--bookedz-heading); }
h3 { font-size: 1.2rem; }
.friend-section { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--bookedz-border); min-width: 0; }
.friend-form-row, .friend-actions { display: flex; gap: .75rem; }
.friend-form-row input { min-width: 0; }
.friend-form-row .btn { flex-shrink: 0; }
.friend-list { padding: 0; margin: 0; list-style: none; }
.friend-list li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .85rem 0; border-bottom: 1px solid var(--bookedz-border); }
.friend-list li > div:first-child { min-width: 0; overflow-wrap: anywhere; }
.btn { min-height: 44px; }
.alert { overflow-wrap: anywhere; }
@media (max-width:575px) { .friend-form-row { flex-direction: column; } .friend-list li, .friend-actions { flex-wrap: wrap; } }
.friends-demo { margin: 0 0 .5rem; color: var(--bookedz-muted); font-size: .82rem; }
/* Side-panel size: tighter spacing, stacked search, smaller headings and buttons */
.is-compact { padding: 1.1rem; }
.is-compact .friends-heading { gap: .5rem; margin-bottom: .75rem; }
.is-compact .friends-heading h2 { margin: 0 0 .25rem; font-size: 1.3rem; }
.is-compact .friends-heading p { font-size: .88rem; }
.is-compact h3 { margin-bottom: .5rem; font-size: 1rem; }
.is-compact .friend-section { margin-top: 1rem; padding-top: 1rem; }
.is-compact .friend-form-row { flex-direction: column; gap: .5rem; }
.is-compact .form-text { margin-top: 0; font-size: .8rem; }
.is-compact .friend-list li { flex-wrap: wrap; gap: .5rem; padding: .6rem 0; }
.is-compact .btn { min-height: 40px; }
.is-compact .friend-actions { gap: .5rem; }
</style>
