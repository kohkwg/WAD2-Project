import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createRouter, createMemoryHistory } from 'vue-router'
import { parse, compileScript } from 'vue/compiler-sfc'
import checks from '../../server/tests/checks.js'

const { checkTrue, checkEqual } = checks
const cache = new Map()
async function componentUrl(file) {
  const key = file.href
  if (cache.has(key)) return cache.get(key)
  const { descriptor } = parse(await readFile(file, 'utf8'))
  let source = compileScript(descriptor, { id: key, inlineTemplate: true }).content
  const dependencies = [...source.matchAll(/from (['"])([^'"]+\.vue)\1/g)]
  for (const match of dependencies) source = source.replace(match[0], `from '${await componentUrl(new URL(match[2], file))}'`)
  for (const name of ['vue', 'vue-router']) source = source.replaceAll(`from '${name}'`, `from '${import.meta.resolve(name)}'`).replaceAll(`from "${name}"`, `from '${import.meta.resolve(name)}'`)
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  cache.set(key, url)
  return url
}
const { default: Picks } = await import(await componentUrl(new URL('../src/components/PickedForYou.vue', import.meta.url)))
const { default: Row } = await import(await componentUrl(new URL('../src/components/discovery/DiscoveryEventRow.vue', import.meta.url)))
async function render(component, props) {
  const router = createRouter({ history: createMemoryHistory(), routes: ['/', '/profile', '/events/:id/rsvp'].map(path => ({ path, component: { render: () => null } })) })
  await router.push('/')
  return renderToString(createSSRApp(component, props).use(router))
}
const event = (id, extra = {}) => ({ id, title: `Event ${id}`, start_time: '2030-01-03T10:00:00Z', venue_name: 'Campus Hall', tags: ['gaming'], spots_left: 8, ...extra })

test('compact strip preserves backend ranking rather than sorting by displayed compatibility', async () => {
  const rows = [event('rank-first', { compatibilityScore: 25 }), event('rank-second', { compatibilityScore: 90 }), event('rank-third', { compatibilityScore: 60 })]
    .map(row => ({ ...row, source: 'personalised', reason: 'Matches your interests: gaming', recommendation_actions: true }))
  const html = await render(Picks, { strip: true, compact: true, personalized: true, events: rows })
  const titles = [...html.matchAll(/<h3[^>]*>[^]*?<a[^>]*>([^<]+)<\/a><\/h3>/g)].map(match => match[1])
  checkEqual(titles.join('|'), rows.map(row => row.title).join('|'))
  checkTrue(html.includes('25% match') && html.includes('90% match') && html.includes('60% match'))
  checkTrue(html.includes('Save Event rank-first') && html.includes('Not interested in Event rank-first'))
})

test('general discovery keeps its actual source label without pretending to be a personalised match', async () => {
  const html = await render(Picks, { strip: true, personalized: true, events: [event('general', { source: 'general_discovery', compatibilityScore: 0, reason: 'Upcoming event to explore' })] })
  checkTrue(html.includes('Something to explore'))
  checkTrue(!html.includes('0% match'))
  const visitor = await render(Picks, { strip: true, events: [event('visitor')] })
  checkTrue(visitor.includes('Sign in for personalised picks'))
})

test('timeline row preserves actual registration status and routes full events to the waitlist', async () => {
  // Unselected rows state your status in words; the status action appears once the row is selected.
  const going = await render(Row, { event: event('going', { registration_status: 'confirmed' }) })
  checkTrue(going.includes('You’re going'))
  const confirmed = await render(Row, { event: event('going', { registration_status: 'confirmed' }), selected: true })
  checkTrue(confirmed.includes('Confirmed'))
  checkTrue(!confirmed.includes('href="/events/going/rsvp#rsvp"'))
  const full = await render(Row, { event: event('full', { spots_left: 0 }), selected: true })
  checkTrue(full.includes('href="/events/full/rsvp#waitlist"') && full.includes('Join waitlist'))
  const unknown = await render(Row, { event: event('unknown', { spots_left: null }), recommendation: { source: 'general_discovery', compatibilityScore: 0 } })
  checkTrue(!unknown.includes('spots left') && !unknown.includes('% match'))
})

test('strip retains recommendation failure/retry and dismissal undo instead of hiding these states', async () => {
  const unavailable = await render(Picks, { strip: true, personalized: true, error: 'Could not load recommendations.' })
  checkTrue(unavailable.includes('Could not load recommendations.') && unavailable.includes('Try again'))
  const undo = await render(Picks, { strip: true, personalized: true, events: [event('next')], undoEvent: event('hidden') })
  checkTrue(undo.includes('Hidden Event hidden') && undo.includes('undo-recommendation-dismiss') && undo.includes('Undo'))
})

 test('event-row titles retain detail links alongside an explicit map-selection control', async () => {
  const html = await render(Row, { event: event('details') })
  checkTrue(html.includes('href="/events/details/rsvp"'))
  checkTrue(html.includes('Show Event details on map') && html.includes('aria-pressed="false"'))
})
