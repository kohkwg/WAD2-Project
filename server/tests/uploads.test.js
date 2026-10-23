const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const filename = path.join(__dirname, '../routes/uploads.js');
const localRequire = createRequire(filename);
const eventId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const floorPlanId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const assetId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const valid = { filename: 'photo.png', contentType: 'image/png', size: 1234, eventId, floorPlanId };

function harness({ env = {}, owner = true, published = true, plan = true, asset = true, queryError = false, signingError = false } = {}) {
  const signed = []; const queries = [];
  const client = {
    async rpc(name, args) { queries.push({ name, args }); return { data: owner, error: queryError ? {} : null }; },
    from(table) {
      const filters = [];
      const query = {
        select() { return query; }, eq(...args) { filters.push(args); return query; },
        async maybeSingle() {
          queries.push({ table, filters });
          const data = table === 'events' ? (published ? { id: eventId, status: 'published' } : null)
            : table === 'floor_plans' ? (plan ? { id: floorPlanId } : null)
              : asset ? { r2_key: `floorplans/${eventId}/${floorPlanId}/image.png`, event_id: eventId } : null;
          return { data, error: queryError ? {} : null };
        },
      }; return query;
    },
  };
  const moduleStub = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: moduleStub, process: { env: { R2_PUBLIC_URL: 'https://images.example.test/', R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bucket', ...env } },
    require: name => name === '../lib/requireAuth' ? (_req, _res, next) => next()
      : name === '../lib/userSupabase' ? () => client
        : name === '@aws-sdk/client-s3' ? { S3Client: class {}, PutObjectCommand: class { constructor(input) { this.input = input; } } }
          : name === '@aws-sdk/s3-request-presigner' ? { getSignedUrl: async (_r2, command) => { if (signingError) throw new Error('secret'); signed.push(command.input); return 'https://upload.example.test'; } }
            : localRequire(name),
  }, { filename });
  async function run(route, body = valid, method = 'post') {
    const layer = moduleStub.exports.stack.find(layer => layer.route?.path === route && layer.route.methods[method]);
    assert.ok(layer, `${method} ${route} exists`);
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await layer.route.stack.at(-1).handle({ body, user: { id: 'owner' }, accessToken: 'jwt', params: { assetId } }, response);
    return response;
  }
  return { run, signed, queries };
}

test('cover signing rejects malformed file values before using R2', async () => {
  for (const value of [{ filename: 42 }, { filename: '' }, { contentType: 'image/svg+xml' }, { size: 0 }, { size: 10 * 1024 * 1024 + 1 }]) {
    const h = harness(); const res = await h.run('/cover', { ...valid, ...value });
    assert.equal(res.statusCode, 400); assert.equal(h.signed.length, 0);
  }
});
test('cover signing requires valid public configuration and hides signing errors', async () => {
  for (const options of [{ env: { R2_PUBLIC_URL: '' } }, { env: { R2_PUBLIC_URL: 'javascript:bad' } }, { env: { R2_PUBLIC_URL: 'https://user:pass@example.test' } }, { signingError: true }]) {
    const h = harness(options); const res = await h.run('/cover');
    assert.equal(res.statusCode, 503); assert.ok(!JSON.stringify(res.body).includes('secret'));
  }
});
test('cover preserves URL response and owner prefix with collision-resistant keys', async () => {
  const h = harness(); const a = await h.run('/cover'); const b = await h.run('/cover');
  assert.equal(a.statusCode, 200); assert.equal(a.body.uploadUrl, 'https://upload.example.test');
  assert.match(a.body.publicUrl, /^https:\/\/images.example.test\/covers\/owner\//);
  assert.notEqual(a.body.publicUrl, b.body.publicUrl); assert.equal(h.signed[0].ContentLength, 1234);
  assert.equal((await h.run('/cover', { filename: 'legacy.png', contentType: 'image/png' })).statusCode, 200);
});
test('floor-plan signing checks organiser, publication and matching plan before signing', async () => {
  for (const options of [{ owner: false }, { published: false }, { plan: false }, { queryError: true }]) {
    const h = harness(options); const res = await h.run('/floor-plan');
    assert.ok([403, 404, 503].includes(res.statusCode)); assert.equal(h.signed.length, 0);
  }
  const h = harness(); const res = await h.run('/floor-plan');
  assert.equal(res.statusCode, 200); assert.match(res.body.key, new RegExp(`^floorplans/${eventId}/${floorPlanId}/`));
  assert.equal(h.queries[0].name, 'is_event_organiser');
  assert.ok(h.queries.find(q => q.table === 'floor_plans').filters.some(([key, value]) => key === 'event_id' && value === eventId));
});
test('floor-plan signing requires IDs and bounded size', async () => {
  for (const body of [{ ...valid, size: undefined }, { ...valid, eventId: 'bad' }, { ...valid, floorPlanId: null }]) {
    assert.equal((await harness().run('/floor-plan', body)).statusCode, 400);
  }
});
test('public asset URL only resolves an existing public finished asset of a published event', async () => {
  for (const options of [{ asset: false }, { published: false }]) assert.equal((await harness(options).run('/floor-plan/:assetId', {}, 'get')).statusCode, 404);
  const h = harness(); const res = await h.run('/floor-plan/:assetId', {}, 'get');
  assert.equal(res.statusCode, 200); assert.match(res.body.publicUrl, /^https:\/\/images.example.test\/floorplans\//);
  const filters = h.queries.find(q => q.table === 'floor_plan_assets').filters;
  assert.ok(filters.some(([key,value]) => key === 'kind' && value === 'finished'));
  assert.ok(filters.some(([key,value]) => key === 'is_public' && value === true));
});

test('anonymous Supabase client omits Authorization override; signed-in client supplies JWT', () => {
  const helper = path.join(__dirname, '../lib/userSupabase.js');
  const captured = [];
  const stub = { exports: {} };
  vm.runInNewContext(fs.readFileSync(helper, 'utf8'), {
    module: stub, process: { env: { SUPABASE_URL: 'https://project.example.test', SUPABASE_PUBLISHABLE_KEY: 'publishable' } },
    require: () => ({ createClient: (...args) => { captured.push(args); return {}; } }),
  }, { filename: helper });
  stub.exports(); stub.exports('jwt');
  assert.equal(captured[0][2].global, undefined);
  assert.equal(captured[1][2].global.headers.Authorization, 'Bearer jwt');
});
