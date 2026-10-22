import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { compileScript, parse } from 'vue/compiler-sfc'

const { descriptor } = parse(await readFile(new URL('../src/components/EventCard.vue', import.meta.url), 'utf8'))
const script = compileScript(descriptor, { id: 'event-card-test', inlineTemplate: true }).content
  .replaceAll('from "vue"', `from '${import.meta.resolve('vue')}'`)
  .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  .replaceAll("from 'vue-router'", `from '${import.meta.resolve('vue-router')}'`)
const { default: Card } = await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`)
async function renderCard(extra = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }, { path: '/events/:id', component: { render: () => null } }] })
  await router.push('/')
  return renderToString(createSSRApp(Card, { event: { id: 'event-1', title: 'Futsal Match', category: 'sports', start_time: '2026-10-25T10:00:00Z', confirmed_count: 3, ...extra } }).use(router))
}

test('card shows category, venue pin, accessible attendee photos, and distinct event/RSVP links', async () => {
  const html = await renderCard({ venue_name: 'Sports Hall', attendees: [{ id: 'alex', display_name: 'Alex Tan', avatar_url: 'https://example.com/alex.jpg' }] })
  assert.match(html, /category-chip[^>]*>sports/)
  assert.match(html, /venue-line/)
  assert.match(html, /Sports Hall/)
  assert.match(html, /src="https:\/\/example.com\/alex.jpg"/)
  assert.match(html, /alt="Alex Tan"/)
  assert.match(html, /href="\/events\/event-1"/)
  assert.match(html, /href="\/events\/event-1#rsvp"/)
  assert.match(html, /3 going/)
})

test('missing photos use initials and missing venues show the requested sample location', async () => {
  const html = await renderCard({ attendees: [{ id: 'alex', display_name: 'Alex Tan' }] })
  assert.match(html, /aria-label="Alex Tan">AT/)
  assert.match(html, /venue-line/)
  assert.match(html, /Campus Futsal Court · 21 Campus Walk/)
  assert.doesNotMatch(html, /\(demo\)/)
  assert.doesNotMatch(html, /src=""/)
})

test('location displays the venue and address, or the address alone when no name is available', async () => {
  const html = await renderCard({ venue_name: 'Sports Hall', venue_address: '81 Victoria Street' })
  assert.match(html, /Sports Hall · 81 Victoria Street/)
  assert.doesNotMatch(html, /\(demo\)/)
  assert.match(html, /venue-line[^]*?<svg/)
  const addressOnly = await renderCard({ venue_address: '81 Victoria Street' })
  assert.match(addressOnly, /venue-line/)
  assert.match(addressOnly, /81 Victoria Street/)
  const duplicate = await renderCard({ venue_name: 'Sports Hall', venue_address: 'Sports Hall' })
  assert.doesNotMatch(duplicate, /Sports Hall · Sports Hall/)
})
