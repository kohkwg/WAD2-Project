import checks from '../../server/tests/checks.js'
const { checkEqual, checkDeepEqual, checkTrue } = checks
const checkMatch = (text, pattern) => checkTrue(pattern.test(text), `Missing expected content: ${pattern}`)
const checkDoesNotMatch = (text, pattern) => checkTrue(!pattern.test(text), `Unexpected content: ${pattern}`)
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { compileScript, parse } from 'vue/compiler-sfc'

async function compileComponent(name, replacements = [], inlineTemplate = true) {
  const { descriptor } = parse(await readFile(new URL(`../src/components/${name}.vue`, import.meta.url), 'utf8'))
  let source = compileScript(descriptor, { id: name, inlineTemplate }).content
    .replaceAll('from "vue"', `from '${import.meta.resolve('vue')}'`)
    .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
    .replaceAll("from 'vue-router'", `from '${import.meta.resolve('vue-router')}'`)
  for (const [from, to] of replacements) source = source.replace(from, to)
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
}
const artworkUrl = await compileComponent('EventArtwork')
const cardUrl = await compileComponent('RecommendationCard', [["from './EventArtwork.vue'", `from '${artworkUrl}'`]])
const picksUrl = await compileComponent('PickedForYou', [["from './RecommendationCard.vue'", `from '${cardUrl}'`]])
const { default: Picks } = await import(picksUrl)
const { default: Card } = await import(cardUrl)
const { default: CardLogic } = await import(await compileComponent('RecommendationCard', [["from './EventArtwork.vue'", `from '${artworkUrl}'`]], false))
const { default: PicksLogic } = await import(await compileComponent('PickedForYou', [["from './RecommendationCard.vue'", `from '${cardUrl}'`]], false))
async function render(component, props) {
  const router = createRouter({ history: createMemoryHistory(), routes: ['/', '/profile', '/events/:id', '/events/:id/rsvp'].map(path => ({ path, component: { render: () => null } })) })
  await router.push('/')
  return renderToString(createSSRApp(component, props).use(router))
}
const events = Array.from({ length: 6 }, (_, index) => ({
  id: `pick-${index}`, title: `Pick number ${index}`, start_time: '2026-10-25T10:00:00Z', category: 'sports', spots_left: 20,
  reason: index === 0 ? 'Matches your interests: sports' : 'Happening soon',
}))

test('compact picks retain scores and actions in the carousel', async () => {
  const html = await render(Picks, { compact: true, filtered: true, personalized: true, collapsedCount: 2,
    events: events.map(event => ({ ...event, source: 'personalised', compatibilityScore: 50, recommendation_actions: true })) })
  checkMatch(html, /picked-for-you--compact/)
  checkMatch(html, /Picks matching your current filters/)
  checkMatch(html, /50% match/)
  checkMatch(html, /Why this/)
  checkMatch(html, /Save Pick number 0/)
  checkMatch(html, /Not interested in Pick number 0/)
  checkEqual((html.match(/<article/g) || []).length, 2)
  checkMatch(html, /Next pick/)
})

test('no matching picks offer other picks without pretending unrelated events match', async () => {
  const empty = await render(Picks, { compact: true, filtered: true, personalized: true, events: [] })
  checkMatch(empty, /No picks match your current filters/)
  checkMatch(empty, /View all picks/)
  checkDoesNotMatch(empty, /<article/)
  const others = await render(Picks, { compact: true, filtered: true, otherPicks: true, personalized: true, events: [events[0]] })
  checkMatch(others, /Your other picks/)
  checkMatch(others, /outside your current filters/)
  checkMatch(others, /Show matching picks/)
  checkDoesNotMatch(others, /Picks matching your current filters/)
})

test('initial carousel shows featured pick with two adjacent previews, navigation, and See all for the remainder', async () => {
  const html = await render(Picks, { events, personalized: true })
  checkMatch(html, /Picked for you/)
  checkEqual((html.match(/<article/g) || []).length, 3)
  checkEqual((html.match(/class="picks-slide/g) || []).length, 3)
  checkEqual((html.match(/is-active/g) || []).length, 2)
  checkMatch(html, /aria-roledescription="carousel"/)
  checkMatch(html, /aria-disabled="true"[^>]*aria-label="Previous pick"/)
  checkMatch(html, /aria-label="Show pick 3 of 3"/)
  checkMatch(html, /See all/)
  checkMatch(html, /aria-expanded="false"/)
  checkMatch(html, /Matches your interests: sports/)
  checkDoesNotMatch(html, /Pick number 3/)
})

test('featured pick shows only supplied distance and includes both action buttons', async () => {
  const html = await render(Card, { event: { ...events[0], distance_km: 1.2, venue_name: 'Sports Hall' }, featured: true })
  checkMatch(html, /1.2 km from you/)
  checkMatch(html, /Sports Hall/)
  checkMatch(html, /20 spots left/)
  checkMatch(html, /aria-label="View Pick number 0"/)
  checkMatch(html, /aria-label="RSVP: Pick number 0"/)
  const withoutDistance = await render(Card, { event: events[0], featured: true })
  checkDoesNotMatch(withoutDistance, /km from you/)
})

test('loading, unavailable, and empty recommendations remain useful', async () => {
  const loading = await render(Picks, { loading: true })
  checkMatch(loading, /Finding recommendations/)
  checkMatch(loading, /pick-skeleton/)
  checkDoesNotMatch(loading, /No picks yet/)
  const error = await render(Picks, { error: 'Could not load recommendations.' })
  checkMatch(error, /Could not load recommendations/)
  checkMatch(error, /Try again/)
  const empty = await render(Picks, { personalized: true })
  checkMatch(empty, /Add your interests/)
  checkMatch(empty, /href="\/profile"/)
})

test('visitor picks explain their source and small lists do not offer a dead See all control', async () => {
  const html = await render(Picks, { events: [{ ...events[0], reason: 'Upcoming event' }] })
  checkMatch(html, /Explore upcoming events/)
  checkMatch(html, /Upcoming event/)
  checkDoesNotMatch(html, /See all/)
  checkMatch(html, /picks-carousel--single/)
  checkDoesNotMatch(html, /Next pick/)
  checkDoesNotMatch(html, /picks-dot/)
})

async function setupLogic(component, props) {
  let state
  const emitted = []
  const Wrapper = { setup() {
    state = component.setup(props, { expose() {}, emit: (...args) => emitted.push(args) })
    return () => null
  } }
  const router = createRouter({ history: createMemoryHistory(), routes: ['/', '/events/:id', '/events/:id/rsvp'].map(path => ({ path, component: { render: () => null } })) })
  await router.push('/')
  await renderToString(createSSRApp(Wrapper).use(router))
  return { state, emitted, router }
}

test('featured pick prioritizes an available interest match and does not duplicate it', async () => {
  const candidates = [
    { ...events[0], id: 'full-interest', is_full: true, reason_type: 'interest' },
    { ...events[1], id: 'open-soon', reason_type: 'recency' },
    { ...events[2], id: 'open-interest', reason_type: 'interest' },
    ...events.slice(3),
  ]
  const { state } = await setupLogic(PicksLogic, { events: candidates, collapsedCount: 3 })
  checkEqual(state.featured.value.id, 'open-interest')
  checkEqual(state.slides.value.length, 3)
  checkEqual(state.slides.value[0].id, 'open-interest')
  checkTrue(!state.others.value.some(event => event.id === 'open-interest'))
  checkEqual(state.canToggle.value, true)
  state.showAll.value = true
  checkEqual(state.others.value.length, 5)
  checkEqual(state.slides.value.length, 6)
  state.showAll.value = false
  checkEqual(state.others.value.length, 2)
})

test('featured selection handles full-only and unlimited-capacity events', async () => {
  const fullOnly = events.slice(0, 2).map(event => ({ ...event, spots_left: 0 }))
  const full = await setupLogic(PicksLogic, { events: fullOnly, collapsedCount: 3 })
  checkEqual(full.state.featured.value.id, fullOnly[0].id)
  const unlimited = await setupLogic(PicksLogic, { events: [{ ...events[0], spots_left: null }], collapsedCount: 3 })
  checkEqual(unlimited.state.featured.value.id, events[0].id)
  const card = await setupLogic(CardLogic, { event: { ...events[0], spots_left: null }, featured: false })
  checkEqual(card.state.isFull.value, false)
  checkEqual(card.state.action.value.label, 'RSVP')
})

test('collapsedCount is respected and View delegates to the event route', async () => {
  const { state, router } = await setupLogic(PicksLogic, { events, collapsedCount: 5 })
  checkEqual(state.slides.value.length, 5)
  state.goTo(99)
  checkEqual(state.active.value, 4)
  state.goTo(-1)
  checkEqual(state.active.value, 0)
  await state.view(events[0])
  checkEqual(router.currentRoute.value.path, '/events/pick-0/rsvp')
})

test('RSVP and waitlist buttons only emit intents without changing supplied data', async () => {
  const open = await setupLogic(CardLogic, { event: Object.freeze({ ...events[0] }), featured: false })
  open.state.onAction()
  checkDeepEqual(open.emitted, [['rsvp', events[0]]])
  const fullEvent = Object.freeze({ ...events[0], spots_left: 0 })
  const full = await setupLogic(CardLogic, { event: fullEvent, featured: false })
  checkEqual(full.state.action.value.label, 'Join waitlist')
  full.state.onAction()
  checkDeepEqual(full.emitted, [['waitlist', fullEvent]])
})

test('existing waitlist/registration state is display-only and does not invent missing fields', async () => {
  const waitlisted = { ...events[0], spots_left: 0, my_rsvp_status: 'waitlisted', my_waitlist_priority: 'high' }
  const { state, emitted } = await setupLogic(CardLogic, { event: waitlisted, featured: false })
  checkEqual(state.action.value.label, 'On waitlist')
  checkEqual(state.action.value.disabled, true)
  checkEqual(state.waitlistNote.value, 'Your priority: high')
  state.onAction()
  checkDeepEqual(emitted, [])
  const html = await render(Card, { event: { ...events[0], spots_left: 0, waitlist_count: 12 } })
  checkMatch(html, /12 on the waitlist/)
  checkMatch(html, /Join waitlist/)
  const withoutCount = await render(Card, { event: { ...events[0], spots_left: 0 } })
  checkDoesNotMatch(withoutCount, /on the waitlist/)
  const confirmed = await setupLogic(CardLogic, { event: { ...events[0], registration_status: 'confirmed' }, featured: false })
  checkEqual(confirmed.state.action.value.disabled, true)
})

test('V1 cards preserve pipeline order and display match scores with supported explanations', async () => {
  const candidates = [
    { ...events[0], id: 'first', source: 'personalised', compatibilityScore: 80, reason_type: 'interest', recommendation_actions: true, saved: true },
    { ...events[1], id: 'second', source: 'personalised', compatibilityScore: 90, reason_type: 'interest' },
  ]
  const { state } = await setupLogic(PicksLogic, { events: candidates, collapsedCount: 3 })
  checkEqual(state.featured.value.id, 'first')
  const html = await render(Card, { event: candidates[0] })
  checkMatch(html, /80% match/)
  checkMatch(html, /Why this\?/)
  checkMatch(html, /not your chance of attending/)
  checkMatch(html, /aria-pressed="true"/)
  checkMatch(html, /Unsave Pick number 0/)
  checkMatch(html, /Not interested/)
})

test('general discovery is labelled without a fake personalised percentage', async () => {
  const html = await render(Card, { event: { ...events[0], source: 'general_discovery', compatibilityScore: 0, reason: 'Upcoming event to explore' } })
  checkMatch(html, /General discovery/)
  checkDoesNotMatch(html, /0% match/)
  checkMatch(html, /not a personalised match/)
})

test('pending actions are disabled and dismissal exposes an undo control beside errors', async () => {
  const html = await render(Picks, { events: [{ ...events[0], recommendation_actions: true }], preferencePending: true,
    undoEvent: events[1], actionError: 'Could not save your preference.' })
  checkMatch(html, /Could not save your preference/)
  checkMatch(html, /id="undo-recommendation-dismiss"/)
  checkMatch(html, /Undo/)
  checkTrue((html.match(/disabled/g) || []).length >= 3)
})

test('recommendation title links to details and description uses supplied copy only', async () => {
  const html = await render(Card, { event: { ...events[0], description: 'Meet other music lovers.' } })
  checkMatch(html, /pick-title[^]*?href="\/events\/pick-0\/rsvp"/)
  checkMatch(html, /pick-description[^>]*>Meet other music lovers./)
  const missing = await render(Card, { event: events[0] })
  checkDoesNotMatch(missing, /pick-description/)
})
