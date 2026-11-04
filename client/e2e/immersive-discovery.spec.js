import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route('**/onemap.gov.sg/maps/tiles/**', route => route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=','base64')}))
  await page.route('**/api/common/elastic/search**', route => route.fulfill({json:{results:[]}}))
})

test('Discover uses the committed street-map workspace', async ({ page }, testInfo) => {
  const errors=[]
  page.on('pageerror', error=>errors.push(error.message))
  await page.setViewportSize({width:1440,height:1000})
  // The landing page no longer has the island map (DESIGN.md, Landing); start from Discover
  await page.goto('/discover')
  await expect(page.locator('.discovery-event-row').first()).toBeVisible()
  const map=page.getByRole('region',{name:'Explore events on the Singapore map',exact:true})
  await expect(map).toBeVisible()
  await expect(map.locator('[data-marker]').first()).toBeVisible()
  await map.locator('[data-marker]').first().click()
  await expect(map.getByRole('region',{name:'Selected map events'})).toBeVisible()
  await page.getByRole('searchbox',{name:'Search by title, description or venue'}).fill('no-such-event-XYZ')
  await expect(page.getByRole('heading',{name:'No events found',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Clear search and filters',exact:true}).click()
  await expect(page.locator('.discovery-event-row').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('landing reflows on mobile and Create event and the Community planner both open', async ({ page }, testInfo) => {
  await page.setViewportSize({width:375,height:900})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.goto('/')
  await expect(page.getByRole('heading',{level:1,name:'Alex'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:testInfo.outputPath('landing-account-mobile.png')})
  // Create event makes official events only; hangouts are planned from Community (DESIGN.md, Community)
  await page.goto('/organiser/events/new')
  await expect(page.getByLabel('Event title',{exact:true})).toBeVisible()
  await page.goto('/organiser/events/new?template=hangout')
  await expect(page).toHaveURL(/\/community\/plan$/)
  await expect(page.locator('main input').first()).toBeVisible()
})
