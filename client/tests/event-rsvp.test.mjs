import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { compileScript, parse } from 'vue/compiler-sfc'

let signedIn = true
let questions = []
let rpcCalls = []
let rpcResult
const mockClient = {
  auth: { getSession: async () => ({ data: { session: signedIn ? { user: { id: 'user-1' } } : null } }) },
  from(table) {
    const query = new Proxy({}, {
      get(_target, method) {
        if (method === 'then') return resolve => resolve(table === 'event_questions' ? { data: questions } : { data: null })
        return () => query
      },
    })
    return query
  },
  async rpc(name, args) { rpcCalls.push({ name, args }); return rpcResult },
}
globalThis.discoverRsvpTestClient = mockClient
const { descriptor } = parse(await readFile(new URL('../src/components/EventDetailsDialog.vue', import.meta.url), 'utf8'))
const script = compileScript(descriptor, { id: 'rsvp-test' }).content
  .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  .replace("import { supabase } from '@/lib/supabase'", 'const supabase = globalThis.discoverRsvpTestClient')
const { default: Dialog } = await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`)
async function mountDialog() {
  let state
  const emitted = []
  const Component = { ...Dialog, setup(props, context) {
    state = Dialog.setup(props, { ...context, emit: (...args) => emitted.push(args) })
    return () => null
  } }
  await renderToString(createSSRApp(Component, { event: { id: 'event-1', start_time: '2026-10-25T10:00:00Z', spots_left: 5 } }))
  return { state, emitted }
}
function reset() {
  signedIn = true
  questions = []
  rpcCalls = []
  rpcResult = { data: { status: 'confirmed' } }
}

test('RSVP serializes question answers and reports confirmed, approval and waitlist outcomes', async () => {
  for (const status of ['confirmed', 'pending', 'waitlisted']) {
    reset()
    questions = [
      { id: 'yes', prompt: 'Agree?', type: 'yes_no', required: true },
      { id: 'number', prompt: 'Number', type: 'number', required: true },
      { id: 'multi', prompt: 'Options', type: 'multi_choice', options: ['A', 'B'], required: true },
    ]
    rpcResult = { data: { status } }
    const { state, emitted } = await mountDialog()
    await state.loadRegistration()
    state.answers.value = { yes: 'no', number: '0', multi: ['A'] }
    await state.submitRsvp()
    assert.deepEqual(rpcCalls, [{ name: 'register_for_event', args: {
      p_event_id: 'event-1', p_answers: [
        { question_id: 'yes', answer: false }, { question_id: 'number', answer: 0 }, { question_id: 'multi', answer: ['A'] },
      ],
    } }])
    assert.equal(state.registrationStatus.value, status)
    assert.ok(state.success.value)
    assert.deepEqual(emitted, [['registered']])
  }
})

test('required unanswered questions block RSVP submission', async () => {
  reset()
  questions = [{ id: 'multi', prompt: 'Choose a session', type: 'multi_choice', options: ['A', 'B'], required: true }]
  const { state } = await mountDialog()
  await state.loadRegistration()
  await state.submitRsvp()
  assert.equal(state.error.value, 'Please answer: Choose a session')
  assert.equal(rpcCalls.length, 0)
})

test('signed-out users cannot submit an RSVP', async () => {
  reset()
  signedIn = false
  const { state } = await mountDialog()
  await state.loadRegistration()
  await state.submitRsvp()
  assert.equal(state.signedIn.value, false)
  assert.equal(rpcCalls.length, 0)
})

test('failed RSVP preserves the form and permits retry', async () => {
  reset()
  rpcResult = { data: null, error: { message: 'Registration has closed' } }
  const { state, emitted } = await mountDialog()
  await state.loadRegistration()
  await state.submitRsvp()
  assert.equal(state.error.value, 'Registration has closed')
  assert.equal(state.submitting.value, false)
  assert.equal(state.success.value, '')
  assert.deepEqual(emitted, [])
})
