import { computed, readonly, ref } from 'vue'

// Two themes only: light and dark. Someone who has never chosen starts in whichever their device
// uses, and follows it until they pick one (an old saved "system" choice is treated as not chosen).
const KEY = 'bookedz-color-theme'
const choices = ['light', 'dark']
const preference = ref('light')
const chosen = ref(false) // true once the person (or a saved choice) has picked a theme
const systemDark = ref(false)
export const themePreference = readonly(preference)
export const resolvedTheme = computed(() => preference.value)
function applyTheme() {
  const theme = preference.value
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.bsTheme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1c1917' : '#fff8f1')
}
export function setTheme(value) {
  if (!choices.includes(value)) return
  preference.value = value
  chosen.value = true
  try { localStorage.setItem(KEY, value) } catch { /* Storage may be unavailable; the current choice still works. */ }
  applyTheme()
}
export function initTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = media.matches
  const fromSystem = () => (systemDark.value ? 'dark' : 'light')
  try {
    const saved = localStorage.getItem(KEY)
    chosen.value = choices.includes(saved)
    preference.value = chosen.value ? saved : fromSystem()
  } catch { chosen.value = false; preference.value = fromSystem() }
  const onSystemChange = () => {
    systemDark.value = media.matches
    if (!chosen.value) { preference.value = fromSystem(); applyTheme() }
  }
  const onStorage = event => {
    if (event.key !== KEY && event.key !== null) return
    chosen.value = choices.includes(event.newValue)
    preference.value = chosen.value ? event.newValue : fromSystem()
    applyTheme()
  }
  media.addEventListener('change', onSystemChange)
  window.addEventListener('storage', onStorage)
  applyTheme()
  return () => { media.removeEventListener('change', onSystemChange); window.removeEventListener('storage', onStorage) }
}
