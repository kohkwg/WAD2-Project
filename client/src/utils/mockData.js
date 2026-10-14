// PLACEHOLDER DATA so every page works before the real backend (Supabase) is ready.
// The shapes below are a suggestion for Timothy's tables: users, events, rsvps,
// members (who is in which organiser's club) and attendanceHistory.
//
// Dates are worked out from "now", so the demo never goes out of date.

// An exact time N days from today, e.g. daysFromNow(5, 19) → 5 days later at 7:00 pm
function daysFromNow(days, hour, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
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
      role: 'participant',
    },
    {
      id: 'u2',
      name: 'Bea Lim',
      email: 'bea.lim.2025@demo.smu.edu.sg',
      interests: ['sports', 'music'],
      postalCode: '529510',
      role: 'participant',
    },
    {
      id: 'u3',
      name: 'Chen Wei',
      email: 'chen.wei.2024@demo.smu.edu.sg',
      interests: ['tech', 'music'],
      postalCode: '310190',
      role: 'participant',
    },
    {
      id: 'u4',
      name: 'Dina Rahman',
      email: 'dina.r.2025@demo.smu.edu.sg',
      interests: ['arts', 'music'],
      postalCode: '760123',
      role: 'participant',
    },
    {
      id: 'u5',
      name: 'Ethan Ng',
      email: 'ethan.ng.2023@demo.smu.edu.sg',
      interests: ['sports'],
      postalCode: '650221',
      role: 'participant',
    },
    {
      id: 'u6',
      name: 'Farah Ali',
      email: 'farah.ali.2025@demo.smu.edu.sg',
      interests: ['career', 'tech'],
      postalCode: '120345',
      role: 'participant',
    },
    // org1 is the "logged in" organiser for the demo
    {
      id: 'org1',
      name: 'Bookedz Demo Club',
      email: 'demo.club@demo.smu.edu.sg',
      interests: [],
      postalCode: '188065',
      role: 'organiser',
    },
    {
      id: 'org2',
      name: 'Campus Sports & Arts Society',
      email: 'csas@demo.smu.edu.sg',
      interests: [],
      postalCode: '188065',
      role: 'organiser',
    },
  ]

  const smuGreen = {
    name: 'SMU Campus Green',
    address: '81 VICTORIA STREET SINGAPORE MANAGEMENT UNIVERSITY SINGAPORE 188065',
    postal: '188065',
    lat: 1.2966,
    lng: 103.8502,
  }
  const smuAdmin = {
    name: 'SMU Administration Building',
    address: '81 VICTORIA STREET SINGAPORE 188065',
    postal: '188065',
    lat: 1.2969,
    lng: 103.8505,
  }
  const scis = {
    name: 'SMU School of Computing and Information Systems 1',
    address: '80 STAMFORD ROAD SINGAPORE 178902',
    postal: '178902',
    lat: 1.2975,
    lng: 103.8494,
  }
  const connexion = {
    name: 'SMU Connexion',
    address: '40 STAMFORD ROAD SINGAPORE 178908',
    postal: '178908',
    lat: 1.2954,
    lng: 103.8497,
  }
  const tampinesHub = {
    name: 'Our Tampines Hub',
    address: '1 TAMPINES WALK SINGAPORE 528523',
    postal: '528523',
    lat: 1.3533,
    lng: 103.9404,
  }
  const chijmes = {
    name: 'CHIJMES',
    address: '30 VICTORIA STREET SINGAPORE 187996',
    postal: '187996',
    lat: 1.2951,
    lng: 103.8521,
  }

  const events = [
    {
      id: 'e1',
      organiserId: 'org1',
      title: 'Acoustic Night @ Campus Green',
      description:
        'Bring a mat and chill to student bands playing acoustic sets.\nFree snacks while they last.',
      tags: ['music'],
      startTime: daysFromNow(5, 19),
      endTime: daysFromNow(5, 22),
      capacity: 3,
      requiresApproval: false,
      isOutdoor: true,
      venue: smuGreen,
      backupVenue: smuAdmin,
      questions: [{ id: 'q1', text: 'Do you play an instrument?', type: 'yesno', required: false }],
      status: 'published',
      createdAt: daysAgo(10),
    },
    {
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
      questions: [
        { id: 'q1', text: 'Which year are you in?', type: 'text', required: true },
        { id: 'q2', text: 'Have you used JavaScript before?', type: 'yesno', required: false },
      ],
      status: 'published',
      createdAt: daysAgo(6),
    },
    {
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
      createdAt: daysAgo(4),
    },
    {
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
      createdAt: daysAgo(8),
    },
    {
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
      createdAt: daysAgo(9),
    },
  ]

  // status: pending | confirmed | waitlisted | offered | rejected | cancelled | declined | expired
  const rsvps = [
    // e1 is FULL (capacity 3): 2 confirmed + 1 spot offered to Alex. 3 people waiting.
    {
      id: 'r1',
      eventId: 'e1',
      userId: 'u2',
      status: 'confirmed',
      answers: { q1: 'yes' },
      createdAt: daysAgo(9),
      offerExpiresAt: null,
    },
    {
      id: 'r2',
      eventId: 'e1',
      userId: 'u4',
      status: 'confirmed',
      answers: { q1: 'no' },
      createdAt: daysAgo(9),
      offerExpiresAt: null,
    },
    {
      id: 'r3',
      eventId: 'e1',
      userId: 'u1',
      status: 'offered',
      answers: { q1: 'no' },
      createdAt: daysAgo(8),
      offerExpiresAt: hoursFromNow(5),
    },
    // Waitlist in the order they joined: Ethan, Chen, Farah.
    // Scoring ranks them Farah (member), Chen (likes music), Ethan — not first-come-first-served.
    {
      id: 'r4',
      eventId: 'e1',
      userId: 'u5',
      status: 'waitlisted',
      answers: { q1: 'no' },
      createdAt: daysAgo(7),
      offerExpiresAt: null,
    },
    {
      id: 'r5',
      eventId: 'e1',
      userId: 'u3',
      status: 'waitlisted',
      answers: { q1: 'yes' },
      createdAt: daysAgo(6),
      offerExpiresAt: null,
    },
    {
      id: 'r6',
      eventId: 'e1',
      userId: 'u6',
      status: 'waitlisted',
      answers: { q1: 'no' },
      createdAt: daysAgo(5),
      offerExpiresAt: null,
    },

    // e2 needs organiser approval
    {
      id: 'r7',
      eventId: 'e2',
      userId: 'u2',
      status: 'confirmed',
      answers: { q1: 'Year 2', q2: 'yes' },
      createdAt: daysAgo(5),
      offerExpiresAt: null,
    },
    {
      id: 'r8',
      eventId: 'e2',
      userId: 'u3',
      status: 'pending',
      answers: { q1: 'Year 3', q2: 'yes' },
      createdAt: daysAgo(3),
      offerExpiresAt: null,
    },
    {
      id: 'r9',
      eventId: 'e2',
      userId: 'u6',
      status: 'pending',
      answers: { q1: 'Year 1', q2: 'no' },
      createdAt: daysAgo(2),
      offerExpiresAt: null,
    },
    {
      id: 'r10',
      eventId: 'e2',
      userId: 'u5',
      status: 'pending',
      answers: { q1: 'Year 4', q2: '' },
      createdAt: daysAgo(1),
      offerExpiresAt: null,
    },

    // Alex's other RSVP
    {
      id: 'r11',
      eventId: 'e4',
      userId: 'u1',
      status: 'confirmed',
      answers: {},
      createdAt: daysAgo(4),
      offerExpiresAt: null,
    },

    // e5 is full, so Alex RSVPing to it shows the "join the waitlist" path
    {
      id: 'r12',
      eventId: 'e5',
      userId: 'u2',
      status: 'confirmed',
      answers: {},
      createdAt: daysAgo(8),
      offerExpiresAt: null,
    },
    {
      id: 'r13',
      eventId: 'e5',
      userId: 'u4',
      status: 'confirmed',
      answers: {},
      createdAt: daysAgo(8),
      offerExpiresAt: null,
    },
  ]

  // Organisers mark people as members of their club/group (feeds the waitlist score)
  const members = [
    { organiserId: 'org1', userId: 'u4' },
    { organiserId: 'org1', userId: 'u6' },
  ]

  // Past events each person signed up for (feeds the show-up rate in the waitlist score)
  const attendanceHistory = [
    { userId: 'u1', eventDate: daysAgo(15), attended: true, lateCancel: false },
    { userId: 'u1', eventDate: daysAgo(70), attended: true, lateCancel: false },
    // Ethan: always turns up
    { userId: 'u5', eventDate: daysAgo(5), attended: true, lateCancel: false },
    { userId: 'u5', eventDate: daysAgo(12), attended: true, lateCancel: false },
    { userId: 'u5', eventDate: daysAgo(30), attended: true, lateCancel: false },
    { userId: 'u5', eventDate: daysAgo(45), attended: true, lateCancel: false },
    // Chen: one no-show and one late cancel recently
    { userId: 'u3', eventDate: daysAgo(10), attended: true, lateCancel: false },
    { userId: 'u3', eventDate: daysAgo(20), attended: false, lateCancel: true },
    { userId: 'u3', eventDate: daysAgo(40), attended: false, lateCancel: false },
    // Farah: reliable, but a while ago
    { userId: 'u6', eventDate: daysAgo(60), attended: true, lateCancel: false },
    { userId: 'u6', eventDate: daysAgo(100), attended: true, lateCancel: false },
    { userId: 'u6', eventDate: daysAgo(200), attended: true, lateCancel: false },
    { userId: 'u2', eventDate: daysAgo(25), attended: true, lateCancel: false },
    { userId: 'u4', eventDate: daysAgo(35), attended: false, lateCancel: false },
  ]

  return { users, events, rsvps, members, attendanceHistory }
}
