import { supabase } from './supabase.js'
export { USING_SUPABASE } from './api.js'
async function call(name, params) {
  if (!supabase) throw new Error('Sign in in live mode to use friends.')
  const { data, error } = await supabase.rpc(name, params)
  if (error) {
    if (['PGRST202', '42883', '42P01', '42703'].includes(error.code)) throw new Error('Friends are not available yet. Your profile and Go together still work.')
    throw new Error(error.message || 'Could not update friends. Please retry.')
  }
  return data
}
export const getFriends = () => call('profile_friends_overview')
export const searchPeople = query => call('search_profile_friends', { p_query: query.trim().replace(/^@/, '').toLowerCase() })
export const sendRequest = id => call('send_profile_friend_request', { p_user_id: id })
export const respondToRequest = (id, accept) => call('respond_profile_friend_request', { p_user_id: id, p_accept: accept })
