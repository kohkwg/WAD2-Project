import { test, expect } from '@playwright/test'

// Laptops and desktops: the sidebar collapses to an icon rail and remembers the choice (DESIGN.md, Navigation)
test('sidebar collapses to icons, shows tooltips and remembers the choice', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 })
  await page.goto('/discover')
  await page.evaluate(() => localStorage.removeItem('bookedz-sidebar'))
  await page.reload()
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  const sidebar = page.locator('.app-sidebar')
  await expect(sidebar).toHaveCSS('width', '240px')
  await nav.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect(sidebar).toHaveCSS('width', '76px')
  // Links keep their names for screen readers; the label shows as a tooltip
  const community = nav.getByRole('link', { name: 'Community' })
  await community.hover()
  await expect(community).toHaveAttribute('data-label', 'Community')
  await page.reload()
  await expect(nav.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false')
  await expect(sidebar).toHaveCSS('width', '76px')
  await nav.getByRole('button', { name: 'Expand sidebar' }).click()
  await expect(sidebar).toHaveCSS('width', '240px')
})

test('collapse toggle sits on the divider at the sidebar edge and labels itself on hover', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/discover')
  await page.evaluate(() => localStorage.removeItem('bookedz-sidebar'))
  await page.reload()
  const toggle = page.locator('.sidebar-collapse')
  const centred = () => page.evaluate(() => {
    const button = document.querySelector('.sidebar-collapse').getBoundingClientRect()
    const line = document.querySelector('.sidebar-divider').getBoundingClientRect().top
    const edge = document.querySelector('.app-sidebar').getBoundingClientRect().right
    return Math.abs(button.top + button.height / 2 - line) <= 1.5 && Math.abs(button.left + button.width / 2 - edge) <= 1.5
  })
  const tooltip = () => toggle.evaluate(el => [getComputedStyle(el, '::after').content.split(' / ')[0], getComputedStyle(el, '::after').opacity])
  await expect.poll(centred).toBe(true)
  await toggle.hover()
  await expect.poll(tooltip).toEqual(['"Collapse"', '1'])
  await page.screenshot({ path: testInfo.outputPath('collapse-toggle-expanded.png'), clip: { x: 0, y: 0, width: 420, height: 400 } })
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect.poll(centred).toBe(true)
  // Tooltip text is visual only: names are not doubled by it
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Community', exact: true })).toBeVisible()
  await toggle.hover() // the toggle moved with the edge
  await expect.poll(tooltip).toEqual(['"Expand"', '1'])
  await page.mouse.move(900, 600)
  await page.getByRole('button', { name: 'Expand sidebar' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.app-sidebar')).toHaveCSS('width', '240px')
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeFocused()
  // A short window scrolls the sidebar; the toggle stays on the line
  await page.setViewportSize({ width: 1280, height: 300 })
  await page.locator('.app-sidebar').evaluate(el => { el.scrollTop = 40 })
  await expect.poll(centred).toBe(true)
})
