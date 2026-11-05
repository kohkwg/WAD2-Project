import { supabase } from './supabase.js'
export { USING_SUPABASE } from './api.js'
async function call(name, params) {
  if (!supabase) throw new Error('Sign in in live mode to use event teams.')
  const { data, error } = await supabase.rpc(name, params)
  if (error) {
    if (['PGRST202','42883','42P01','42703'].includes(error.code)) throw new Error('Event team invitations are not available yet. Your other tools are still available.')
    throw new Error(error.message || 'Could not update the team. Please retry.')
  }
  return data
}
export const getEventTeam = id => call('event_team_workspace', { p_event_id: id })
export const searchTeamPeople = (id, query) => call('search_event_team_people', { p_event_id: id, p_query: query.trim().replace(/^@/, '').toLowerCase() })
export const inviteTeamMember = (id, userId, role) => call('invite_event_team_member', { p_event_id: id, p_user_id: userId, p_role: role })
export async function getMyEventTeams() {
  if (!supabase) return { invitations: [], teams: [], signedOut: true }
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session ? call('my_event_teams') : { invitations: [], teams: [], signedOut: true }
}
export const respondToTeamInvite = (id, accept) => call('respond_event_team_invitation', { p_event_id: id, p_accept: accept })
export const teamRoleLabel = role => role === 'organiser' ? 'Co-organiser' : 'Helper'
