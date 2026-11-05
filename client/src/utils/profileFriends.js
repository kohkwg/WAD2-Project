// friends: live mode uses the profile_friends_* database functions; demo mode uses sample
// friends in mockapi.js (alex is friends with bea and chen, and dina has sent a request).
import { supabase } from './supabase.js';
import { USING_SUPABASE } from './api.js';
import * as mock from './mockApi.js';
export { USING_SUPABASE };

async function call(name, params) {
  if (!supabase) throw new Error('Sign in in live mode to use friends.');
  const {
    data,
    error
  } = await supabase.rpc(name, params);
  if (error) {
    if (['PGRST202', '42883', '42P01', '42703'].includes(error.code)) throw new Error('Friends are not available yet. Your profile and Go together still work.');
    throw new Error(error.message || 'Could not update friends. Please retry.');
  }
  return data;
}

const clean = query => query.trim().replace(/^@/, '').toLowerCase();

export const getFriends = () => USING_SUPABASE ? call('profile_friends_overview') : mock.getFriends();

export const searchPeople = query => USING_SUPABASE ? call('search_profile_friends', {
  p_query: clean(query)
}) : mock.searchFriends(clean(query));

export const sendRequest = id => USING_SUPABASE ? call('send_profile_friend_request', {
  p_user_id: id
}) : mock.sendFriendRequest(id);

export const respondToRequest = (id, accept) => USING_SUPABASE ? call('respond_profile_friend_request', {
  p_user_id: id,
  p_accept: accept
}) : mock.respondFriendRequest(id, accept);
