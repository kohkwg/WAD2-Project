// Dismiss presentation only; owning Vue state, drafts and retry callbacks stay intact.
const notices = new WeakMap()
export function focusAfterNotice(element) {
  const controls = [...document.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')]
  const next = element.isConnected && controls.find(node => !element.contains(node) && !node.matches(':disabled') && !node.closest('[inert]') && node.getClientRects().length && (element.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING))
  const fallback = document.querySelector('main')
  ;(next || fallback)?.focus({ preventScroll: true })
}
function signature(element) {
  return `${element.textContent}|${element.getAttribute('role')}|${element.className}`
}
function update(element) {
  const state = notices.get(element)
  if (!state) return
  element.classList.add('dismissible-notice')
  // Vue can replace a text-only node's children when its message changes.
  if (!element.contains(state.button)) element.append(state.button)
  const current = signature(element)
  if (current !== state.signature) {
    element.hidden = false
    state.signature = current
  }
}
export const dismissibleNotice = {
  mounted(element) {
    element.classList.add('dismissible-notice')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'notice-close'
    button.setAttribute('aria-label', 'Dismiss notification')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 20 20')
    svg.setAttribute('width', '16'); svg.setAttribute('height', '16')
    svg.setAttribute('aria-hidden', 'true')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', 'M5 5l10 10M15 5L5 15')
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-linecap', 'round')
    svg.append(path); button.append(svg)
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation()
      const focused = element.contains(document.activeElement)
      element.hidden = true
      if (focused) focusAfterNotice(element)
    })
    element.append(button)
    notices.set(element, { button, signature: signature(element) })
  },
  updated: update,
  beforeUnmount(element) { notices.delete(element) },
}
