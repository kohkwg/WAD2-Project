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
          id: 'user-1', display_name: 'Explorer', username: 'explorer', postal_code: '',
          interest_weights: { sports: 5 }, profile_interests: [{ interests: { slug: 'music' } }],
        } }),
      }) } } }
    },
    async rpc(name, payload) {
      calls.push({ name, payload })
      return fail ? { error: typeof fail === 'object' ? fail : { message: 'Please retry' } } : { error: null }
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
  checkEqual(call.name, 'update_profile_with_username')
  checkEqual(call.payload.p_username, 'explorer')
  checkDeepEqual(call.payload.p_interests, ['music', 'arts'])
  checkTrue(!Object.hasOwn(call.payload, 'interest_weights'))
});

test('username loads, normalises and validates before writing', async () => {
  const db = fixture(); const state = await setup(db)
  checkEqual(state.username.value, 'explorer')
  state.username.value = 'bad name'
  await state.save()
  checkTrue(Boolean(state.usernameError.value))
  checkEqual(db.calls.filter(call => call.name).length, 0)
  state.username.value = '  My_Name  '
  await state.save()
  checkEqual(db.calls.at(-1).payload.p_username, 'my_name')
  checkEqual(state.username.value, 'my_name')
})

test('duplicate username keeps drafts and allows retry; blank username stays optional', async () => {
  const db = fixture(); const state = await setup(db)
  state.username.value = 'taken'
  state.displayName.value = 'My edited name'
  db.setFailure({ code: '23505', message: 'duplicate key' })
  await state.save()
  checkEqual(state.usernameError.value, 'That username is already taken. Choose another.')
  checkEqual(state.username.value, 'taken')
  checkEqual(state.displayName.value, 'My edited name')
  state.username.value = ''
  db.setFailure(false)
  await state.save()
  checkEqual(db.calls.at(-1).payload.p_username, null)
  checkEqual(state.success.value, 'Profile saved.')
})


test('missing username column keeps existing profile available and uses existing save RPC', async () => {
  const db = fixture()
  const originalFrom = db.from
  db.from = table => ({ select(columns) {
    if (columns.includes('username')) return { eq: () => ({ maybeSingle: async () => ({
      error: { code: '42703', message: 'column profiles.username does not exist' },
    }) }) }
    return originalFrom(table).select(columns)
  } })
  const state = await setup(db)
  checkEqual(state.usernameAvailable.value, false)
  checkEqual(state.userId.value, 'user-1')
  checkEqual(state.displayName.value, 'Explorer')
  checkDeepEqual(state.selected.value, ['music'])
  checkEqual(state.error.value, '')
  state.displayName.value = 'Edited name'
  await state.save()
  checkEqual(db.calls.at(-1).name, 'update_recommendation_profile')
  checkTrue(!Object.hasOwn(db.calls.at(-1).payload, 'p_username'))
  checkEqual(state.success.value, 'Profile saved.')
})

test('unrelated load failures remain errors rather than being treated as absent username', async () => {
  const db = fixture()
  let reads = 0
  db.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
    reads++
    return { error: { code: '42501', message: 'Permission denied' } }
  } }) }) })
  const state = await setup(db)
  checkEqual(reads, 1)
  checkEqual(state.userId.value, null)
  checkEqual(state.error.value, 'Permission denied')
})
