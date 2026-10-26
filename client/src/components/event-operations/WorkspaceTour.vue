<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  step: { type: Object, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
  busy: { type: Boolean, default: false }
})

const emit = defineEmits(['previous', 'next', 'skip'])

const dialog = ref(null)
const heading = ref(null)
const card = ref(null)
const spotlightStyle = ref({ display: 'none' })
const spotlightReady = ref(false)
const cardStyle = ref({})
const isLastStep = computed(() => props.index >= props.count - 1)
const stepNumber = computed(() => props.index + 1)
const mobileQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 991.98px)') : null

let frame = 0
let pendingScrollIntoView = false
let observer
let mutations
let disposed = false
let previousGeometry = null
let stableFrames = 0
let observedTarget = null
let mobileDisclosure = null
let originalDisclosureOpen = false
let disclosureTouched = false
let reducedMotionQuery

function isVisible(element) {
  if (!element?.isConnected) return false
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
}

function findTarget() {
  if (!props.step?.target) return null
  try {
    return [...document.querySelectorAll(props.step.target)].find(isVisible) || null
  } catch {
    return null
  }
}

function updateMobileDisclosure() {
  const shouldOpen = Boolean(mobileQuery?.matches && props.step?.revealSections)
  const disclosure = document.querySelector('.workspace-mobile-sections')
  if (disclosure !== mobileDisclosure) {
    mobileDisclosure = disclosure
    if (!disclosureTouched && disclosure) originalDisclosureOpen = disclosure.open
  }
  if (!mobileDisclosure) return
  if (shouldOpen) {
    if (!disclosureTouched) originalDisclosureOpen = mobileDisclosure.open
    disclosureTouched = true
    mobileDisclosure.open = true
  } else if (disclosureTouched) {
    mobileDisclosure.open = originalDisclosureOpen
    disclosureTouched = false
  }
}

function scrollTargetForCard(targetRect, cardRect) {
  const margin = 16
  const mobile = mobileQuery?.matches
  // The shared navbar remains above the event header while scrolling. A hole
  // over a link behind it would reveal the navbar instead of the actual link.
  const navbarBottom = document.querySelector('.app-navbar')?.getBoundingClientRect().bottom || 0
  const visibleTop = Math.max(margin, navbarBottom + margin)
  const visibleBottom = window.innerHeight - (mobile ? cardRect.height + 32 : margin)
  if (targetRect.height > visibleBottom - visibleTop) {
    const delta = targetRect.top - visibleTop
    if (Math.abs(delta) > 1) {
      window.scrollBy({ top: delta, behavior: reducedMotionQuery?.matches ? 'auto' : 'smooth' })
      return true
    }
    return false
  }
  let delta = 0
  if (targetRect.top < visibleTop) delta = targetRect.top - visibleTop
  else if (targetRect.bottom > visibleBottom) delta = targetRect.bottom - visibleBottom
  if (delta) {
    const behavior = reducedMotionQuery?.matches ? 'auto' : 'smooth'
    window.scrollBy({ top: delta, behavior })
    return true
  }
  return false
}

function positionCard(targetRect) {
  const element = card.value
  if (!element) return
  const margin = 16
  const width = Math.min(400, window.innerWidth - margin * 2)
  const height = element.getBoundingClientRect().height
  const mobile = mobileQuery?.matches
  const left = mobile ? Math.max(margin, (window.innerWidth - width) / 2) : window.innerWidth - width - margin

  let top
  if (mobile) {
    top = Math.max(margin, window.innerHeight - height - margin)
  } else {
    const below = targetRect.bottom + 16
    const above = targetRect.top - height - 16
    top = below + height <= window.innerHeight - margin
      ? below
      : above >= margin
        ? above
        : Math.max(margin, Math.min(window.innerHeight - height - margin, targetRect.bottom - height / 2))
  }
  cardStyle.value = { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${Math.max(120, window.innerHeight - margin * 2)}px` }
}

function placeTour() {
  frame = 0
  if (!dialog.value?.open || props.busy) return
  updateMobileDisclosure()
  const target = findTarget()
  if (observedTarget !== target) {
    if (observedTarget) observer?.unobserve(observedTarget)
    observedTarget = target
    if (observedTarget) observer?.observe(observedTarget)
  }
  if (!target) {
    spotlightReady.value = false
    spotlightStyle.value = { display: 'none' }
    cardStyle.value = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
    return
  }
  const rect = target.getBoundingClientRect()
  const pad = 8
  spotlightStyle.value = {
    display: 'block',
    left: `${Math.max(0, rect.left - pad)}px`,
    top: `${Math.max(0, rect.top - pad)}px`,
    width: `${Math.min(window.innerWidth, rect.width + pad * 2)}px`,
    height: `${Math.min(window.innerHeight, rect.height + pad * 2)}px`
  }
  positionCard(rect)
  const cardRect = card.value?.getBoundingClientRect()
  if (pendingScrollIntoView && cardRect) {
    pendingScrollIntoView = false
    if (scrollTargetForCard(rect, cardRect)) {
      previousGeometry = null
      stableFrames = 0
      queueFrame()
      return
    }
  }
  // Keep the aperture closed during scrolling, section changes and late layout
  // updates. Reveal it only after the target and callout have stopped moving.
  const geometry = [rect.left, rect.top, rect.width, rect.height, cardRect?.height || 0, window.scrollY]
  const unchanged = previousGeometry && geometry.every((value, index) => Math.abs(value - previousGeometry[index]) < .25)
  stableFrames = unchanged ? stableFrames + 1 : 0
  previousGeometry = geometry
  if (stableFrames < 3) queueFrame()
  else spotlightReady.value = true
}

function queueFrame() {
  if (disposed) return
  if (!frame) frame = window.requestAnimationFrame(placeTour)
}
function schedulePlacement(scrollIntoView = false) {
  if (disposed) return
  spotlightReady.value = false
  previousGeometry = null
  stableFrames = 0
  pendingScrollIntoView ||= scrollIntoView
  queueFrame()
}

function onResize() {
  schedulePlacement(true)
}

function onScroll() {
  schedulePlacement(false)
}
function onMotionChange() {
  schedulePlacement(false)
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('skip')
    return
  }
  if (event.key !== 'Tab' || !dialog.value) return
  const controls = [...dialog.value.querySelectorAll('button:not(:disabled)')]
  if (!controls.length) return
  const first = controls[0]
  const last = controls.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function openDialog() {
  if (!dialog.value || dialog.value.open) return
  dialog.value.showModal()
  schedulePlacement()
}

watch(() => [props.step?.id, props.busy], async () => {
  spotlightReady.value = false
  previousGeometry = null
  stableFrames = 0
  if (props.busy) return
  await nextTick()
  schedulePlacement(true)
  heading.value?.focus({ preventScroll: true })
})

onMounted(async () => {
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  mobileDisclosure = document.querySelector('.workspace-mobile-sections')
  originalDisclosureOpen = mobileDisclosure?.open ?? false
  disclosureTouched = false
  // Async tool feedback and changing copy can move a target after the step
  // opens. Recheck its clear space on layout changes, never on each scroll.
  observer = new ResizeObserver(() => schedulePlacement(true))
  observer.observe(document.documentElement)
  if (card.value) observer.observe(card.value)
  const navbar = document.querySelector('.app-navbar')
  if (navbar) observer.observe(navbar)
  // A forecast can move the existing venue card to another grid column without
  // changing that card's size. ResizeObserver alone cannot detect that move.
  mutations = new MutationObserver(records => {
    if (records.some(record => !dialog.value?.contains(record.target))) schedulePlacement(true)
  })
  const content = document.querySelector('.workspace-main')
  if (content) mutations.observe(content, { childList: true, subtree: true })
  window.addEventListener('resize', onResize, { passive: true })
  window.visualViewport?.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
  mobileQuery?.addEventListener?.('change', onResize)
  reducedMotionQuery.addEventListener?.('change', onMotionChange)
  dialog.value?.addEventListener('keydown', onKeydown)
  await nextTick()
  openDialog()
  heading.value?.focus({ preventScroll: true })
  schedulePlacement(true)
})

onBeforeUnmount(() => {
  disposed = true
  if (frame) window.cancelAnimationFrame(frame)
  observer?.disconnect()
  mutations?.disconnect()
  window.removeEventListener('resize', onResize)
  window.visualViewport?.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onScroll, true)
  mobileQuery?.removeEventListener?.('change', onResize)
  reducedMotionQuery?.removeEventListener?.('change', onMotionChange)
  dialog.value?.removeEventListener('keydown', onKeydown)
  if (disclosureTouched && mobileDisclosure?.isConnected) mobileDisclosure.open = originalDisclosureOpen
  if (dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <dialog ref="dialog" class="workspace-tour" aria-label="Manage event tutorial" @cancel.prevent="emit('skip')">
    <div v-if="!spotlightReady || busy" class="tour-curtain" aria-hidden="true"></div>
    <div class="tour-spotlight" :style="[spotlightStyle, { visibility: spotlightReady && !busy ? 'visible' : 'hidden' }]" aria-hidden="true">
      <div v-if="spotlightReady && !busy" class="tour-aperture"></div>
    </div>
    <section ref="card" class="tour-card" :style="cardStyle" aria-labelledby="tour-heading" aria-describedby="tour-body">
        <div :key="step.id" class="tour-copy" aria-live="polite">
          <p class="tour-progress">Step {{ stepNumber }} of {{ count }}</p>
          <h2 id="tour-heading" ref="heading" tabindex="-1">{{ step.title }}</h2>
          <p id="tour-body" class="tour-body">{{ step.body }}</p>
        </div>
      <div class="tour-actions">
        <button type="button" class="tour-skip" @click="emit('skip')">Skip</button>
        <div class="tour-navigation">
          <button type="button" class="tour-previous" :disabled="index === 0 || busy || !spotlightReady" @click="emit('previous')">Previous</button>
          <button type="button" class="tour-next" :disabled="busy || !spotlightReady" @click="emit('next')">{{ isLastStep ? 'Finish' : 'Next' }}</button>
        </div>
      </div>
    </section>
  </dialog>
  <Teleport to="body">
    <div class="tour-scroll-space" aria-hidden="true"></div>
  </Teleport>
</template>

<style scoped>
.workspace-tour {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  overflow: visible;
  border: 0;
  background: transparent;
  color: inherit;
}

.workspace-tour::backdrop { background: transparent; }
.tour-scroll-space { display: none; }
.tour-curtain { position: fixed; inset: 0; z-index: 0; background: rgb(14 20 28 / 70%); pointer-events: none; }
.tour-spotlight { position: fixed; z-index: 0; border-radius: .85rem; box-shadow: 0 0 0 100vmax rgb(14 20 28 / 70%); pointer-events: none; }
.tour-aperture { position: absolute; inset: 0; border-radius: inherit; background: rgb(14 20 28 / 70%); animation: tour-reveal .18s ease-out both; }
.tour-card { position: fixed; z-index: 1; box-sizing: border-box; display: flex; flex-direction: column; gap: .7rem; padding: 1.2rem; overflow-y: auto; border: 1px solid rgb(255 255 255 / 20%); border-radius: 1rem; background: var(--bookedz-surface, #fff); color: var(--bookedz-ink, #20242a); box-shadow: 0 1rem 3rem rgb(0 0 0 / 28%); opacity: 1; transform: translateY(0); animation: tour-enter .18s ease-out both; }
.tour-progress { margin: 0; color: var(--bookedz-primary-dark, #824d25); font-size: .75rem; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }
.tour-card h2 { margin: 0; font-size: 1.2rem; font-weight: 750; line-height: 1.25; }
.tour-body { margin: 0; color: var(--bookedz-muted, #62676e); font-size: .94rem; line-height: 1.55; }
.tour-actions { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-top: .3rem; }
.tour-navigation { display: flex; gap: .5rem; }
.tour-card button { min-height: 44px; padding: .55rem .85rem; border: 1px solid var(--bookedz-control-border, #c9cdd1); border-radius: .65rem; background: transparent; color: inherit; font: inherit; font-size: .88rem; font-weight: 700; cursor: pointer; }
.tour-card .tour-next { border-color: var(--bookedz-primary-dark, #824d25); background: var(--bookedz-primary-dark, #824d25); color: var(--bookedz-on-action, #fff); }
.tour-card .tour-skip { border-color: transparent; color: var(--bookedz-muted, #62676e); }
.tour-card button:disabled { opacity: .5; cursor: not-allowed; }
.tour-card button:focus-visible, .tour-card h2:focus-visible { outline: 3px solid var(--bookedz-primary, #df984e); outline-offset: 3px; }

@keyframes tour-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes tour-reveal { from { opacity: 1; } to { opacity: 0; } }
.tour-copy { animation: tour-enter .18s ease-out; }

@media (max-width: 991.98px) {
  .tour-card { padding: 1rem; }
  /* Allow the last tool on a short page to move above the fixed callout. */
  .tour-scroll-space { display: block; height: 100vh; pointer-events: none; }
}

@media (prefers-reduced-motion: reduce) {
  .tour-aperture { animation: none; background: transparent; }
  .tour-card, .tour-copy { animation: none; }
}
</style>
