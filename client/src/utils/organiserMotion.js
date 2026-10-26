import '../assets/organiser-motion.css'

// Presentation only: never delay rendering, navigation, focus or saved state.
// One directive owns each organiser page, including asynchronously loaded tools.
const controllers = new WeakMap()
const items = '[data-organiser-enter]'

export const vOrganiserMotion = {
  mounted(root) {
    root.classList.add('organiser-motion')
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const running = new Map()
    const queued = new Set()
    let frame
    let scenePending = false
    const scene = () => root.querySelector('[data-organiser-scene]') || root
    const cancel = () => {
      cancelAnimationFrame(frame)
      queued.clear()
      scenePending = false
      running.forEach(animation => animation.cancel())
      running.clear()
    }
    function enter(element, delay = 0) {
      if (reduced.matches || document.hidden || !element.isConnected || !element.getClientRects().length
        || element.contains(document.activeElement) || typeof element.animate !== 'function') return
      running.get(element)?.cancel()
      const animation = element.animate([
        { opacity: .65, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 240, delay, easing: 'cubic-bezier(.2,.7,.2,1)' })
      running.set(element, animation)
      animation.finished.catch(() => {}).finally(() => {
        if (running.get(element) === animation) running.delete(element)
      })
    }
    function schedule() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (scenePending) {
          scenePending = false
          queued.clear()
          enter(scene())
          return
        }
        // Bound the stagger even for very large lists. Offscreen rows stay still.
        const visible = [...queued].filter(element => {
          const rect = element.getBoundingClientRect()
          return rect.bottom > 0 && rect.top < innerHeight
        })
        queued.clear()
        visible.filter(element => !visible.some(parent => parent !== element && parent.contains(element)))
          .slice(0, 8).forEach((element, index) => enter(element, Math.min(index * 20, 80)))
      })
    }
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue
          if (record.target === scene() && scene() !== root) scenePending = true
          if (node.matches(items)) queued.add(node)
          node.querySelectorAll(items).forEach(element => queued.add(element))
        }
      }
      if (scenePending || queued.size) schedule()
    })
    observer.observe(root, { childList: true, subtree: true })
    const focus = event => {
      running.forEach((animation, element) => {
        if (element.contains(event.target)) animation.cancel()
      })
    }
    const toggle = event => {
      if (event.target instanceof HTMLDetailsElement && event.target.open) {
        for (const child of event.target.children) if (child.tagName !== 'SUMMARY') enter(child)
      }
    }
    root.addEventListener('focusin', focus)
    root.addEventListener('toggle', toggle, true)
    reduced.addEventListener('change', cancel)
    document.addEventListener('visibilitychange', cancel)
    enter(scene())
    root.querySelectorAll(items).forEach(element => queued.add(element))
    if (scene() === root) schedule()
    else queued.clear()
    controllers.set(root, {
      change() {
        cancel()
        scenePending = true
        schedule()
      },
      dispose() {
        cancel()
        observer.disconnect()
        root.removeEventListener('focusin', focus)
        root.removeEventListener('toggle', toggle, true)
        reduced.removeEventListener('change', cancel)
        document.removeEventListener('visibilitychange', cancel)
      },
    })
  },
  updated(root, binding) {
    if (binding.value !== binding.oldValue) controllers.get(root)?.change()
  },
  beforeUnmount(root) {
    controllers.get(root)?.dispose()
    controllers.delete(root)
  },
}
