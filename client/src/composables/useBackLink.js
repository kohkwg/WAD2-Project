import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// Where a "Back" link should go: the page the user came from (dashboard, plans, Discover...),
// or the page's usual parent when they arrived directly (a shared link, a refresh)
export function useBackLink(fallback) {
  const route = useRoute()
  const router = useRouter()
  return computed(() => {
    route.fullPath
    const from = router.options.history.state?.back
    const usable = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.startsWith(route.path)
    return usable ? from : fallback
  })
}
