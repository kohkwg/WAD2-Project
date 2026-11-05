import test from 'node:test'
import { readFile } from 'node:fs/promises'
import checks from '../../server/tests/checks.js'
const { checkEqual, checkDeepEqual, checkTrue } = checks
const source = (await readFile(new URL('../src/composables/useEvents.js', import.meta.url), 'utf8')).replace(/import[^\n]+\n/g, '')
const { useEvents } = await import('data:text/javascript;base64,' + Buffer.from(`
  import { ref } from '${import.meta.resolve('vue')}';
  const USING_SUPABASE = true;
  const supabase = {from: (...args) => globalThis.__eventCountSource(...args)};
  ${source}
`).toString('base64'))

function setup(response) {
  const calls = []
  const query = new Proxy({}, { get(_target, method) {
    if (method === 'then') return (resolve, reject) => Promise.resolve(typeof response === 'function' ? response() : response).then(resolve, reject)
    return (...args) => { calls.push([method, ...args]); return query }
  } })
  globalThis.__eventCountSource = (...args) => { calls.push(['from', ...args]); return query }
  return calls
}

test('live count uses an exact head query with Singapore date boundaries and no card hydration', async () => {
  const calls = setup({ count: 28, data: null, error: null })
  const state = useEvents()
  await state.fetchEvents({ countOnly: true, dateFrom: '2026-10-27', dateTo: '2026-10-27', categories: ['tech'], availableOnly: true })
  checkEqual(state.total.value, 28)
  checkDeepEqual(state.events.value, [])
  checkTrue(calls.some(([method, field, options]) => method === 'select' && field === 'id' && options.head === true && options.count === 'exact'))
  checkTrue(calls.some(([method, field, value]) => method === 'gte' && field === 'start_time' && value === '2026-10-26T16:00:00.000Z'))
  checkTrue(calls.some(([method, field, value]) => method === 'lte' && field === 'start_time' && value === '2026-10-27T15:59:59.999Z'))
  checkTrue(!calls.some(([method]) => method === 'range'))
  checkEqual(calls.filter(([method]) => method === 'from').length, 1)
})

test('missing or failed counts remain errors rather than claiming zero events', async () => {
  setup({ count: null, data: null, error: null })
  const state = useEvents()
  await state.fetchEvents({ countOnly: true })
  checkEqual(state.error.value, 'Event count is unavailable.')
  setup({ count: null, data: null, error: { message: 'Offline' } })
  await state.fetchEvents({ countOnly: true })
  checkEqual(state.error.value, 'Offline')
  setup({ count: 0, data: null, error: null })
  await state.fetchEvents({ countOnly: true })
  checkEqual(state.error.value, '')
  checkEqual(state.total.value, 0)
})

test('an older count response cannot replace the latest filter result', async () => {
  let resolveFirst, request = 0
  setup(() => ++request === 1 ? new Promise(resolve => { resolveFirst = resolve }) : { count: 2, error: null })
  const state = useEvents()
  const first = state.fetchEvents({ countOnly: true })
  await state.fetchEvents({ countOnly: true, categories: ['music'] })
  resolveFirst({ count: 30, error: null })
  await first
  checkEqual(state.total.value, 2)
  checkEqual(state.loading.value, false)
})
