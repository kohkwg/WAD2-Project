import test from 'node:test'
import assert from 'node:assert/strict'
import { requestPlanSuggestion } from '../planSuggestionRequest.js'
const session = token => ({ data: { session: token ? { access_token: token } : null }, error: null })
function fixture(statuses, { refresh = session('fresh'), initial = session('old') } = {}) {
  const calls = []; let refreshes = 0
  const client = { auth: { getSession: async () => initial, refreshSession: async () => { refreshes++; return refresh } } }
  return {
    calls, refreshes: () => refreshes,
    run: signal => requestPlanSuggestion({ client, baseUrl: 'http://test.invalid/', input: { title: 'Workshop' }, signal,
      fetchImpl: async (url, init) => { calls.push({url,...init}); const status = statuses.shift(); return new Response(JSON.stringify(status === 200 ? { tasks: [] } : { error: status === 401 ? 'Invalid token' : 'Not allowed' }),{status}) },
    }),
  }
}
test('successful suggestion uses the current session without refresh',async()=>{
 const f=fixture([200]);assert.deepEqual(await f.run(),{tasks:[]});assert.equal(f.refreshes(),0);assert.equal(f.calls[0].headers.Authorization,'Bearer old');assert.equal(f.calls[0].url,'http://test.invalid/api/plan-suggestions')
})
test('401 refreshes once and retries the same input with the new token',async()=>{
 const f=fixture([401,200]);await f.run();assert.equal(f.refreshes(),1);assert.equal(f.calls.length,2);assert.equal(f.calls[1].headers.Authorization,'Bearer fresh');assert.equal(f.calls[0].body,f.calls[1].body)
})
test('missing session makes no planner request',async()=>{
 const f=fixture([],{initial:session(null)});await assert.rejects(f.run(),/Sign in/);assert.equal(f.calls.length,0)
})
test('refresh failure gives an actionable sign-in error without repeating the request',async()=>{
 const f=fixture([401],{refresh:{error:new Error('expired'),data:{session:null}}});await assert.rejects(f.run(),/sign in again/);assert.equal(f.calls.length,1)
})
test('repeated 401 stops after one retry',async()=>{
 const f=fixture([401,401]);await assert.rejects(f.run(),/sign in again/);assert.equal(f.calls.length,2);assert.equal(f.refreshes(),1)
})
test('permission failures are not retried as token expiry',async()=>{
 const f=fixture([403]);await assert.rejects(f.run(),/Not allowed/);assert.equal(f.refreshes(),0);assert.equal(f.calls.length,1)
})
test('cancelled requests do not send a request or refresh a session',async()=>{
 const f=fixture([]);const controller=new AbortController();controller.abort();await assert.rejects(f.run(controller.signal),{name:'AbortError'});assert.equal(f.calls.length,0);assert.equal(f.refreshes(),0)
})
