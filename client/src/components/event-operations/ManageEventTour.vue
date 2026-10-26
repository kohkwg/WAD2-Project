<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { USING_SUPABASE } from '../../utils/api.js'
import { WORKSPACE_TOUR_STEPS, hasSeenTutorial, markTutorialSeen } from '../../utils/workspaceTutorial.js'
import WorkspaceTour from './WorkspaceTour.vue'

const props = defineProps({ ownerId: { type: String, required: true }, eventId: { type: String, required: true }, active: Boolean })
const route = useRoute()
const router = useRouter()
const contextReady = inject('workspaceContextReady', ref(false))
const registerLauncher = inject('registerWorkspaceTutorial', () => () => {})
const open = ref(false)
const index = ref(0)
const busy = ref(false)
const step = computed(() => WORKSPACE_TOUR_STEPS[index.value])
let original = null
let epoch = 0
let unregister = () => {}

function isCurrentEvent() {
  return props.active && route.path.endsWith('/manage')
    && String(route.params.id || route.params.eventId || '') === props.eventId
}
async function showStep(nextIndex) {
  if (!open.value || busy.value || !isCurrentEvent()) return
  const ticket = ++epoch
  busy.value = true
  const next = WORKSPACE_TOUR_STEPS[nextIndex]
  if (!next) { busy.value = false; return }
  try {
    if (route.query.tab !== next.tab || route.hash) {
      await router.replace({ path: route.path, query: { ...route.query, tab: next.tab }, hash: '' })
    }
    await nextTick()
    if (ticket === epoch && open.value && isCurrentEvent()) index.value = nextIndex
  } finally {
    if (ticket === epoch) busy.value = false
  }
}
async function start() {
  if (open.value || !props.ownerId || !contextReady.value || !isCurrentEvent()) return
  original = { path: route.path, query: { ...route.query }, hash: route.hash, top: window.scrollY, left: window.scrollX }
  index.value = 0
  open.value = true
  await showStep(0)
}
async function finish(outcome = 'skipped') {
  if (!open.value) return
  const snapshot = original
  const ticket = ++epoch
  markTutorialSeen(props.ownerId, USING_SUPABASE, outcome)
  open.value = false
  busy.value = false
  original = null
  await nextTick()
  if (!snapshot || !isCurrentEvent() || route.path !== snapshot.path) return
  await router.replace({ path: snapshot.path, query: snapshot.query, hash: snapshot.hash })
  await nextTick()
  if (ticket !== epoch || !isCurrentEvent()) return
  document.querySelector('[data-workspace-tour-replay]')?.focus({ preventScroll: true })
  window.scrollTo({ top: snapshot.top, left: snapshot.left, behavior: 'instant' })
}
function abandon() {
  epoch++
  open.value = false
  busy.value = false
  original = null
}
watch(() => [props.active, props.ownerId, props.eventId, contextReady.value], async () => {
  unregister()
  if (!props.active || !props.ownerId || !contextReady.value) { abandon(); return }
  unregister = registerLauncher(start)
  const ticket = epoch
  await nextTick()
  if (ticket === epoch && isCurrentEvent() && !hasSeenTutorial(props.ownerId, USING_SUPABASE)) start()
}, { immediate: true, flush: 'post' })
onDeactivated(() => { abandon(); unregister() })
onBeforeUnmount(() => { abandon(); unregister() })
</script>

<template>
  <WorkspaceTour v-if="open && active" :step="step" :index="index" :count="WORKSPACE_TOUR_STEPS.length" :busy="busy"
    @previous="showStep(index - 1)" @next="index === WORKSPACE_TOUR_STEPS.length - 1 ? finish('completed') : showStep(index + 1)" @skip="finish('skipped')" />
</template>
