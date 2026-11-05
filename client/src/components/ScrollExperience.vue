<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

// Lenis (MIT): https://github.com/darkroomengineering/lenis.
// Fine-pointer scrolling only; the map, forms and canvas keep native input.
const router = useRouter()
let dispose = () => {}
onMounted(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const desktop = matchMedia('(hover: hover) and (pointer: fine)')
  let lenis
  const modalOpen = () => Boolean(document.querySelector('dialog[open],.modal.show,.offcanvas.show'))
  function syncModal() {
    if (!lenis) return
    if (modalOpen()) lenis.stop()
    else if (lenis.isStopped) lenis.start()
  }
  function configure() {
    lenis?.destroy()
    lenis = null
    if (reduced.matches || !desktop.matches) return
    lenis = new Lenis({ autoRaf: true, lerp: .14, syncTouch: false, anchors: false, allowNestedScroll: true, stopInertiaOnNavigate: true,
      prevent: node => node.matches?.('[data-lenis-prevent],dialog,.modal,.offcanvas,.leaflet-container,.konvajs-content,canvas,textarea,input,select,[contenteditable]'),
    })
    syncModal()
  }
  configure()
  reduced.addEventListener('change', configure)
  desktop.addEventListener('change', configure)
  const stopGuard = router.beforeEach(() => {
    // Async rows can increase page height before Lenis' debounced resize runs.
    // Refresh its limits before cancelling momentum, so a valid native scroll
    // offset is not clamped to zero before Router records browser history.
    lenis?.resize()
    lenis?.scrollTo(window.scrollY, { immediate: true, force: true })
  })
  const observer = new MutationObserver(syncModal)
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open','class'] })
  dispose = () => {
    lenis?.destroy()
    stopGuard()
    observer.disconnect()
    reduced.removeEventListener('change', configure)
    desktop.removeEventListener('change', configure)
  }
})
onBeforeUnmount(() => dispose())
</script>
<template></template>
