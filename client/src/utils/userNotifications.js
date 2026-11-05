// store a comparison token rather than the private text used to build it

export function notificationVersion(value) {
  let first = 2166136261;
  let second = 5381;
  for (const letter of String(value)) {
    first = Math.imul(first ^ letter.charCodeAt(0), 16777619);
    second = Math.imul(second, 33) ^ letter.charCodeAt(0);
  }
  return `${first >>> 0}:${second >>> 0}`;
}

// compare successful reads only, so a failed request never looks like a removal

export function createNotificationTracker(saved = {}, notify = () => {}) {
  const topics = new Map(Object.entries(saved));
  function update(topic, records) {
    records = records.map(record => ({
      ...record,
      version: notificationVersion(record.version)
    }));
    const previous = topics.get(topic);
    const next = Object.fromEntries(records.map(record => [record.id, record]));
    for (const record of records) {
      const old = previous?.[record.id];
      const changed = old && old.version !== record.version;
      const added = previous && !old && record.notifyOnAdded !== false;
      const firstImportant = !previous && record.showInitially;
      if ((changed || added || firstImportant) && record.message) {
        notify({
          ...record,
          message: changed && record.changedMessage ? record.changedMessage : record.message
        });
      }
    }
    topics.set(topic, next);
  }
  return {
    update,
    get: (topic, id) => topics.get(topic)?.[id],
    snapshot: () => Object.fromEntries(topics)
  };
}

export function registrationNotice(row, previous = null) {
  const group = row.event?.kind === 'group' || row.isGroup || previous?.isGroup || false;
  const title = row.event?.title || row.title || previous?.title || (group ? 'your group' : 'your event');
  const labels = {
    confirmed: [`You’re in! Your ${group ? 'group request' : 'RSVP'} for ${title} is confirmed.`, 'success'],
    pending: [`Your request for ${title} is waiting for approval.`, 'info'],
    waitlisted: [`You’re on the waitlist for ${title}.`, 'info'],
    offered: [`A spot opened up for ${title}! Accept it before the offer expires.`, 'success'],
    rejected: [`Your ${group ? 'group request' : 'RSVP'} for ${title} was declined or removed.`, 'sad'],
    declined: [`Your offer for ${title} was declined.`, 'info'],
    cancelled: [`Your registration for ${title} was cancelled.`, 'sad'],
    expired: [`Your offer for ${title} expired.`, 'sad']
  };
  const [message, tone] = labels[row.status] || ['', 'info'];
  return {
    id: String(row.id),
    version: `${row.status}:${row.offerExpiresAt || row.offer_expires_at || ''}:${row.checkedInAt || ''}`,
    message: row.checkedInAt ? `You’re checked in for ${title}. Have fun!` : message,
    tone: row.checkedInAt ? 'success' : tone,
    to: group ? '/community' : '/my-rsvps',
    title,
    isGroup: group,
    showInitially: row.status === 'offered'
  };
}

// include public event facts, never a private meeting link or a hidden venue

export function eventNotice(event) {
  const venue = event.venuePending ? null : event.venue;
  return {
    id: String(event.id),
    notifyOnAdded: false,
    version: JSON.stringify([event.title, event.startTime, event.endTime, event.status, venue?.name, venue?.address, event.venueRevealAt, event.isOnline]),
    message: event.status === 'cancelled' ? `${event.title} was cancelled.` : `Event details updated: ${event.title}.`,
    tone: event.status === 'cancelled' ? 'sad' : 'info',
    to: `/events/${event.id}/rsvp`
  };
}
