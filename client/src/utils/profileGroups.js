import { supabase } from './supabase.js'
export { USING_SUPABASE } from './api.js'

async function call(name, params) {
  if (!supabase) throw new Error('Sign in in live mode to use groups.')
  const { data, error } = await supabase.rpc(name, params)
  if (error) {
    if (['PGRST202', '42883', '42P01', '42703'].includes(error.code)) {
      throw new Error('Groups are not available yet. Your profile is still available under Edit profile.')
    }
    throw new Error(error.message || 'Could not update groups. Please retry.')
  }
  return data
}
export const getGroups = () => call('profile_groups_overview')
export const getGroupMembers = id => call('profile_group_members', { p_group_id: id })
export const createGroup = (name, requestId) => call('create_profile_group', { p_name: name.trim(), p_request_id: requestId })
export const searchPeople = query => call('search_group_people', { p_query: query.trim().replace(/^@/, '').toLowerCase() })
export const inviteMember = (groupId, userId) => call('invite_profile_group_member', { p_group_id: groupId, p_user_id: userId })
export const respondToInvite = (groupId, accept) => call('respond_profile_group_invite', { p_group_id: groupId, p_accept: accept })
