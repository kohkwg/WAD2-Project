import test from 'node:test'
import assert from 'node:assert/strict'
import { createSupabaseFeature4Api } from '../supabaseFeature4Api.js'

function fakeClient({ announcements = [], rpcResults = {}, rpcError = null } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      const query = {
        table, filters: [], operation: 'select', payload: null,
        select(columns) { this.columns = columns; return this },
        eq(column, value) { this.filters.push([column, value]); return this },
        order(column, options) { this.ordering = [column, options]; return this },
        insert(payload) { this.operation = 'insert'; this.payload = payload; return this },
        update(payload) { this.operation = 'update'; this.payload = payload; return this },
        delete() { this.operation = 'delete'; return this },
        single() { return Promise.resolve(this.result(true)) },
        maybeSingle() { return Promise.resolve(this.result(true)) },
        result(single) {
          calls.push({ table, filters: this.filters, operation: this.operation, payload: this.payload, columns: this.columns })
          const rows = table === 'announcements' ? announcements : []
          return { data: single ? rows[0] ?? null : rows, error: null }
        },
        then(resolve, reject) { return Promise.resolve(this.result(false)).then(resolve, reject) },
      }
      return query
    },
    rpc(name, args) {
      calls.push({ rpc: name, args })
      return Promise.resolve({ data: Object.hasOwn(rpcResults, name) ? rpcResults[name] : [], error: rpcError })
    },
  }
}

test('public feed reads only everyone posts and maps public DTO timestamps', async () => {
  const client = fakeClient({ announcements: [{
    id: 'p1', event_id: 'e1', body: 'Update', is_automatic: false,
    created_at: '2026-10-22T00:00:00Z', updated_at: '2026-10-22T01:00:00Z',
  }] })
  const api = createSupabaseFeature4Api(client)
  const posts = await api.getAnnouncements('e1')
  assert.deepEqual(posts, [{
    id: 'p1', eventId: 'e1', body: 'Update', kind: 'manual',
    createdAt: '2026-10-22T00:00:00Z', updatedAt: '2026-10-22T01:00:00Z',
  }])
  assert.deepEqual(client.calls[0].filters, [['event_id', 'e1'], ['audience', 'everyone']])
  assert.match(client.calls[0].columns, /updated_at/)
})

test('private workspace rejects a non-owner before any private table reads', async () => {
  const client = fakeClient()
  const api = createSupabaseFeature4Api(client, async () => ({ isMine: false }))
  await assert.rejects(api.getEventOperations('e1'), /Only the event organiser/)
  assert.deepEqual(client.calls, [])
})

test('missing live Feature 4 schema reports the migration requirement', async () => {
  const client = fakeClient()
  client.from = () => {
    const query = {
      select() { return query }, eq() { return query }, order() { return query },
      then(resolve) { return Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'table absent' } }).then(resolve) },
    }
    return query
  }
  const api = createSupabaseFeature4Api(client, async () => ({ isMine: true }))
  await assert.rejects(api.getAnnouncements('e1'), /Feature 4 database migration/i)
})

test('task board delegates the validated ordered columns to the atomic RPC', async () => {
  const client = fakeClient()
  const api = createSupabaseFeature4Api(client, async () => ({ isMine: true }))
  await api.saveTaskBoard('e1', { todo: ['a'], in_progress: ['b'], done: [] })
  assert.deepEqual(client.calls.at(-1), {
    rpc: 'save_feature4_task_board',
    args: { p_event_id: 'e1', p_columns: { todo: ['a'], in_progress: ['b'], done: [] } },
  })
  await assert.rejects(api.saveTaskBoard('e1', { todo: ['a'], in_progress: ['a'], done: [] }), /every event task exactly once/)
})

test('automatic venue-switch history cannot be edited or deleted', async () => {
  const client = fakeClient({ announcements: [{ id: 'auto', is_automatic: true }] })
  const api = createSupabaseFeature4Api(client, async () => ({ isMine: true }))
  await assert.rejects(api.updateAnnouncement('e1', 'auto', 'replacement'), /immutable/)
  await assert.rejects(api.deleteAnnouncement('e1', 'auto'), /immutable/)
})

test('budget limit uses an atomic RPC and maps its persisted decimal result', async () => {
  const client = fakeClient({ rpcResults: { set_feature4_budget_limit: '125.50' } })
  const api = createSupabaseFeature4Api(client, async () => ({ isMine: true }))
  const budget = await api.saveBudgetLimit('e1', 12_550)
  assert.deepEqual(client.calls.find((call) => call.rpc === 'set_feature4_budget_limit'), {
    rpc: 'set_feature4_budget_limit',
    args: { p_event_id: 'e1', p_limit: '125.50' },
  })
  assert.equal(budget.limitCents, 12_550)
})

test('forecast area uses its atomic RPC and returns the persisted choice', async () => {
  const client = fakeClient({ rpcResults: { set_feature4_forecast_area: 'Jurong West' } })
  const api = createSupabaseFeature4Api(client, async () => ({ isMine: true }), async () => [
    { name: 'Jurong West' }, { name: 'Central Area' },
  ])
  assert.equal(await api.setForecastArea('e1', ' Jurong West '), 'Jurong West')
  assert.deepEqual(client.calls.at(-1), {
    rpc: 'set_feature4_forecast_area',
    args: { p_event_id: 'e1', p_area: 'Jurong West' },
  })
  await assert.rejects(api.setForecastArea('e1', 'Atlantis'), /available forecast area/)
  assert.equal(client.calls.length, 1)
})

test('task delete and position compaction happen in one RPC', async () => {
  const client = fakeClient({ rpcResults: { delete_feature4_task: 1 } })
  const api = createSupabaseFeature4Api(client, async () => ({ isMine: true }))
  await api.deleteTask('e1', 'task-1')
  assert.deepEqual(client.calls, [{
    rpc: 'delete_feature4_task',
    args: { p_event_id: 'e1', p_task_id: 'task-1' },
  }])

  const missing = createSupabaseFeature4Api(fakeClient({ rpcResults: { delete_feature4_task: 0 } }), async () => ({ isMine: true }))
  await assert.rejects(missing.deleteTask('e1', 'missing'), /Task not found/)
})

test('task creation uses its atomic position-assignment RPC and maps the task DTO', async () => {
  const client = fakeClient({ rpcResults: {
    create_feature4_task: {
      id: 'task-2', event_id: 'e1', title: 'Set up room', description: 'Arrange chairs',
      status: 'todo', position: 3,
    },
  } })
  const api = createSupabaseFeature4Api(client, async () => ({ isMine: true }))
  assert.deepEqual(await api.createTask('e1', { requestId: 'request-2', title: ' Set up room ', notes: ' Arrange chairs ' }), {
    id: 'task-2', eventId: 'e1', title: 'Set up room', notes: 'Arrange chairs', status: 'todo', position: 3,
  })
  assert.deepEqual(client.calls, [{
    rpc: 'create_feature4_task',
    args: { p_event_id: 'e1', p_task_id: 'request-2', p_title: 'Set up room', p_description: 'Arrange chairs' },
  }])
})

function retryClient() {
  const rows = { tasks: [], announcements: [], budget_items: [], event_operation_settings: [] }
  const calls = []
  return {
    rows, calls,
    from(table) {
      const query = { table, filters: [], operation: 'select', payload: null, columns: '' }
      query.select = columns => { query.columns = columns; return query }
      query.eq = (column, value) => { query.filters.push([column, value]); return query }
      query.insert = payload => { query.operation = 'insert'; query.payload = payload; return query }
      query.single = () => query.result(true)
      query.maybeSingle = () => query.result(true)
      query.result = single => {
        calls.push({ table, operation: query.operation, payload: query.payload, filters: [...query.filters] })
        if (query.operation === 'insert') {
          if (rows[table].some(row => row.id === query.payload.id)) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
          rows[table].push({ ...query.payload, created_at: 'now', updated_at: null })
          return Promise.resolve({ data: rows[table].at(-1), error: null })
        }
        let found = rows[table].filter(row => query.filters.every(([key, value]) => row[key] === value))
        return Promise.resolve({ data: single ? found[0] ?? null : found, error: null })
      }
      return query
    },
    rpc(name, args) {
      calls.push({ rpc: name, args })
      if (name !== 'create_feature4_task') return Promise.resolve({ data: null, error: null })
      const prior = rows.tasks.find(row => row.id === args.p_task_id)
      if (prior) return Promise.resolve({ data: null, error: { message: 'Failed to fetch' } })
      const row = { id: args.p_task_id, event_id: args.p_event_id, title: args.p_title, description: args.p_description, status: 'todo', position: rows.tasks.length }
      rows.tasks.push(row)
      return Promise.resolve({ data: null, error: { message: 'Failed to fetch' } })
    },
  }
}

test('task retry reconciles by request ID without allocating a second position', async () => {
  const client = retryClient()
  const api = createSupabaseFeature4Api(client, async () => ({ isMine: true }))
  const input = { requestId: 'stable-task', title: 'Room', notes: '' }
  const first = await api.createTask('e1', input)
  const repeated = await api.createTask('e1', input)
  assert.deepEqual(repeated, first)
  assert.equal(client.rows.tasks.length, 1)
  assert.equal(client.rows.tasks[0].position, 0)
})

test('manual announcement and budget creates reconcile repeated IDs and reject mismatched payloads', async () => {
  const client = retryClient()
  const api = createSupabaseFeature4Api(client, async () => ({ isMine: true }))
  const announcement = await api.createAnnouncement('e1', 'Doors open', 'stable-post')
  assert.deepEqual(await api.createAnnouncement('e1', 'Doors open', 'stable-post'), announcement)
  await assert.rejects(api.createAnnouncement('e1', 'Different body', 'stable-post'), /duplicate key/)

  const item = { requestId: 'stable-budget', name: 'Catering', category: 'Food & drink', plannedCents: 10000, actualCents: 0 }
  const saved = await api.saveBudgetItem('e1', item)
  assert.deepEqual(await api.saveBudgetItem('e1', item), saved)
  await assert.rejects(api.saveBudgetItem('e1', { ...item, actualCents: 1 }), /duplicate key/)
  assert.equal(client.rows.announcements.length, 1)
  assert.equal(client.rows.budget_items.length, 1)
})

test('budget categories use atomic RPCs and expenses send quantity with line totals', async () => {
  const client = fakeClient({ rpcResults: { add_feature4_budget_category: ['Transport'], delete_feature4_budget_category: [] } })
  const api = createSupabaseFeature4Api(client, async () => ({ isMine: true }))
  assert.deepEqual(await api.createBudgetCategory('e1', '  Transport '), ['Transport'])
  assert.deepEqual(client.calls.find(call => call.rpc === 'add_feature4_budget_category').args, { p_event_id: 'e1', p_name: 'Transport' })
  await assert.rejects(api.createBudgetCategory('e1', 'venue'), /already a category/)
  assert.deepEqual(await api.deleteBudgetCategory('e1', 'Transport'), { categories: [], items: [] })
  assert.deepEqual(client.calls.find(call => call.rpc === 'delete_feature4_budget_category').args, { p_event_id: 'e1', p_name: 'Transport' })

  const store = retryClient()
  const live = createSupabaseFeature4Api(store, async () => ({ isMine: true }))
  const item = { name: 'Lanyards', category: 'Marketing', quantity: 3, plannedCents: 3000, actualCents: 2997 }
  assert.equal((await live.saveBudgetItem('e1', item)).quantity, 3)
  const row = store.rows.budget_items[0]
  assert.deepEqual([row.quantity, row.estimated_amount, row.actual_amount], [3, '30.00', '29.97'])
  await assert.rejects(live.saveBudgetItem('e1', { ...item, plannedCents: 1000 }), /whole-cent/)
  await assert.rejects(live.saveBudgetItem('e1', { ...item, category: 'Transport' }), /valid budget category/)
})

test('permission and validation failures do not reconcile into apparent success', async () => {
  const client = fakeClient({ rpcError: Object.assign(new Error('Only the event owner can create tasks'), { code: '42501' }) })
  const api = createSupabaseFeature4Api(client, async () => ({ isMine: true }))
  await assert.rejects(api.createTask('e1', { requestId: 'denied', title: 'Room' }), /Only the event owner/)
  assert.equal(client.calls.filter(call => call.table === 'tasks').length, 0)
})
