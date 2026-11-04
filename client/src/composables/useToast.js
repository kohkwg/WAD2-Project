import { reactive, readonly } from 'vue'

// Small confirmation messages ("Saved", "Posted") shown briefly at the bottom of the screen.
// One shared list so any page can announce a result without its own alert box.
const state = reactive({ items: [] })
let nextId = 1

export function toast(message, { tone = 'success', duration = 3200 } = {}) {
  const id = nextId++
  state.items.push({ id, message, tone })
  setTimeout(() => dismissToast(id), duration)
  return id
}

export function dismissToast(id) {
  const index = state.items.findIndex(item => item.id === id)
  if (index !== -1) state.items.splice(index, 1)
}

export const toasts = readonly(state)
