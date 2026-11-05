// Authenticated, read-only planner request. Retry once with a refreshed session on 401.
const SIGN_IN = 'Your session could not be verified. Please sign in again, then retry.'

export async function requestPlanSuggestion({ client, baseUrl, input, signal, fetchImpl = fetch }) {
  const checkAbort = () => { if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError') }
  checkAbort()
  const sessionResult = await client.auth.getSession()
  if (sessionResult.error || !sessionResult.data?.session?.access_token) throw new Error('Sign in to generate a plan.')
  const send = token => {
    checkAbort()
    return fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/plan-suggestions`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    })
  }
  let response = await send(sessionResult.data.session.access_token)
  if (response.status === 401) {
    checkAbort()
    const refreshed = await client.auth.refreshSession()
    checkAbort()
    if (refreshed.error || !refreshed.data?.session?.access_token) throw new Error(SIGN_IN)
    response = await send(refreshed.data.session.access_token)
  }
  const body = await response.json().catch(() => null)
  checkAbort()
  if (response.status === 401) throw new Error(SIGN_IN)
  if (!response.ok) throw new Error(body?.error || 'Could not generate a plan. Please try again.')
  return body
}
