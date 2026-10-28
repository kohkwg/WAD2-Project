import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { compileScript, parse } from 'vue/compiler-sfc'
import checks from '../../server/tests/checks.js'
const { checkEqual, checkDeepEqual, checkTrue } = checks

let caseId = 0
async function setup(fixture) {
  globalThis.__recommendationProfileFixture = fixture
  const fixtureUrl = 'data:text/javascript;base64,' + Buffer.from(`
    export const supabase = globalThis.__recommendationProfileFixture;
    // fixture ${++caseId}
    export const USING_SUPABASE = true;
    export const geocodePostalCode = async () => ({lat: 1.3, lng: 103.8});
    export const INTEREST_OPTIONS = ['music', 'arts', 'sports'];
  `).toString('base64')
  const { descriptor } = parse(await readFile(new URL('../src/views/ProfileView.vue', import.meta.url), 'utf8'))
  let source = compileScript(descriptor, { id: 'profile' }).content
    .replace(/from ['"]vue['"]/g, `from '${import.meta.resolve('vue')}'`)
    .replace(/from ['"]@\/[^'"]+['"]/g, `from '${fixtureUrl}'`)
  const { default: component } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  let state
  await renderToString(createSSRApp({ setup() {
    state = component.setup({}, { expose() {} }); return () => null
  } }))
  await state.loadProfile()
  return state
}

function fixture() {
  const calls = []
  let fail = false
  return {
    calls, setFailure(value) { fail = value },
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table) {
      return { select(columns) { calls.push({ table, columns }); return { eq: () => ({
        maybeSingle: async () => ({ data: {
          id: 'user-1', display_name: 'Explorer', postal_code: '',
          interest_weights: { sports: 5 }, profile_interests: [{ interests: { slug: 'music' } }],
        } }),
      }) } } }
    },
    async rpc(name, payload) {
      calls.push({ name, payload })
      return fail ? { error: { message: 'Please retry' } } : { error: null }
    },
  }
}

test('profile loads explicit selections rather than boosted weights', async () => {
  const db = fixture(); const state = await setup(db)
  checkDeepEqual(state.selected.value, ['music'])
  checkTrue(db.calls[0].columns.includes('profile_interests'))
});

test('profile atomically saves selections and preserves drafts on failure/retry', async () => {
  const db = fixture(); const state = await setup(db)
  state.selected.value = ['music', 'arts']
  db.setFailure(true); await state.save()
  checkEqual(state.error.value, 'Please retry')
  checkDeepEqual(state.selected.value, ['music', 'arts'])
  db.setFailure(false); await state.save()
  checkEqual(state.success.value, 'Profile saved.')
  const call = db.calls.at(-1)
  checkEqual(call.name, 'update_recommendation_profile')
  checkDeepEqual(call.payload.p_interests, ['music', 'arts'])
  checkTrue(!Object.hasOwn(call.payload, 'interest_weights'))
});
