import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createSSRApp, reactive } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { compileScript, parse } from 'vue/compiler-sfc'

const constants = await import(new URL('../src/lib/constants.js', import.meta.url))
const { descriptor } = parse(await readFile(new URL('../src/components/EventFilters.vue', import.meta.url), 'utf8'))
const source = compileScript(descriptor, { id: 'event-filters-test' }).content
  .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  .replace("import { CATEGORIES } from '@/lib/constants'", `const CATEGORIES = ${JSON.stringify(constants.CATEGORIES)}`)
const { default: Filters } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
async function setupFilters(overrides = {}) {
  const props = reactive({ modelValue: { search: 'Futsal', category: '', categories: [], dateFrom: '', dateTo: '', availableOnly: false, sort: 'soonest', page: 3, ...overrides } })
  let state
  await renderToString(createSSRApp({ setup() {
    state = Filters.setup(props, { expose() {}, emit: (_event, value) => { props.modelValue = value } })
    return () => null
  } }))
  return { state, props }
}

test('badges toggle independently, reset pagination, and retain search and other filters', async () => {
  const { state, props } = await setupFilters({ dateFrom: '2026-10-21', sort: 'popular' })
  state.toggleCategory('sports')
  state.toggleCategory('hackathon')
  assert.deepEqual([...state.selectedCategories.value], ['sports', 'hackathon'])
  assert.equal(props.modelValue.page, 1)
  assert.equal(props.modelValue.search, 'Futsal')
  assert.equal(props.modelValue.dateFrom, '2026-10-21')
  assert.equal(props.modelValue.sort, 'popular')
  state.toggleCategory('sports')
  assert.deepEqual([...state.selectedCategories.value], ['hackathon'])
  state.clearCategories()
  assert.deepEqual([...state.selectedCategories.value], [])
  assert.equal(props.modelValue.dateFrom, '2026-10-21')
})

test('dropdown count excludes category badges and Clear filters resets badges too', async () => {
  const { state, props } = await setupFilters({ categories: ['sports', 'hackathon'], availableOnly: true })
  assert.equal(state.expanded.value, false)
  assert.equal(state.activeCount.value, 1)
  state.reset()
  assert.equal(state.activeCount.value, 0)
  assert.deepEqual([...state.selectedCategories.value], [])
  assert.equal(props.modelValue.search, 'Futsal')
})

test('legacy single-category values are preserved when adding a second badge', async () => {
  const { state, props } = await setupFilters({ category: 'sports' })
  assert.deepEqual([...state.selectedCategories.value], ['sports'])
  state.toggleCategory('tech')
  assert.deepEqual([...state.selectedCategories.value], ['sports', 'tech'])
  assert.equal(props.modelValue.category, '')
})
