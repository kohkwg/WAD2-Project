<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import * as api from '../../utils/eventTeam.js'
const props = defineProps({ compact: { type: Boolean, default: false }, eventId: { type: String, default: '' }, visible: { type: Boolean, default: true }, updates: { type: Number, default: 0 } })
const data = ref(null), loading = ref(false), error = ref(''), actionError = ref(''), success = ref(''), busy = ref(false)
const query = ref(''), role = ref('helper'), results = ref([]), searched = ref(false), searching = ref(false), searchError = ref('')
const feedback = ref(null)
const joinedTeam = ref(null)
const teamToolsPath = team => `/organiser/events/${encodeURIComponent(team.eventId)}/${team.role === 'organiser' ? 'rsvps' : 'check-in'}`
const needsRsvpCancellation = computed(() => actionError.value.startsWith('Cancel your attendee RSVP'))
const owner = computed(() => Boolean(props.eventId && data.value?.isOwner))
const members = computed(() => data.value?.members || [])
const pending = computed(() => data.value?.pending || [])
let active = true, context = 0, request = 0, searchRequest = 0, timer
const canRefresh = () => active && props.visible && document.visibilityState !== 'hidden' && !busy.value
watch(query, () => { searchRequest++; results.value = []; searched.value = false; searching.value = false; searchError.value = '' })
watch(() => props.eventId, () => { context++; request++; searchRequest++; data.value = null; query.value = ''; role.value = 'helper'; actionError.value = ''; success.value = ''; joinedTeam.value = null; busy.value = false; load() })
watch(() => [props.visible, props.updates], () => { if (canRefresh()) load(true) })
async function load(silent = false) {
  if (!api.USING_SUPABASE) return
  const ticket = ++request, current = context, id = props.eventId
  if (!silent) loading.value = true
  error.value = ''
  try {
    const result = id ? await api.getEventTeam(id) : await api.getMyEventTeams()
    if (active && ticket === request && current === context) data.value = result
  } catch (e) { if (active && ticket === request && current === context) error.value = e.message }
  finally { if (active && ticket === request && current === context) loading.value = false }
}
function wake() { if (canRefresh()) load(true) }
onMounted(() => { load(); timer = setInterval(wake, 15_000); window.addEventListener('focus', wake); document.addEventListener('visibilitychange', wake) })
onBeforeUnmount(() => { active = false; context++; request++; searchRequest++; clearInterval(timer); window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake) })
async function search() {
  const term = query.value.trim().replace(/^@/, '').toLowerCase()
  if (!/^[a-z0-9_]{3,20}$/.test(term)) { searchError.value = 'Enter at least 3 letters, numbers or underscores from a username.'; return }
  const ticket = ++searchRequest, current = context
  searching.value = true; searchError.value = ''
  try {
    const rows = await api.searchTeamPeople(props.eventId, term)
    if (active && current === context && ticket === searchRequest) { results.value = rows; searched.value = true }
  } catch (e) { if (active && current === context && ticket === searchRequest) searchError.value = e.message }
  finally { if (active && current === context && ticket === searchRequest) searching.value = false }
}
function personState(id) { return members.value.some(p => p.id === id) ? 'On team' : pending.value.some(p => p.id === id) ? 'Invited' : '' }
async function mutate(action, message, joined = null) {
  if (busy.value) return
  const current = context
  busy.value = true; actionError.value = ''; success.value = ''; joinedTeam.value = null
  try {
    await action()
    if (!active || current !== context) return
    await load(true)
    if (!active || current !== context) return
    joinedTeam.value = joined
    success.value = message
    await nextTick(); feedback.value?.focus({ preventScroll: true })
  } catch (e) { if (active && current === context) actionError.value = e.message }
  finally { if (active && current === context) busy.value = false }
}
const invite = person => mutate(() => api.inviteTeamMember(props.eventId, person.id, role.value), `Invitation sent to @${person.username}.`)
const respond = (invite, accept) => mutate(() => api.respondToTeamInvite(invite.eventId, accept), accept ? `You joined the team for ${invite.title}.` : `Invitation to ${invite.title} declined.`, accept ? invite : null)
</script>

<template>
  <section class="workspace-panel event-team" :class="{ 'event-team--compact': compact }" :aria-label="eventId ? 'Event team' : compact ? 'Team invitations' : 'Your event teams'">
    <header class="team-heading"><div><h2>{{ eventId ? 'Event team' : compact ? 'Team invitations' : 'Your event teams' }}<span v-if="compact && data && !data.signedOut"> ({{ data.invitations.length }})</span></h2><p class="text-body-secondary mb-0">{{ eventId ? 'Invite helpers and co-organisers. They join only after accepting.' : 'Accept team invitations here, then open your event tools.' }}</p></div><button v-if="api.USING_SUPABASE" class="btn btn-outline-secondary" type="button" :disabled="busy || loading" @click="load()">Refresh team</button></header>
    <p v-if="!api.USING_SUPABASE" class="text-body-secondary">Sign in in live mode to use event team invitations.</p>
    <template v-else>
      <p v-if="loading" role="status">Loading event team…</p>
      <div v-dismissible v-if="error" class="alert alert-warning" role="alert">{{ error }} <button type="button" class="btn btn-outline-secondary" :disabled="busy || loading" @click="load()">Retry team</button></div>
      <p v-dismissible v-if="actionError" class="alert alert-danger" role="alert">{{ actionError }}
        <template v-if="needsRsvpCancellation"><RouterLink to="/my-rsvps" class="btn btn-outline-danger ms-2">Go to My RSVPs to cancel</RouterLink><span class="d-block mt-2">After cancelling, come back and accept this invitation.</span></template>
        <template v-else> Your choices are kept; try again.</template>
      </p>
      <p v-dismissible v-if="success" ref="feedback" tabindex="-1" class="alert alert-success" role="status"><template v-if="joinedTeam">You joined the team for <RouterLink class="team-event-link" :to="teamToolsPath(joinedTeam)">{{ joinedTeam.title }}</RouterLink>.</template><template v-else>{{ success }}</template></p>
      <template v-if="data && eventId">
        <h3>Team members</h3>
        <ul class="team-list"><li v-for="person in members" :key="person.id"><div><strong>{{ person.displayName || person.username || 'Team member' }}</strong><span v-if="person.username" class="d-block text-body-secondary">@{{ person.username }}</span></div><span>{{ person.isOwner ? 'Owner' : api.teamRoleLabel(person.role) }}</span></li></ul>
        <template v-if="owner">
          <h3 class="mt-4">Pending invitations</h3><p v-if="!pending.length" class="text-body-secondary">No pending invitations.</p>
          <ul v-else class="team-list"><li v-for="person in pending" :key="person.id"><div><strong>{{ person.displayName || person.username }}</strong><span class="d-block text-body-secondary">@{{ person.username }}</span></div><span>{{ api.teamRoleLabel(person.role) }} · Invited</span></li></ul>
          <form class="mt-4" @submit.prevent="search">
            <h3>Invite someone</h3>
            <p class="text-body-secondary">Helpers can assist with check-in. Co-organisers can manage RSVPs and edit floor plans/programmes using the existing organiser permissions. Tasks, budget, announcements and weather remain owner-only.</p>
            <div class="team-fields"><div><label class="form-label" for="team-username">Find by username</label><input id="team-username" v-model="query" class="form-control" autocomplete="off" autocapitalize="none" :spellcheck="false" maxlength="21" :disabled="busy" aria-describedby="team-search-help"><p id="team-search-help" class="form-text">Enter at least 3 characters from the start of their username.</p></div><div><label class="form-label" for="team-role">Invite as</label><select id="team-role" v-model="role" class="form-select" :disabled="busy"><option value="helper">Helper</option><option value="organiser">Co-organiser</option></select></div><button class="btn btn-primary" type="submit" :disabled="busy || searching">{{ searching ? 'Searching…' : 'Find people' }}</button></div>
            <p v-dismissible v-if="searchError" role="alert" class="text-danger">{{ searchError }}</p><p v-if="searched && !results.length" role="status" class="text-body-secondary">No usernames found.</p>
            <ul class="team-list"><li v-for="person in results" :key="person.id"><div><strong>{{ person.displayName || person.username }}</strong><span class="d-block text-body-secondary">@{{ person.username }}</span></div><button class="btn btn-outline-primary" type="button" :disabled="busy || Boolean(personState(person.id))" :aria-label="`Invite @${person.username}`" @click="invite(person)">{{ personState(person.id) || 'Invite' }}</button></li></ul>
          </form>
        </template>
      </template>
      <p v-else-if="data?.signedOut" class="text-body-secondary">Sign in to see your event team invitations.</p>
      <template v-else-if="data">
        <p v-if="!data.invitations.length" class="text-body-secondary">No event team invitations.</p>
        <ul class="team-list"><li v-for="invitation in data.invitations" :key="invitation.eventId"><div><strong>{{ invitation.title }}</strong><span class="d-block">{{ api.teamRoleLabel(invitation.role) }} · From {{ invitation.ownerName || invitation.ownerUsername || 'Event owner' }}</span></div><div class="team-actions"><button class="btn btn-primary" type="button" :disabled="busy" :aria-label="`Accept team invitation to ${invitation.title}`" @click="respond(invitation, true)">Accept</button><button class="btn btn-outline-secondary" type="button" :disabled="busy" :aria-label="`Decline team invitation to ${invitation.title}`" @click="respond(invitation, false)">Decline</button></div></li></ul>
        <ul class="team-list"><li v-for="team in data.teams" :key="team.eventId"><div><strong><RouterLink class="team-event-link" :to="teamToolsPath(team)">{{ team.title }}</RouterLink></strong><span class="d-block text-body-secondary">{{ api.teamRoleLabel(team.role) }}</span></div><div class="team-actions"><RouterLink class="btn btn-outline-primary" :to="`/organiser/events/${team.eventId}/check-in`">Check-in station</RouterLink><template v-if="team.role === 'organiser'"><RouterLink class="btn btn-outline-secondary" :to="`/organiser/events/${team.eventId}/rsvps`">Manage RSVPs</RouterLink><RouterLink class="btn btn-outline-secondary" :to="`/organiser/events/${team.eventId}/floor-plan`">Floor plan</RouterLink></template></div></li></ul>
      </template>
    </template>
  </section>
</template>

<style scoped>
.event-team { min-width: 0; padding: 1.25rem; border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-surface); }
.team-heading { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:start; gap:1rem; margin-bottom:1.5rem; }
.event-team--compact { padding: 1rem; }
.event-team--compact .team-heading { margin-bottom: .75rem; }
.event-team--compact h2 { font-size: 1.2rem; }
.team-event-link { color: inherit; text-decoration: underline; text-underline-offset: .15em; }
.team-event-link:hover { color: var(--bookedz-primary-dark); }
.team-event-link:focus-visible { outline: 3px solid var(--bookedz-focus, var(--bookedz-primary-dark)); outline-offset: 3px; }
h3 { font-size:1.15rem; }
.team-list { list-style:none; padding:0; margin:0; }
.team-list li { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:.75rem; padding:.8rem 0; border-bottom:1px solid var(--bookedz-border); }
.team-list li > div:first-child { min-width:0; overflow-wrap:anywhere; }
.team-actions { display:flex; flex-wrap:wrap; gap:.5rem; }
.team-fields { display:grid; grid-template-columns:minmax(0,2fr) minmax(0,1fr) auto; gap:1rem; align-items:start; }
.team-fields button { margin-top:2rem; }
.btn { min-height:44px; }
.alert { overflow-wrap:anywhere; }
@media(max-width:767.98px) { .team-fields { grid-template-columns:1fr; } .team-fields button { margin-top:0; } }
</style>
