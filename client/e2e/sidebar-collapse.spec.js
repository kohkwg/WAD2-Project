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
