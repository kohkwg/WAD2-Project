import { onMounted, onBeforeUnmount } from 'vue';
import * as api from '../utils/api.js';
import { supabase } from '../utils/supabase.js';
import { getFriends } from '../utils/profileFriends.js';
import { getMyEventTeams } from '../utils/eventTeam.js';
import { createNotificationTracker, registrationNotice, eventNotice } from '../utils/userNotifications.js';
import { toast, clearToasts } from './useToast.js';

const activeStatuses = ['confirmed', 'pending', 'waitlisted', 'offered'];

// one watcher for the whole app, with separate history for each signed-in account

export function useUserNotifications() {
  let active = true;
  let generation = 0;
  let userId = null;
  let tracker = null;
  let timer;
  let wakeTimer;
  let stopAuth;
  let channel;
  let busy = false;
  let rerun = false;
  const storageKey = () => `bookedz-notification-state-v1:${api.USING_SUPABASE ? 'live' : 'demo'}:${userId}`;
  function save() {
    try {
      // keep only ids and comparison values, not messages, names or announcement text
      const snapshot = JSON.parse(JSON.stringify(tracker.snapshot()));
      for (const records of Object.values(snapshot)) {
        for (const [id, record] of Object.entries(records)) {
          records[id] = {
            id,
            version: record.version,
            isGroup: record.isGroup
          };
        }
      }
      const encoded = JSON.stringify(snapshot);
      if (localStorage.getItem(storageKey()) !== encoded) localStorage.setItem(storageKey(), encoded);
    } catch {/* notifications still work when browser storage is unavailable */}
  }
  function switchUser(user) {
    const nextId = user?.id || null;
    if (nextId === userId) return;
    generation++;
    userId = nextId;
    tracker = null;
    clearToasts();
    if (channel) supabase?.removeChannel(channel);
    channel = null;
    if (!userId) return;
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(storageKey()) || '{}');
    } catch {/* start a fresh history */}
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
    tracker = createNotificationTracker(saved, notice => {
      toast(notice.message, {
        tone: notice.tone || 'info',
        to: notice.to,
        duration: 10_000
      });
    });
    if (api.USING_SUPABASE && supabase) {
      channel = supabase.channel(`user-notifications-${userId}`).on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'registrations',
        filter: `user_id=eq.${userId}`
      }, wake).subscribe();
    }
  }
  function wake() {
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(refresh, 250);
  }
  function onStorage(event) {
    if (event.key === 'bookedz-feature2-demo') wake();
  }
  async function refresh() {
    if (!active || document.hidden) return;
    if (busy) {
      rerun = true;
      return;
    }
    busy = true;
    const started = generation;
    try {
      const user = await api.getCurrentUser();
      if (!active || started !== generation) return;
      switchUser(user);
      if (!userId) return;
      const ticket = generation;
      const current = tracker;
      const valid = () => active && ticket === generation;

      // each source can fail on its own without clearing another source's history
      async function read(topic, load, build) {
        try {
          const rows = await load();
          if (valid()) current.update(topic, build(rows));
          return rows;
        } catch {
          return null;
        }
      }
      const [registrations, groups, hosted] = await Promise.all([read('registrations', api.getMyRsvps, rows => api.USING_SUPABASE ? [] : rows.map(row => registrationNotice(row, current.get('registrations', String(row.id))))), read('groups', api.getGroups, rows => rows.filter(group => ['host', ...activeStatuses].includes(group.myStatus)).map(group => ({
        id: String(group.id),
        notifyOnAdded: false,
        version: JSON.stringify([group.note, group.capacity, group.visibility, group.joinMode, group.members?.map(member => member.id).sort(), group.pendingCount, group.commentCount]),
        message: `Your group for ${group.event?.title || 'an event'} has an update: members, requests, messages or settings changed.`,
        tone: 'info',
        to: `/groups/${group.id}`
      }))), read('hosted', api.getOrganiserEvents, rows => rows.filter(event => !['group', 'hangout'].includes(event.kind)).map(event => ({
        id: String(event.id),
        notifyOnAdded: false,
        version: `${event.pendingCount || 0}:${event.confirmedCount || 0}:${event.waitlistCount || 0}:${event.offeredCount || 0}`,
        message: `Guest list updated for ${event.title}. ${event.pendingCount || 0} requests need review.`,
        tone: 'info',
        to: `/organiser/events/${event.id}/manage?tab=rsvps`
      }))), read('invites', api.getGroupInvites, rows => rows.map(invite => ({
        id: String(invite.id),
        version: invite.createdAt || String(invite.id),
        showInitially: true,
        message: `You have a group invitation for ${invite.group?.event?.title || 'an event'}.`,
        tone: 'success',
        to: '/community'
      }))), read('group-notices', api.getGroupNotices, rows => rows.map(notice => ({
        id: String(notice.id),
        version: notice.deletedAt || String(notice.id),
        showInitially: true,
        message: `A group you were in for ${notice.eventTitle || 'an event'} was deleted.`,
        tone: 'sad',
        to: '/community'
      }))), read('friends', getFriends, overview => [...(overview.incoming || []).map(person => ({
        id: `request:${person.id}`,
        version: 'pending',
        showInitially: true,
        message: 'You have a new friend request.',
        tone: 'info',
        to: '/community#friends'
      })), ...(overview.friends || []).map(person => ({
        id: `friend:${person.id}`,
        version: 'friends',
        message: 'A friend connection was accepted!',
        tone: 'success',
        to: '/community#friends'
      }))]), ...(api.USING_SUPABASE ? [read('teams', getMyEventTeams, overview => [...(overview.invitations || []).map(invite => ({
        id: `invite:${invite.eventId || invite.id}`,
        version: JSON.stringify(invite),
        showInitially: true,
        message: 'You have an event team invitation.',
        tone: 'success',
        to: '/organiser/events'
      })), ...(overview.teams || []).map(team => ({
        id: `team:${team.eventId || team.id}`,
        version: JSON.stringify(team),
        message: 'Your event team membership was updated.',
        tone: 'info',
        to: '/organiser/events'
      }))])] : [])]);
      if (!valid()) return;

      // private groups may disappear from public lists after rejection; read only our own status
      if (api.USING_SUPABASE && registrations) {
        await read('registration-statuses', async () => {
          const {
            data,
            error
          } = await supabase.from('registrations').select('id,event_id,status,offer_expires_at').eq('user_id', userId);
          if (error) throw error;
          return data;
        }, rows => rows.map(row => {
          const known = registrations.find(item => item.id === row.id);
          const old = current.get('registration-statuses', String(row.id));
          const group = groups?.find(item => item.id === row.event_id);
          return registrationNotice({
            ...known,
            ...row,
            event: known?.event,
            title: group ? `the group for ${group.event?.title || 'your event'}` : undefined,
            isGroup: Boolean(group) || old?.isGroup
          }, old);
        }));
      }
      const events = new Map();
      for (const row of registrations || []) {
        if (row.event && activeStatuses.includes(row.status) && !['group', 'hangout'].includes(row.event.kind)) events.set(row.event.id, row.event);
      }
      for (const event of hosted || []) {
        if (!['group', 'hangout'].includes(event.kind)) events.set(event.id, event);
      }
      if (registrations) current.update('events', [...events.values()].map(eventNotice));

      // members also get updates when a group's before-and-after plan changes
      const memberGroups = (groups || []).filter(group => ['host', 'confirmed'].includes(group.myStatus));
      const groupQueue = [...memberGroups];
      await Promise.all(Array.from({
        length: Math.min(2, groupQueue.length)
      }, async () => {
        while (groupQueue.length && valid()) {
          const group = groupQueue.shift();
          await read(`group-plan:${group.id}`, () => api.getGroup({
            id: group.id
          }), detail => [{
            id: String(group.id),
            version: JSON.stringify(detail.plan),
            notifyOnAdded: false,
            message: `The plan for your group at ${group.event?.title || 'an event'} was updated.`,
            tone: 'info',
            to: `/groups/${group.id}`
          }]);
        }
      }));

      // limit concurrent reads so an account with many events does not flood the browser
      const queue = [...events.values()];
      await Promise.all(Array.from({
        length: Math.min(3, queue.length)
      }, async () => {
        while (queue.length && valid()) {
          const event = queue.shift();
          await read(`announcements:${event.id}`, () => api.getAnnouncements(event.id), posts => posts.map(post => ({
            id: String(post.id),
            version: post.updatedAt || post.createdAt || post.body,
            message: `New announcement for ${event.title}: ${String(post.body || '').slice(0, 180)}`,
            changedMessage: `Announcement updated for ${event.title}: ${String(post.body || '').slice(0, 180)}`,
            tone: 'info',
            to: `/events/${event.id}/rsvp`
          })));
        }
      }));
      if (valid()) save();
    } catch {/* background checks stay quiet and retry on the next poll */} finally {
      busy = false;
      if (rerun && active) {
        rerun = false;
        wake();
      }
    }
  }
  onMounted(() => {
    refresh();
    timer = setInterval(refresh, 15_000);
    stopAuth = api.onAuthChange(user => {
      switchUser(user);
      wake();
    });
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', wake);
  });
  onBeforeUnmount(() => {
    active = false;
    generation++;
    clearInterval(timer);
    clearTimeout(wakeTimer);
    stopAuth?.();
    if (channel) supabase?.removeChannel(channel);
    window.removeEventListener('focus', wake);
    window.removeEventListener('online', wake);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', wake);
  });
}
