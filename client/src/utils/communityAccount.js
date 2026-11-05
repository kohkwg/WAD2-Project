import { getCurrentUser } from './api.js'

// Keep the intended page (including an invite/query/hash), without performing an action after login.
export async function requireCommunityAccount(router, destination) {
  if (await getCurrentUser().catch(() => null)) return true
  await router.push({ path: '/', query: { redirect: destination }, hash: '#join-dino' })
  return false
}
