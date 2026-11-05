// placeholder data so every page works before the real backend (supabase) is ready.
// the shapes below are a suggestion for timothy's tables: users, events, rsvps,
// members (who is in which organiser's club) and attendancehistory.
//
// dates are worked out from "now", so the demo never goes out of date.
import { isGroup, isOfficialEvent, groupEventData, emptyPlan, slotCells } from './groups.js';

// an exact time n days from today, e.g. daysfromnow(5, 19) → 5 days later at 7:00 pm

function daysFromNow(days, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function createSeedData() {
  const users = [
  // u1 is the "logged in" participant for the demo
  {
    id: 'u1',
    name: 'Alex Tan',
    email: 'alex.tan.2025@demo.smu.edu.sg',
    interests: ['music', 'tech'],
    postalCode: '188065',
    role: 'participant'
  }, {
    id: 'u2',
    name: 'Bea Lim',
    email: 'bea.lim.2025@demo.smu.edu.sg',
    interests: ['sports', 'music'],
    postalCode: '529510',
    role: 'participant'
  }, {
    id: 'u3',
    name: 'Chen Wei',
    email: 'chen.wei.2024@demo.smu.edu.sg',
    interests: ['tech', 'music'],
    postalCode: '310190',
    role: 'participant'
  }, {
    id: 'u4',
    name: 'Dina Rahman',
    email: 'dina.r.2025@demo.smu.edu.sg',
    interests: ['arts', 'music'],
    postalCode: '760123',
    role: 'participant'
  }, {
    id: 'u5',
    name: 'Ethan Ng',
    email: 'ethan.ng.2023@demo.smu.edu.sg',
    interests: ['sports'],
    postalCode: '650221',
    role: 'participant'
  }, {
    id: 'u6',
    name: 'Farah Ali',
    email: 'farah.ali.2025@demo.smu.edu.sg',
    interests: ['career', 'tech'],
    postalCode: '120345',
    role: 'participant'
  },
  // org1 is the "logged in" organiser for the demo
  {
    id: 'org1',
    name: 'Dino Demo Club',
    email: 'demo.club@demo.smu.edu.sg',
    interests: [],
    postalCode: '188065',
    role: 'organiser'
  }, {
    id: 'org2',
    name: 'Campus Sports & Arts Society',
    email: 'csas@demo.smu.edu.sg',
    interests: [],
    postalCode: '188065',
    role: 'organiser'
  }];
  const smuGreen = {
    name: 'SMU Campus Green',
    address: '81 VICTORIA STREET SINGAPORE MANAGEMENT UNIVERSITY SINGAPORE 188065',
    postal: '188065',
    lat: 1.2966,
    lng: 103.8502
  };
  const smuAdmin = {
    name: 'SMU Administration Building',
    address: '81 VICTORIA STREET SINGAPORE 188065',
    postal: '188065',
    lat: 1.2969,
    lng: 103.8505
  };
  const scis = {
    name: 'SMU School of Computing and Information Systems 1',
    address: '80 STAMFORD ROAD SINGAPORE 178902',
    postal: '178902',
    lat: 1.2975,
    lng: 103.8494
  };
  const connexion = {
    name: 'SMU Connexion',
    address: '40 STAMFORD ROAD SINGAPORE 178908',
    postal: '178908',
    lat: 1.2954,
    lng: 103.8497
  };
  const tampinesHub = {
    name: 'Our Tampines Hub',
    address: '1 TAMPINES WALK SINGAPORE 528523',
    postal: '528523',
    lat: 1.3533,
    lng: 103.9404
  };
  const chijmes = {
    name: 'CHIJMES',
    address: '30 VICTORIA STREET SINGAPORE 187996',
    postal: '187996',
    lat: 1.2951,
    lng: 103.8521
  };
  const events = [{
    id: 'e1',
    organiserId: 'org1',
    title: 'Acoustic Night @ Campus Green',
    description: 'Bring a mat and chill to student bands playing acoustic sets.\nFree snacks while they last.',
    tags: ['music'],
    startTime: daysFromNow(5, 19),
    endTime: daysFromNow(5, 22),
    capacity: 3,
    requiresApproval: false,
    isOutdoor: true,
    venue: smuGreen,
    backupVenue: smuAdmin,
    questions: [{
      id: 'q1',
      text: 'Do you play an instrument?',
      type: 'yesno',
      required: false
    }],
    status: 'published',
    createdAt: daysAgo(10)
  }, {
    id: 'e2',
    organiserId: 'org1',
    title: 'Intro to Vue Workshop',
    description: 'Build your first Vue app in 3 hours. Bring a laptop with Node.js installed.',
    tags: ['tech', 'career'],
    startTime: daysFromNow(8, 14),
    endTime: daysFromNow(8, 17),
    capacity: 20,
    requiresApproval: true,
    isOutdoor: false,
    venue: scis,
    backupVenue: null,
    questions: [{
      id: 'q1',
      text: 'Which year are you in?',
      type: 'text',
      required: true
    }, {
      id: 'q2',
      text: 'Have you used JavaScript before?',
      type: 'yesno',
      required: false
    }],
    status: 'published',
    createdAt: daysAgo(6)
  }, {
    id: 'e3',
    organiserId: 'org2',
    title: 'Evening Futsal Match',
    description: 'Friendly 5-a-side games. All levels welcome.',
    tags: ['sports'],
    startTime: daysFromNow(5, 20),
    endTime: daysFromNow(5, 22),
    capacity: 12,
    requiresApproval: false,
    isOutdoor: false,
    venue: tampinesHub,
    backupVenue: null,
    questions: [],
    status: 'published',
    createdAt: daysAgo(4)
  }, {
    id: 'e4',
    organiserId: 'org2',
    title: 'Career Fair Prep Talk',
    description: 'Seniors share how they prepared their resumes and pitches for the career fair.',
    tags: ['career'],
    startTime: daysFromNow(12, 18, 30),
    endTime: daysFromNow(12, 20),
    capacity: 40,
    requiresApproval: false,
    isOutdoor: false,
    venue: connexion,
    backupVenue: null,
    questions: [],
    status: 'published',
    createdAt: daysAgo(8)
  }, {
    id: 'e5',
    organiserId: 'org2',
    title: 'Pottery Basics',
    description: 'Hands-on wheel throwing. Only 2 wheels, so spots are tight!',
    tags: ['arts'],
    startTime: daysFromNow(3, 10),
    endTime: daysFromNow(3, 12),
    capacity: 2,
    requiresApproval: false,
    isOutdoor: false,
    venue: chijmes,
    backupVenue: null,
    questions: [],
    status: 'published',
    createdAt: daysAgo(9)
  }];

  // status: pending | confirmed | waitlisted | offered | rejected | cancelled | declined | expired
  const rsvps = [
  // e1 is full (capacity 3): 2 confirmed + 1 spot offered to alex. 3 people waiting.
  {
    id: 'r1',
    eventId: 'e1',
    userId: 'u2',
    status: 'confirmed',
    answers: {
      q1: 'yes'
    },
    createdAt: daysAgo(9),
    offerExpiresAt: null
  }, {
    id: 'r2',
    eventId: 'e1',
    userId: 'u4',
    status: 'confirmed',
    answers: {
      q1: 'no'
    },
    createdAt: daysAgo(9),
    offerExpiresAt: null
  }, {
    id: 'r3',
    eventId: 'e1',
    userId: 'u1',
    status: 'offered',
    answers: {
      q1: 'no'
    },
    createdAt: daysAgo(8),
    offerExpiresAt: hoursFromNow(5)
  },
  // waitlist in the order they joined: ethan, chen, farah.
  // scoring ranks them farah (member), chen (likes music), ethan — not first-come-first-served.
  {
    id: 'r4',
    eventId: 'e1',
    userId: 'u5',
    status: 'waitlisted',
    answers: {
      q1: 'no'
    },
    createdAt: daysAgo(7),
    offerExpiresAt: null
  }, {
    id: 'r5',
    eventId: 'e1',
    userId: 'u3',
    status: 'waitlisted',
    answers: {
      q1: 'yes'
    },
    createdAt: daysAgo(6),
    offerExpiresAt: null
  }, {
    id: 'r6',
    eventId: 'e1',
    userId: 'u6',
    status: 'waitlisted',
    answers: {
      q1: 'no'
    },
    createdAt: daysAgo(5),
    offerExpiresAt: null
  },
  // e2 needs organiser approval
  {
    id: 'r7',
    eventId: 'e2',
    userId: 'u2',
    status: 'confirmed',
    answers: {
      q1: 'Year 2',
      q2: 'yes'
    },
    createdAt: daysAgo(5),
    offerExpiresAt: null
  }, {
    id: 'r8',
    eventId: 'e2',
    userId: 'u3',
    status: 'pending',
    answers: {
      q1: 'Year 3',
      q2: 'yes'
    },
    createdAt: daysAgo(3),
    offerExpiresAt: null
  }, {
    id: 'r9',
    eventId: 'e2',
    userId: 'u6',
    status: 'pending',
    answers: {
      q1: 'Year 1',
      q2: 'no'
    },
    createdAt: daysAgo(2),
    offerExpiresAt: null
  }, {
    id: 'r10',
    eventId: 'e2',
    userId: 'u5',
    status: 'pending',
    answers: {
      q1: 'Year 4',
      q2: ''
    },
    createdAt: daysAgo(1),
    offerExpiresAt: null
  },
  // alex's other rsvp
  {
    id: 'r11',
    eventId: 'e4',
    userId: 'u1',
    status: 'confirmed',
    answers: {},
    createdAt: daysAgo(4),
    offerExpiresAt: null
  },
  // e5 is full, so alex rsvping to it shows the "join the waitlist" path
  {
    id: 'r12',
    eventId: 'e5',
    userId: 'u2',
    status: 'confirmed',
    answers: {},
    createdAt: daysAgo(8),
    offerExpiresAt: null
  }, {
    id: 'r13',
    eventId: 'e5',
    userId: 'u4',
    status: 'confirmed',
    answers: {},
    createdAt: daysAgo(8),
    offerExpiresAt: null
  }];

  // organisers mark people as members of their club/group (feeds the waitlist score)
  const members = [{
    organiserId: 'org1',
    userId: 'u4'
  }, {
    organiserId: 'org1',
    userId: 'u6'
  }];

  // past events each person signed up for (feeds the show-up rate in the waitlist score)
  const attendanceHistory = [{
    userId: 'u1',
    eventDate: daysAgo(15),
    attended: true,
    lateCancel: false
  }, {
    userId: 'u1',
    eventDate: daysAgo(70),
    attended: true,
    lateCancel: false
  },
  // ethan: always turns up
  {
    userId: 'u5',
    eventDate: daysAgo(5),
    attended: true,
    lateCancel: false
  }, {
    userId: 'u5',
    eventDate: daysAgo(12),
    attended: true,
    lateCancel: false
  }, {
    userId: 'u5',
    eventDate: daysAgo(30),
    attended: true,
    lateCancel: false
  }, {
    userId: 'u5',
    eventDate: daysAgo(45),
    attended: true,
    lateCancel: false
  },
  // chen: one no-show and one late cancel recently
  {
    userId: 'u3',
    eventDate: daysAgo(10),
    attended: true,
    lateCancel: false
  }, {
    userId: 'u3',
    eventDate: daysAgo(20),
    attended: false,
    lateCancel: true
  }, {
    userId: 'u3',
    eventDate: daysAgo(40),
    attended: false,
    lateCancel: false
  },
  // farah: reliable, but a while ago
  {
    userId: 'u6',
    eventDate: daysAgo(60),
    attended: true,
    lateCancel: false
  }, {
    userId: 'u6',
    eventDate: daysAgo(100),
    attended: true,
    lateCancel: false
  }, {
    userId: 'u6',
    eventDate: daysAgo(200),
    attended: true,
    lateCancel: false
  }, {
    userId: 'u2',
    eventDate: daysAgo(25),
    attended: true,
    lateCancel: false
  }, {
    userId: 'u4',
    eventDate: daysAgo(35),
    attended: false,
    lateCancel: false
  }];

  // the near-start weather event is a test fixture only; the demo keeps gregory's seed list.
  const testSeed = import.meta.env?.VITE_FEATURE4_TEST_SEED === 'true' || typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
  if (testSeed) events.unshift({
    id: 'e-weather-demo',
    organiserId: 'org1',
    title: 'Campus Green Social',
    description: 'Near-start outdoor event for isolated weather checks.',
    tags: ['music', 'tech'],
    startTime: hoursFromNow(0.5),
    endTime: hoursFromNow(2),
    capacity: 30,
    requiresApproval: false,
    isOutdoor: true,
    venue: {
      ...smuGreen
    },
    backupVenue: {
      ...smuAdmin
    },
    questions: [],
    status: 'published',
    createdAt: daysAgo(1)
  });
  const db = {
    users,
    events,
    rsvps,
    members,
    attendanceHistory
  };
  addSampleGroups(db);
  return db;
}

// sample go together groups from other students (community), tied to upcoming official
// events. also brings demo data saved by older versions up to date (open jios became groups).

export const GROUP_SEED_VERSION = 6;

export function addSampleGroups(db) {
  db.groupComments = db.groupComments || [];
  // older demo data: jio comments become group comments; groups get an invite link and a plan
  if (db.jioComments) {
    for (const c of db.jioComments) db.groupComments.push({
      id: c.id,
      groupId: c.jioId,
      userId: c.userId,
      text: c.text,
      createdAt: c.createdAt
    });
    delete db.jioComments;
  }
  delete db.jioSeedVersion;
  // the sample jios (jio1–3) keep their people and messages as grp1–3
  for (const n of [1, 2, 3]) {
    const old = db.events.find(e => e.id === `jio${n}`);
    if (!old) continue;
    old.id = `grp${n}`;
    for (const r of db.rsvps) if (r.eventId === `jio${n}`) r.eventId = `grp${n}`;
    for (const c of db.groupComments) if (c.groupId === `jio${n}`) {
      c.groupId = `grp${n}`;
      if (c.id === `c-jio${n}`) c.id = `c-grp${n}`;
    }
  }
  // version 5: groups were stored as kind 'hangout' with a hangout field; they are now kind 'group'
  for (const e of db.events) {
    if (e.kind !== 'hangout' || !e.hangout?.eventId) continue;
    const {
      visibility,
      inviteToken,
      eventId
    } = e.hangout;
    e.kind = 'group';
    e.group = {
      visibility,
      inviteToken,
      eventId
    };
    delete e.hangout;
  }
  for (const e of db.events) {
    if (!isGroup(e)) continue;
    e.group.inviteToken = e.group.inviteToken || `inv-${e.id}`;
    e.group.visibility = e.group.visibility === 'private' ? 'private' : 'public';
    e.plan = e.plan || emptyPlan();
    e.plan.availability = e.plan.availability || {};
  }
  const now = Date.now();
  const upcoming = id => db.events.find(e => e.id === id && isOfficialEvent(e) && e.status === 'published' && new Date(e.startTime) > now);
  const samples = [{
    id: 'grp1',
    eventId: 'e1',
    host: 'u2',
    capacity: 4,
    note: 'First time going, would love a group to sit with. Meeting at the SMU Green entrance 15 min before.',
    members: ['u3']
  }, {
    id: 'grp2',
    eventId: 'e2',
    host: 'u5',
    capacity: 3,
    note: 'Anyone keen to pair up? I can share my laptop setup notes.',
    members: []
  }, {
    id: 'grp3',
    eventId: 'e3',
    host: 'u4',
    capacity: 5,
    note: 'Need a few more for a proper team. All levels welcome!',
    members: ['u6', 'u3']
  }];
  for (const sample of samples) {
    const target = upcoming(sample.eventId);
    if (!target || db.events.some(e => e.id === sample.id)) continue;
    db.events.push({
      ...groupEventData(target, {
        ...sample,
        token: `inv-${sample.id}`
      }),
      id: sample.id,
      organiserId: sample.host,
      status: 'published',
      createdAt: new Date(now - 3 * 3600e3).toISOString()
    });
    for (const userId of sample.members) db.rsvps.push({
      id: `r-${sample.id}-${userId}`,
      eventId: sample.id,
      userId,
      status: 'confirmed',
      answers: {},
      createdAt: new Date(now - 3600e3).toISOString(),
      offerExpiresAt: null
    });
  }
  if (db.events.some(e => e.id === 'grp1') && !db.groupComments.some(c => c.id === 'c-grp1')) {
    db.groupComments.push({
      id: 'c-grp1',
      groupId: 'grp1',
      userId: 'u3',
      text: 'Count me in! I’ll bring a mat.',
      createdAt: new Date(now - 2 * 3600e3).toISOString()
    });
  }
  // one idea already on grp1's plan, so the planner isn't empty in the demo
  const first = db.events.find(e => e.id === 'grp1');
  if (first && !first.plan.before.suggestions.length) {
    first.plan.before.suggestions.push({
      id: 's-grp1',
      kind: 'custom',
      refId: null,
      name: 'Lau Pa Sat',
      detail: null,
      priceText: null,
      address: '18 Raffles Quay',
      lat: 1.2806,
      lng: 103.8504,
      sourceUrl: null,
      suggestedBy: 'u3',
      votes: ['u3', 'u2'],
      createdAt: new Date(now - 2 * 3600e3).toISOString()
    });
  }
  // …and two members have marked when they're free (version 4; version 3 used minutes)
  if (first) {
    const before = slotCells(first, 'before');
    const old = Object.values(first.plan.availability || {}).some(a => Object.values(a).some(v => !Array.isArray(v)));
    if (old || !Object.keys(first.plan.availability || {}).length) first.plan.availability = {
      u2: {
        before: before.slice(4),
        after: []
      },
      u3: {
        before: before.slice(7)
      }
    };
  }
  addFriendsAndInvites(db, upcoming, now);
  db.groupSeedVersion = GROUP_SEED_VERSION;
}

// version 6: usernames and friends (alex is friends with bea and chen; dina has asked),
// friends-only groups, an invite for alex, a group alex hosts with a request waiting, and
// one "group deleted" notice, so every go together state can be tried in the demo.

const USERNAMES = {
  u1: 'alex_tan',
  u2: 'bea_lim',
  u3: 'chen_wei',
  u4: 'dina_r',
  u5: 'ethan_ng',
  u6: 'farah_ali'
};

function addFriendsAndInvites(db, upcoming, now) {
  for (const user of db.users || []) if (USERNAMES[user.id] && !user.username) user.username = USERNAMES[user.id];
  db.friendships = db.friendships || [{
    a: 'u1',
    b: 'u2',
    requester: 'u2',
    status: 'accepted',
    createdAt: new Date(now - 9 * 864e5).toISOString()
  }, {
    a: 'u1',
    b: 'u3',
    requester: 'u1',
    status: 'accepted',
    createdAt: new Date(now - 6 * 864e5).toISOString()
  }, {
    a: 'u1',
    b: 'u4',
    requester: 'u4',
    status: 'pending',
    createdAt: new Date(now - 864e5).toISOString()
  }];
  db.groupInvites = db.groupInvites || [];
  db.groupNotices = db.groupNotices || [];
  const add = sample => {
    const target = upcoming(sample.eventId);
    if (!target || db.events.some(e => e.id === sample.id)) return null;
    const group = {
      ...groupEventData(target, {
        ...sample,
        token: `inv-${sample.id}`
      }),
      id: sample.id,
      organiserId: sample.host,
      status: 'published',
      createdAt: new Date(now - 2 * 3600e3).toISOString()
    };
    db.events.push(group);
    for (const userId of sample.members || []) db.rsvps.push({
      id: `r-${sample.id}-${userId}`,
      eventId: sample.id,
      userId,
      status: 'confirmed',
      answers: {},
      createdAt: new Date(now - 3600e3).toISOString(),
      offerExpiresAt: null
    });
    return group;
  };
  // friends only: bea's private group shows for alex because they're friends
  add({
    id: 'grp4',
    eventId: 'e1',
    host: 'u2',
    capacity: 4,
    joinMode: 'approval',
    visibility: 'private',
    note: 'Just my friends for this one, we’re grabbing dinner after.',
    members: []
  });
  // chen invited alex to a private group
  if (add({
    id: 'grp5',
    eventId: 'e5',
    host: 'u3',
    capacity: 4,
    joinMode: 'open',
    visibility: 'private',
    note: 'Pottery date! Bring an apron.',
    members: []
  })) {
    db.groupInvites.push({
      id: 'inv-grp5-u1',
      groupId: 'grp5',
      userId: 'u1',
      invitedBy: 'u3',
      status: 'pending',
      createdAt: new Date(now - 3600e3).toISOString()
    });
  }
  // a group alex hosts: chen is in, farah is asking with a message
  if (add({
    id: 'grp6',
    eventId: 'e4',
    host: 'org1',
    capacity: 4,
    joinMode: 'approval',
    visibility: 'public',
    note: 'Going to the career talk, happy to swap resume tips after.',
    members: ['u3']
  })) {
    db.rsvps.push({
      id: 'r-grp6-u6',
      eventId: 'grp6',
      userId: 'u6',
      status: 'pending',
      answers: {},
      message: 'Hi! I’m also in SCIS year 2, would love to tag along.',
      createdAt: new Date(now - 1800e3).toISOString(),
      offerExpiresAt: null
    });
  }
  if (!db.groupNotices.some(n => n.id === 'notice-sample')) {
    db.groupNotices.push({
      id: 'notice-sample',
      userId: 'u1',
      hostName: 'Ethan Ng',
      eventTitle: 'Board Games Night',
      deletedAt: new Date(now - 5 * 3600e3).toISOString(),
      seen: false
    });
  }
}
