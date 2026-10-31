const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const filename = path.join(__dirname, '../routes/planSuggestions.js');
const localRequire = createRequire(filename);

const plain = value => JSON.parse(JSON.stringify(value)); // arrays made inside the vm sandbox have another prototype
const ME = 'user-me';
const ended = '2026-09-01T12:00:00Z';
const startedAt = '2026-09-01T08:00:00Z';
const event = (id, organiser, title, extra = {}) => ({ id, organiser_id: organiser, title, description: 'coding talks', category: 'Tech', starts_at: startedAt, ends_at: ended, capacity: 100, event_interests: [{ interests: { slug: 'tech' } }], ...extra });

// A chainable, awaitable stand-in for a supabase-js query that records every call.
function harness({ tables, failTable } = {}) {
  const calls = [];
  const client = {
    from(table) {
      const record = { table, ops: [] };
      calls.push(record);
      const builder = new Proxy({}, {
        get(_target, name) {
          if (name === 'then') {
            return (resolve, reject) => {
              if (failTable === table) return resolve({ data: null, error: { message: 'boom secret' } });
              let rows = tables[table] || [];
              const inOp = record.ops.find(op => op.name === 'in' && op.args[0] === 'event_id');
              if (inOp) rows = rows.filter(row => inOp.args[1].includes(row.event_id));
              const eq = record.ops.find(op => op.name === 'eq' && op.args[0] === 'organiser_id');
              if (eq) rows = rows.filter(row => row.organiser_id === eq.args[1]);
              const ilike = record.ops.find(op => op.name === 'ilike');
              if (ilike) rows = rows.filter(row => row.title.toLowerCase() === ilike.args[1].toLowerCase());
              if (record.ops.some(op => op.name === 'textSearch')) rows = rows.filter(row => /cod/i.test(row.title));
              return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
            };
          }
          return (...args) => { record.ops.push({ name, args }); return builder; };
        },
      });
      return builder;
    },
  };
  const moduleStub = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: moduleStub, console: { error() {} },
    require: name => name === '../lib/requireAuth' ? (_req, _res, next) => next()
      : name === '../lib/userSupabase' ? () => client
        : localRequire(name),
  }, { filename });
  async function post(body) {
    const layer = moduleStub.exports.stack.find(l => l.route?.path === '/' && l.route.methods.post);
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
    await layer.route.stack.at(-1).handle({ body, user: { id: ME }, accessToken: 'jwt' }, response);
    return response;
  }
  return { post, calls };
}

const programme = (eventId, title = 'Keynote') => ({ event_id: eventId, title, description: '', starts_at: '2026-09-01T09:00:00Z', ends_at: '2026-09-01T10:00:00Z', position: 0 });

test('a title is required and bad input never reaches the database', async () => {
  const h = harness({ tables: {} });
  for (const body of [undefined, {}, { title: '   ' }, { title: 42 }]) assert.equal((await h.post(body)).statusCode, 400);
  assert.equal(h.calls.length, 0);
});

test('exact community match returns programme only, and tasks are only requested for own events', async () => {
  const h = harness({ tables: {
    events: [event('c1', 'someone-else', 'Coders Assembly')],
    programme_items: [programme('c1', 'Welcome')],
    tasks: [{ event_id: 'c1', title: 'Secret task', description: '', position: 0 }],
  } });
  const res = await h.post({ title: 'coders assembly' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.source, 'exact');
  assert.equal(res.body.programme[0].title, 'Welcome');
  assert.deepEqual(plain(res.body.tasks), []);
  const taskCalls = h.calls.filter(call => call.table === 'tasks' || call.table === 'registrations' || call.table === 'check_ins');
  assert.equal(taskCalls.length, 0); // no own events, so private tables are never queried
});

test('own exact match returns tasks and queries only own event ids', async () => {
  const h = harness({ tables: {
    events: [event('m1', ME, 'Coders Assembly'), event('c1', 'someone-else', 'Coders Assembly')],
    programme_items: [programme('m1', 'My keynote'), programme('c1', 'Their keynote')],
    tasks: [{ event_id: 'm1', title: 'Book venue', description: 'n', position: 0 }, { event_id: 'c1', title: 'Their task', description: '', position: 0 }],
    registrations: [{ event_id: 'm1' }, { event_id: 'm1' }],
    check_ins: [{ event_id: 'm1' }],
  } });
  const res = await h.post({ title: 'Coders Assembly' });
  assert.equal(res.body.source, 'exact');
  assert.deepEqual(plain(res.body.tasks), [{ title: 'Book venue', notes: 'n' }]);
  assert.equal(res.body.programme[0].title, 'My keynote');
  const taskCall = h.calls.find(call => call.table === 'tasks');
  assert.deepEqual(plain(taskCall.ops.find(op => op.name === 'in').args[1]), ['m1']);
});

test('only ended, published or completed events are requested', async () => {
  const h = harness({ tables: { events: [] } });
  await h.post({ title: 'Coders Assembly' });
  const eventCalls = h.calls.filter(call => call.table === 'events');
  assert.equal(eventCalls.length, 3);
  for (const call of eventCalls) {
    assert.deepEqual(plain(call.ops.find(op => op.name === 'in').args), ['status', ['published', 'completed']]);
    assert.equal(call.ops.find(op => op.name === 'lt').args[0], 'ends_at');
  }
});

test('LIKE wildcards in the title are escaped for the exact-title query', async () => {
  const h = harness({ tables: { events: [] } });
  await h.post({ title: '100%_sure\\' });
  const ilike = h.calls.flatMap(call => call.ops).find(op => op.name === 'ilike');
  assert.equal(ilike.args[1], '100\\%\\_sure\\\\');
});

test('database failures return a generic error without leaking details', async () => {
  const res = await harness({ tables: {}, failTable: 'events' }).post({ title: 'Coders Assembly' });
  assert.equal(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.body).includes('secret'));
});
