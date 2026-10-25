import { ref, watchEffect } from 'vue'

// Light / dark mode for the whole site.
// Bootstrap 5.3 recolours every component when <html> has data-bs-theme="dark",
// so all we do is set that one attribute (and remember the choice).

// Saved choice from last visit, or (first visit) follow the computer's own setting
const saved = localStorage.getItem('theme')
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

export const theme = ref(saved || (systemPrefersDark ? 'dark' : 'light'))

// Runs once now, then again every time `theme` changes
watchEffect(() => {
  document.documentElement.setAttribute('data-bs-theme', theme.value)
  localStorage.setItem('theme', theme.value)
})

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}
