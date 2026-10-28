// PLACEHOLDER DATA for OpenJio planning (hangouts, deals, outside events, places).
// Shapes match supabase/migrations/20261028000000_openjio_planning.sql, in camelCase.
// Users come from mockData.js (u1 = Alex, the demo "logged in" user).
//
// Deals and outside events here are SAMPLE records, not real promotions. The scraping
// work (F8) will replace them with data extracted from Telegram channels.
//
// Dates are worked out from "now", so the demo never goes out of date.

function dayFromToday(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function atTime(days, hour, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export function createPlanningSeed() {
  const deals = [
    {
      id: 'd1',
      merchant: 'Sample Kopitiam',
      title: '1-for-1 kaya toast set',
      description: 'Buy one kaya toast set, get one free.',
      conditions: ['Dine-in only', 'Min 2 pax'],
      category: 'food',
      dateFrom: dayFromToday(-3),
      dateTo: dayFromToday(30),
      daysOfWeek: [1, 2, 3, 4, 5],
      timeWindows: [{ start: '14:00', end: '17:00' }],
      priceText: 'From $4.20',
      sourceName: 'Sample data',
      sourceUrl: null,
      outlets: [
        { id: 'o1', name: 'Bugis outlet', address: '200 Victoria Street', latitude: 1.2996, longitude: 103.8554 },
        { id: 'o2', name: 'Tampines outlet', address: '1 Tampines Walk', latitude: 1.3533, longitude: 103.9405 },
      ],
    },
    {
      id: 'd2',
      merchant: 'Sample Ramen Bar',
      title: '20% off weekend lunch',
      description: '20% off all ramen bowls at lunch on weekends.',
      conditions: ['Not valid with other promotions'],
      category: 'food',
      dateFrom: dayFromToday(0),
      dateTo: dayFromToday(21),
      daysOfWeek: [0, 6],
      timeWindows: [{ start: '11:30', end: '15:00' }],
      priceText: 'Bowls from $12',
      sourceName: 'Sample data',
      sourceUrl: null,
      outlets: [
        { id: 'o3', name: 'Orchard outlet', address: '2 Orchard Turn', latitude: 1.3040, longitude: 103.8318 },
      ],
    },
    {
      id: 'd3',
      merchant: 'Sample Bubble Tea',
      title: '$1 upsize every evening',
      description: 'Upsize any drink for $1.',
      conditions: [],
      category: 'food',
      dateFrom: null,
      dateTo: dayFromToday(14),
      daysOfWeek: [],
      timeWindows: [{ start: '18:00', end: '22:00' }],
      priceText: '$1 upsize',
      sourceName: 'Sample data',
      sourceUrl: null,
      outlets: [
        { id: 'o4', name: 'Dhoby Ghaut outlet', address: '68 Orchard Road', latitude: 1.3006, longitude: 103.8455 },
      ],
    },
  ]

  const externalEvents = [
    {
      id: 'x1',
      title: 'Sample nature sketching session',
      description: 'Free group sketching session in the gardens.',
      startsAt: atTime(4, 8, 30),
      endsAt: atTime(4, 11, 30),
      venueName: 'Singapore Botanic Gardens, Tanglin Gate',
      latitude: 1.3058, longitude: 103.8159,
      priceText: 'Free',
      category: 'arts',
      sourceName: 'Sample data',
      sourceUrl: null,
    },
    {
      id: 'x2',
      title: 'Sample indie gig night',
      description: 'Local bands, standing tickets.',
      startsAt: atTime(5, 19, 30),
      endsAt: atTime(5, 22, 30),
      venueName: 'The Projector, Golden Mile Tower',
      latitude: 1.3029, longitude: 103.8640,
      priceText: 'From $18',
      category: 'music',
      sourceName: 'Sample data',
      sourceUrl: null,
    },
  ]

  const places = [
    { id: 'p1', osmId: null, name: 'National Gallery Singapore', kind: 'museum', latitude: 1.2903, longitude: 103.8515, openingHours: 'Mo-Su 10:00-19:00' },
    { id: 'p2', osmId: null, name: 'Haji Lane', kind: 'attraction', latitude: 1.3007, longitude: 103.8588, openingHours: null },
    { id: 'p3', osmId: null, name: 'Fort Canning Park', kind: 'park', latitude: 1.2955, longitude: 103.8458, openingHours: '24/7' },
  ]

  const hangouts = [
    {
      id: 'h1',
      hostId: 'u1',
      title: 'Saturday catch-up',
      mode: 'group',
      status: 'collecting',
      dateFrom: dayFromToday(3),
      dateTo: dayFromToday(10),
      minDurationMins: 180,
      areaName: 'Bugis',
      areaLat: 1.3006, areaLng: 103.8559,
      vibe: ['food', 'arts'],
      lockedSlotStart: null,
      lockedSlotEnd: null,
      inviteCode: 'demo-h1',
      members: [
        { userId: 'u1', name: 'Alex Tan', role: 'host', required: true, availabilitySource: 'grid', arrivalAt: null },
        { userId: 'u2', name: 'Bea Lim', role: 'member', required: false, availabilitySource: 'gcal', arrivalAt: null },
        { userId: 'u3', name: 'Chen Wei', role: 'member', required: false, availabilitySource: null, arrivalAt: null },
      ],
      availability: [],
      itinerary: null,
    },
    {
      id: 'h2',
      hostId: 'u1',
      title: 'Solo afternoon in town',
      mode: 'solo',
      status: 'planned',
      dateFrom: dayFromToday(2),
      dateTo: dayFromToday(2),
      minDurationMins: 240,
      areaName: 'City Hall',
      areaLat: 1.2931, areaLng: 103.8520,
      vibe: ['arts', 'food'],
      lockedSlotStart: atTime(2, 13),
      lockedSlotEnd: atTime(2, 18),
      inviteCode: 'demo-h2',
      members: [
        { userId: 'u1', name: 'Alex Tan', role: 'host', required: true, availabilitySource: 'grid', arrivalAt: null },
      ],
      availability: [],
      // A hand-written sample so the itinerary timeline has something to show.
      itinerary: {
        id: 'i1',
        version: 1,
        generatedBy: 'manual',
        status: 'final',
        stops: [
          { id: 's1', seq: 1, kind: 'activity', refType: 'place', refId: 'p1', title: 'National Gallery Singapore', startsAt: atTime(2, 13), endsAt: atTime(2, 15), latitude: 1.2903, longitude: 103.8515, travelMinsFromPrev: null, votes: [], alternatives: [] },
          { id: 's2', seq: 2, kind: 'transit', refType: 'custom', refId: null, title: 'Walk to Bugis', startsAt: atTime(2, 15), endsAt: atTime(2, 15, 20), latitude: null, longitude: null, travelMinsFromPrev: 20, votes: [], alternatives: [] },
          { id: 's3', seq: 3, kind: 'meal', refType: 'deal', refId: 'd1', title: 'Sample Kopitiam (1-for-1 kaya toast set)', startsAt: atTime(2, 15, 20), endsAt: atTime(2, 16, 15), latitude: 1.2996, longitude: 103.8554, travelMinsFromPrev: 0, votes: [], alternatives: [] },
          { id: 's4', seq: 4, kind: 'activity', refType: 'place', refId: 'p2', title: 'Haji Lane', startsAt: atTime(2, 16, 25), endsAt: atTime(2, 18), latitude: 1.3007, longitude: 103.8588, travelMinsFromPrev: 10, votes: [], alternatives: [] },
        ],
      },
    },
  ]

  return { deals, externalEvents, places, hangouts }
}
