// hangout template rules (adapted from the openjio specification). pure functions so
// the wizard, the demo backend and tests share one definition.
// all dates are singapore local time (utc+8, no daylight saving).


export const HANGOUT_MODES = ['group', 'public', 'solo'];

export const JOIN_MODES = ['open', 'auto', 'approval'];

export const MAX_GROUP_DAYS = 7;

export const CAPACITY_RANGE = {
  min: 2,
  max: 8
};

export const MAX_INTERESTS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export const sgDateTime = (date, time) => new Date(`${date}T${time}:00+08:00`);

export function sgToday(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function inclusiveDays(startDate, endDate) {
  return Math.round((sgDateTime(endDate, '00:00') - sgDateTime(startDate, '00:00')) / DAY_MS) + 1;
}

export function blankHangout() {
  return {
    mode: 'group',
    title: '',
    description: '',
    interests: [],
    startDate: '',
    endDate: '',
    date: '',
    startTime: '',
    endTime: '',
    startArea: null,
    capacity: 6,
    joinMode: 'open'
  };
}

// errors for one wizard step (1 basics, 2 when, 3 where, 4 review); [] means valid.

export function hangoutStepErrors(form, step, now = new Date()) {
  const errors = [];
  const today = sgToday(now);
  if (step === 1) {
    if (!HANGOUT_MODES.includes(form.mode)) errors.push({
      field: 'mode',
      message: 'Choose who this hangout is for.'
    });
    const title = form.title.trim();
    if (!title) errors.push({
      field: 'title',
      message: 'Give your hangout a title.'
    });else if (title.length > 60) errors.push({
      field: 'title',
      message: 'Keep the title to 60 characters or fewer.'
    });
    if (form.description.trim().length > 200) errors.push({
      field: 'description',
      message: 'Keep the description to 200 characters or fewer.'
    });
    if (!form.interests.length) errors.push({
      field: 'interests',
      message: 'Pick at least one interest.'
    });else if (form.interests.length > MAX_INTERESTS) errors.push({
      field: 'interests',
      message: `Pick up to ${MAX_INTERESTS} interests.`
    });
  }
  if (step === 2) {
    if (form.mode === 'group') {
      if (!form.startDate) errors.push({
        field: 'startDate',
        message: 'Choose the first possible day.'
      });else if (form.startDate < today) errors.push({
        field: 'startDate',
        message: 'The first day can’t be in the past.'
      });
      if (!form.endDate) errors.push({
        field: 'endDate',
        message: 'Choose the last possible day.'
      });else if (form.startDate && form.endDate < form.startDate) errors.push({
        field: 'endDate',
        message: 'The last day must be on or after the first day.'
      });else if (form.startDate && inclusiveDays(form.startDate, form.endDate) > MAX_GROUP_DAYS) errors.push({
        field: 'endDate',
        message: `Keep the range to ${MAX_GROUP_DAYS} days or fewer.`
      });
    } else {
      if (!form.date) errors.push({
        field: 'date',
        message: 'Choose a date.'
      });
      if (!form.startTime) errors.push({
        field: 'startTime',
        message: 'Choose a start time.'
      });
      if (!form.endTime) errors.push({
        field: 'endTime',
        message: 'Choose an end time.'
      });
      if (form.date && form.startTime && form.endTime) {
        const start = sgDateTime(form.date, form.startTime);
        const minutes = (sgDateTime(form.date, form.endTime) - start) / 60000;
        if (start <= now) errors.push({
          field: 'startTime',
          message: 'The start time must be in the future.'
        });
        if (minutes <= 0) errors.push({
          field: 'endTime',
          message: 'The end time must be after the start time (same day).'
        });else if (minutes < 60 || minutes > 720) errors.push({
          field: 'endTime',
          message: 'Plan between 1 and 12 hours.'
        });
      }
    }
    if (form.mode !== 'solo') {
      const capacity = Number(form.capacity);
      if (!Number.isInteger(capacity) || capacity < CAPACITY_RANGE.min || capacity > CAPACITY_RANGE.max) {
        errors.push({
          field: 'capacity',
          message: `Choose between ${CAPACITY_RANGE.min} and ${CAPACITY_RANGE.max} people, including you.`
        });
      }
    }
  }
  if (step === 3) {
    const area = form.startArea;
    if (!area || !Number.isFinite(area.lat) || !Number.isFinite(area.lng)) errors.push({
      field: 'startArea',
      message: 'Choose a start area from the OneMap suggestions.'
    });
  }
  if (step === 4 && form.mode !== 'solo' && !JOIN_MODES.includes(form.joinMode)) {
    errors.push({
      field: 'joinMode',
      message: 'Choose how people join.'
    });
  }
  return errors;
}

export function inviteToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

// the event record a hangout is stored as. group hangouts span their candidate days
// until a time is locked; solo and public hangouts have a fixed slot from the start.

export function hangoutEventData(form) {
  const group = form.mode === 'group';
  const startTime = group ? sgDateTime(form.startDate, '00:00') : sgDateTime(form.date, form.startTime);
  const endTime = group ? sgDateTime(form.endDate, '23:59') : sgDateTime(form.date, form.endTime);
  const joinMode = form.mode === 'solo' ? 'open' : form.joinMode;
  return {
    kind: 'hangout',
    title: form.title.trim(),
    description: form.description.trim(),
    tags: [...form.interests],
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    venue: {
      ...form.startArea
    },
    capacity: form.mode === 'solo' ? 1 : Number(form.capacity),
    isOutdoor: false,
    backupVenue: null,
    joinMode,
    requiresApproval: joinMode === 'approval',
    questions: [],
    hangout: {
      mode: form.mode,
      visibility: form.mode === 'public' ? 'public' : 'private',
      stage: group ? 'collecting' : 'voting',
      dateRange: group ? {
        start: form.startDate,
        end: form.endDate
      } : null,
      lockedSlot: group ? null : {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      },
      inviteToken: group ? inviteToken() : null
    }
  };
}

// the wizard's fields for an existing hangout (editing). fixed slots read back in
// singapore time; group hangouts keep their candidate day range.

export function hangoutFormFromEvent(event) {
  const hangout = event.hangout || {};
  const mode = hangout.mode || 'group';
  const fixed = mode !== 'group';
  const sg = iso => new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString();
  return {
    mode,
    title: event.title || '',
    description: event.description || '',
    interests: [...(event.tags || [])],
    startDate: hangout.dateRange?.start || '',
    endDate: hangout.dateRange?.end || '',
    date: fixed ? sg(event.startTime).slice(0, 10) : '',
    startTime: fixed ? sg(event.startTime).slice(11, 16) : '',
    endTime: fixed ? sg(event.endTime).slice(11, 16) : '',
    startArea: event.venue ? {
      ...event.venue
    } : null,
    capacity: event.capacity ?? CAPACITY_RANGE.min,
    joinMode: event.joinMode || (event.requiresApproval ? 'approval' : 'auto')
  };
}

// what saving an edited hangout sends to updateevent. only its words, interests, group size
// and start area change. type, time, join mode and approval stay as they are: the hangout
// page owns the time, and the others have no update path yet.

export function hangoutChanges(event, form) {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    tags: [...form.interests],
    startTime: event.startTime,
    endTime: event.endTime,
    capacity: form.mode === 'solo' ? event.capacity : Number(form.capacity),
    venue: {
      ...form.startArea
    },
    isOutdoor: false,
    backupVenue: null,
    requiresApproval: Boolean(event.requiresApproval),
    questions: [],
    coverImageUrl: event.coverImageUrl || ''
  };
}

// what a join request becomes. open joins never queue: a full open event refuses.

export function joinOutcome(event, held) {
  const mode = event.joinMode || (event.requiresApproval ? 'approval' : 'auto');
  if (mode === 'approval') return 'pending';
  const full = event.capacity != null && held >= event.capacity;
  if (mode === 'open') return full ? 'full' : 'confirmed';
  return full ? 'waitlisted' : 'confirmed';
}

export const JOIN_MODE_LABELS = {
  open: {
    title: 'Open',
    detail: 'People join instantly while places last. No questions or waitlist; it closes when full.'
  },
  auto: {
    title: 'RSVP, auto-confirm',
    detail: 'RSVPs are confirmed while places last, then join the waitlist.'
  },
  approval: {
    title: 'RSVP, I approve',
    detail: 'You approve each RSVP yourself.'
  }
};

// hangouts that should never appear in public browsing.

export const isPrivateHangout = event => event?.kind === 'hangout' && event.hangout?.visibility !== 'public';
