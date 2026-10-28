import assert from 'node:assert/strict'
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

test('initial layout shows one featured pick, two smaller picks, and See all for the remainder', async () => {
  const html = await render(Picks, { events, personalized: true })
  assert.match(html, /Picked for you/)
  assert.equal((html.match(/<article/g) || []).length, 3)
  assert.equal((html.match(/recommendation-card--featured/g) || []).length, 1)
  assert.match(html, /See all/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /Matches your interests: sports/)
  assert.doesNotMatch(html, /Pick number 3/)
})

test('featured pick shows only supplied distance and includes both action buttons', async () => {
  const html = await render(Card, { event: { ...events[0], distance_km: 1.2, venue_name: 'Sports Hall' }, featured: true })
  assert.match(html, /1.2 km from you/)
  assert.match(html, /Sports Hall/)
  assert.match(html, /20 spots left/)
  assert.match(html, /aria-label="View Pick number 0"/)
  assert.match(html, /aria-label="RSVP: Pick number 0"/)
  const withoutDistance = await render(Card, { event: events[0], featured: true })
  assert.doesNotMatch(withoutDistance, /km from you/)
})

test('loading, unavailable, and empty recommendations remain useful', async () => {
  const loading = await render(Picks, { loading: true })
  assert.match(loading, /Finding recommendations/)
  assert.match(loading, /pick-skeleton/)
  assert.doesNotMatch(loading, /No picks yet/)
  const error = await render(Picks, { error: 'Could not load recommendations.' })
  assert.match(error, /Could not load recommendations/)
  assert.match(error, /Try again/)
  const empty = await render(Picks, { personalized: true })
  assert.match(empty, /Add your interests/)
  assert.match(empty, /href="\/profile"/)
})

test('visitor picks explain their source and small lists do not offer a dead See all control', async () => {
  const html = await render(Picks, { events: [{ ...events[0], reason: 'Upcoming event' }] })
  assert.match(html, /Explore upcoming events/)
  assert.match(html, /Upcoming event/)
  assert.doesNotMatch(html, /See all/)
  assert.match(html, /picks-layout--single/)
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
  assert.equal(state.featured.value.id, 'open-interest')
  assert.equal(state.sidePicks.value.length, 2)
  assert.ok(!state.others.value.some(event => event.id === 'open-interest'))
  assert.equal(state.canToggle.value, true)
  state.showAll.value = true
  assert.equal(state.others.value.length, 5)
  assert.equal(state.morePicks.value.length, 3)
  state.showAll.value = false
  assert.equal(state.others.value.length, 2)
})

test('featured selection handles full-only and unlimited-capacity events', async () => {
  const fullOnly = events.slice(0, 2).map(event => ({ ...event, spots_left: 0 }))
  const full = await setupLogic(PicksLogic, { events: fullOnly, collapsedCount: 3 })
  assert.equal(full.state.featured.value.id, fullOnly[0].id)
  const unlimited = await setupLogic(PicksLogic, { events: [{ ...events[0], spots_left: null }], collapsedCount: 3 })
  assert.equal(unlimited.state.featured.value.id, events[0].id)
  const card = await setupLogic(CardLogic, { event: { ...events[0], spots_left: null }, featured: false })
  assert.equal(card.state.isFull.value, false)
  assert.equal(card.state.action.value.label, 'RSVP')
})

test('collapsedCount is respected and View delegates to the event route', async () => {
  const { state, router } = await setupLogic(PicksLogic, { events, collapsedCount: 5 })
  assert.equal(state.sidePicks.value.length, 2)
  assert.equal(state.morePicks.value.length, 2)
  await state.view(events[0])
  assert.equal(router.currentRoute.value.path, '/events/pick-0/rsvp')
})

test('RSVP and waitlist buttons only emit intents without changing supplied data', async () => {
  const open = await setupLogic(CardLogic, { event: Object.freeze({ ...events[0] }), featured: false })
  open.state.onAction()
  assert.deepEqual(open.emitted, [['rsvp', events[0]]])
  const fullEvent = Object.freeze({ ...events[0], spots_left: 0 })
  const full = await setupLogic(CardLogic, { event: fullEvent, featured: false })
  assert.equal(full.state.action.value.label, 'Join waitlist')
  full.state.onAction()
  assert.deepEqual(full.emitted, [['waitlist', fullEvent]])
})

test('existing waitlist/registration state is display-only and does not invent missing fields', async () => {
  const waitlisted = { ...events[0], spots_left: 0, my_rsvp_status: 'waitlisted', my_waitlist_priority: 'high' }
  const { state, emitted } = await setupLogic(CardLogic, { event: waitlisted, featured: false })
  assert.equal(state.action.value.label, 'On waitlist')
  assert.equal(state.action.value.disabled, true)
  assert.equal(state.waitlistNote.value, 'Your priority: high')
  state.onAction()
  assert.deepEqual(emitted, [])
  const html = await render(Card, { event: { ...events[0], spots_left: 0, waitlist_count: 12 } })
  assert.match(html, /12 on the waitlist/)
  assert.match(html, /Join waitlist/)
  const withoutCount = await render(Card, { event: { ...events[0], spots_left: 0 } })
  assert.doesNotMatch(withoutCount, /on the waitlist/)
  const confirmed = await setupLogic(CardLogic, { event: { ...events[0], registration_status: 'confirmed' }, featured: false })
  assert.equal(confirmed.state.action.value.disabled, true)
})
