import checks from '../../server/tests/checks.js'
const { checkTrue } = checks
const checkMatch = (value, pattern) => checkTrue(pattern.test(value), `Missing content: ${pattern}`)
const checkDoesNotMatch = (value, pattern) => checkTrue(!pattern.test(value), `Unexpected content: ${pattern}`)
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { compileScript, parse } from 'vue/compiler-sfc'

const { descriptor: artworkDescriptor } = parse(await readFile(new URL('../src/components/EventArtwork.vue', import.meta.url), 'utf8'))
const artworkScript = compileScript(artworkDescriptor, { id: 'event-artwork-test', inlineTemplate: true }).content
  .replaceAll('from "vue"', `from '${import.meta.resolve('vue')}'`)
  .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
const artworkUrl = `data:text/javascript;base64,${Buffer.from(artworkScript).toString('base64')}`
const { descriptor } = parse(await readFile(new URL('../src/components/EventCard.vue', import.meta.url), 'utf8'))
const script = compileScript(descriptor, { id: 'event-card-test', inlineTemplate: true }).content
  .replaceAll('from "vue"', `from '${import.meta.resolve('vue')}'`)
  .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  .replaceAll("from 'vue-router'", `from '${import.meta.resolve('vue-router')}'`)
  .replace("from './EventArtwork.vue'", `from '${artworkUrl}'`)
const { default: Card } = await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`)
async function renderCard(extra = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }, { path: '/events/:id/rsvp', component: { render: () => null } }] })
  await router.push('/')
  return renderToString(createSSRApp(Card, { event: { id: 'event-1', title: 'Futsal Match', category: 'sports', start_time: '2026-10-25T10:00:00Z', confirmed_count: 3, ...extra } }).use(router))
}

test('card shows category, venue pin, accessible attendee photos, and distinct event/RSVP links', async () => {
  const html = await renderCard({ venue_name: 'Sports Hall', attendees: [{ id: 'alex', display_name: 'Alex Tan', avatar_url: 'https://example.com/alex.jpg' }] })
  checkMatch(html, /category-chip[^>]*>sports/)
  checkMatch(html, /venue-line/)
  checkMatch(html, /Sports Hall/)
  checkMatch(html, /src="https:\/\/example.com\/alex.jpg"/)
  checkMatch(html, /alt="Alex Tan"/)
  checkMatch(html, /href="\/events\/event-1\/rsvp"/)
  checkMatch(html, /href="\/events\/event-1\/rsvp#rsvp"/)
  checkMatch(html, /3 going/)
})

test('missing photos use initials and missing venues are stated without inventing an address', async () => {
  const html = await renderCard({ attendees: [{ id: 'alex', display_name: 'Alex Tan' }] })
  checkMatch(html, /aria-label="Alex Tan">AT/)
  checkMatch(html, /venue-line/)
  checkMatch(html, /Venue to be announced/)
  checkDoesNotMatch(html, /Campus Futsal Court/)
  checkDoesNotMatch(html, /\(demo\)/)
  checkDoesNotMatch(html, /src=""/)
})

test('location displays the venue and address, or the address alone when no name is available', async () => {
  const html = await renderCard({ venue_name: 'Sports Hall', venue_address: '81 Victoria Street' })
  checkMatch(html, /Sports Hall · 81 Victoria Street/)
  checkDoesNotMatch(html, /\(demo\)/)
  checkMatch(html, /venue-line[^]*?<svg/)
  const addressOnly = await renderCard({ venue_address: '81 Victoria Street' })
  checkMatch(addressOnly, /venue-line/)
  checkMatch(addressOnly, /81 Victoria Street/)
  const duplicate = await renderCard({ venue_name: 'Sports Hall', venue_address: 'Sports Hall' })
  checkDoesNotMatch(duplicate, /Sports Hall · Sports Hall/)
})

test('uploaded cover takes priority and missing cover uses authored category artwork', async () => {
  const uploaded = await renderCard({ image_url: 'https://example.com/event-cover.jpg' })
  checkMatch(uploaded, /src="https:\/\/example.com\/event-cover.jpg"/)
  const illustrated = await renderCard({ image_url: '', tags: ['sports'] })
  checkMatch(illustrated, /class="event-artwork"/)
  checkMatch(illustrated, /artwork-category/)
  checkDoesNotMatch(illustrated, /radial-gradient/)
})

test('availability distinguishes remaining places and full waitlists', async () => {
  const open = await renderCard({ spots_left: 1 })
  checkMatch(open, /1 place left/)
  const full = await renderCard({ spots_left: 0 })
  checkMatch(full, /Full · Join the waitlist/)
})

test('title opens details and only real description and attendance data appear', async () => {
  const html = await renderCard({ description: 'A friendly afternoon of futsal.', confirmed_count: undefined })
  checkMatch(html, /event-title[^]*?<a[^>]*href="\/events\/event-1\/rsvp"[^>]*>Futsal Match<\/a>/)
  checkMatch(html, /event-description[^>]*>A friendly afternoon of futsal./)
  checkMatch(html, /Oct 25/)
  checkDoesNotMatch(html, /going-count/)
  const missing = await renderCard({ description: '  ' })
  checkDoesNotMatch(missing, /event-description/)
})
