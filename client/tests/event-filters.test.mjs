import checks from '../../server/tests/checks.js'
const { checkEqual, checkDeepEqual, checkTrue } = checks
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createSSRApp, reactive } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { compileScript, parse } from 'vue/compiler-sfc'
import { normalizeDiscoveryFilters, discoveryDateRange, discoveryEventQuery, discoveryUrlQuery, discoveryFiltersFromQuery } from '../src/lib/discoveryFilters.js'

const { descriptor } = parse(await readFile(new URL('../src/components/EventFilters.vue', import.meta.url), 'utf8'))
const source = compileScript(descriptor, { id: 'event-filters-test' }).content
  .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  .replace("from '@/lib/discoveryFilters'", `from '${new URL('../src/lib/discoveryFilters.js', import.meta.url).href}'`)
const { default: Filters } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
async function setupFilters(initial = {}, search = 'Futsal') {
  const props = reactive({ modelValue: normalizeDiscoveryFilters(initial), search, total: 3, loading: false, error: '', showActive: false })
  let state
  const emitted = []
  await renderToString(createSSRApp({ setup() {
    state = Filters.setup(props, { expose() {}, emit: (name, value) => {
      emitted.push([name, value])
      if (name === 'update:modelValue') props.modelValue = value
      if (name === 'update:search') props.search = value
    } })
    return () => null
  } }))
  return { state, props, emitted }
}

test('When is single-select and clicking the selected option deselects it', async () => {
  const { state, props } = await setupFilters()
  state.choose('when', 'today')
  checkEqual(props.modelValue.when, 'today')
  state.choose('when', 'weekend')
  checkEqual(props.modelValue.when, 'weekend')
  state.choose('when', 'weekend')
  checkEqual(props.modelValue.when, '')
})

test('extras and categories share the canonical state and accurate active count', async () => {
  const { state, props } = await setupFilters()
  state.choose('when', 'today'); state.choose('extras', 'spots_left')
  state.choose('categories', 'sports'); state.choose('categories', 'music')
  checkEqual(state.activeCount.value, 4)
  checkDeepEqual(props.modelValue, { when: 'today', extras: ['spots_left'], categories: ['sports', 'music'] })
  state.choose('categories', 'sports')
  checkDeepEqual(props.modelValue.categories, ['music'])
  checkEqual(props.search, 'Futsal')
})

test('clear all clears filters only, pending search is flushed, and Show closes the panel', async () => {
  const { state, props, emitted } = await setupFilters({ categories: ['arts'] })
  state.search.value = 'Pottery'
  state.clearAll()
  checkDeepEqual(props.modelValue, { when: '', extras: [], categories: [] })
  checkEqual(props.search, 'Pottery')
  state.expanded.value = true
  state.showEvents()
  checkEqual(state.expanded.value, false)
  checkTrue(emitted.some(([name]) => name === 'show'))
  await state.clearSearch()
  checkEqual(props.search, '')
})

test('Pick dates emits a calendar hook and applies no invented date range', async () => {
  const { state, props, emitted } = await setupFilters()
  state.choose('when', 'pick_dates')
  checkEqual(props.modelValue.when, 'pick_dates')
  checkTrue(emitted.some(([name]) => name === 'pick-dates'))
  checkDeepEqual(discoveryDateRange('pick_dates'), {})
})

test('normalization removes Free and unknown choices without mutating inputs', () => {
  const value = { when: 'unknown', extras: ['free', 'spots_left', 'spots_left'], categories: ['arts', 'arts', 'fake'], price: 0 }
  checkDeepEqual(normalizeDiscoveryFilters(value), { when: '', extras: ['spots_left'], categories: ['arts'] })
  checkEqual(value.extras.length, 3)
})

test('date presets use Singapore days, Monday weeks and the current/upcoming weekend', () => {
  checkDeepEqual(discoveryDateRange('today', '2026-10-26T16:01:00Z'), { dateFrom: '2026-10-27', dateTo: '2026-10-27' })
  checkDeepEqual(discoveryDateRange('week', '2026-10-27T10:00:00Z'), { dateFrom: '2026-10-26', dateTo: '2026-11-01' })
  checkDeepEqual(discoveryDateRange('weekend', '2026-10-27T10:00:00Z'), { dateFrom: '2026-10-31', dateTo: '2026-11-01' })
  checkDeepEqual(discoveryDateRange('weekend', '2026-11-01T06:00:00Z'), { dateFrom: '2026-10-31', dateTo: '2026-11-01' })
  checkDeepEqual(discoveryDateRange('weekend', '2026-11-01T17:00:00Z'), { dateFrom: '2026-11-07', dateTo: '2026-11-08' })
})

test('URL roundtrip and derived event queries preserve one filter model', () => {
  const filters = { when: 'today', extras: ['spots_left'], categories: ['arts', 'music'] }
  const query = discoveryUrlQuery(filters, 'workshop', 'map')
  checkDeepEqual(discoveryFiltersFromQuery(query), filters)
  checkEqual(query.search, 'workshop')
  checkEqual(query.view, 'map')
  const eventQuery = discoveryEventQuery(filters, { search: 'workshop', now: '2026-10-27T10:00:00Z' })
  checkEqual(eventQuery.availableOnly, true)
  checkEqual(eventQuery.dateFrom, '2026-10-27')
  checkDeepEqual(Object.keys(filters), ['when', 'extras', 'categories'])
  checkDeepEqual(discoveryFiltersFromQuery({ extras: 'spots_left', categories: 'sports' }), { when: '', extras: ['spots_left'], categories: ['sports'] })
})
