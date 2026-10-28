import { computed, readonly, ref } from 'vue'

const KEY = 'bookedz-color-theme'
const choices = ['system', 'light', 'dark']
const preference = ref('system')
const systemDark = ref(false)
export const themePreference = readonly(preference)
export const resolvedTheme = computed(() => preference.value === 'system' ? (systemDark.value ? 'dark' : 'light') : preference.value)
function applyTheme() {
  const theme = resolvedTheme.value
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.bsTheme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141b22' : '#fff8ec')
}
export function setTheme(value) {
  if (!choices.includes(value)) return
  preference.value = value
  try { localStorage.setItem(KEY, value) } catch { /* Storage may be unavailable; the current choice still works. */ }
  applyTheme()
}
export function initTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = media.matches
  try {
    const saved = localStorage.getItem(KEY)
    preference.value = choices.includes(saved) ? saved : 'system'
  } catch { preference.value = 'system' }
  const onSystemChange = () => { systemDark.value = media.matches; applyTheme() }
  const onStorage = event => {
    if (event.key !== KEY && event.key !== null) return
    preference.value = choices.includes(event.newValue) ? event.newValue : 'system'
    applyTheme()
  }
  media.addEventListener('change', onSystemChange)
  window.addEventListener('storage', onStorage)
  applyTheme()
  return () => { media.removeEventListener('change', onSystemChange); window.removeEventListener('storage', onStorage) }
}
