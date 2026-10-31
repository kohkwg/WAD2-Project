import { test, expect } from '@playwright/test'

test('filtered and map discovery retain compact matching picks and explicitly labelled other picks', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await fixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/discover')
  const picks = page.getByRole('region', { name: 'Picked for you' })
  const search = page.getByLabel('Search by title, description or venue')
  await expect(picks.locator('.recommendation-card')).toHaveCount(2)
  await page.getByRole('button', { name: 'Filters', exact: false }).click()
  await page.getByRole('group', { name: 'Category', exact: true }).getByRole('button', { name: 'Arts', exact: true }).click()
  await expect(picks).toHaveClass(/picked-for-you--compact/)
  await expect(picks.getByText('Picks matching your current filters.')).toBeVisible()
  await expect(picks.locator('.recommendation-card')).toHaveCount(1)
  await expect(picks.getByText('50% match', { exact: true })).toBeVisible()
  await picks.getByText('Why this?', { exact: true }).click()
  await expect(picks.getByText(/not your chance of attending/)).toBeVisible()
  for (const scheme of ['light', 'dark']) {
    await page.getByLabel('Color theme').selectOption(scheme)
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(picks.getByRole('button', { name: 'Save Pottery afternoon', exact: true })).toBeVisible()
      if (width === 1280) expect((await picks.locator('.recommendation-card').boundingBox()).height).toBeLessThan(360)
      if (width === 375) await picks.screenshot({ path: testInfo.outputPath(`compact-picks-${scheme}.png`) })
    }
  }
  await picks.getByRole('button', { name: 'Save Pottery afternoon', exact: true }).click()
  await expect(picks.getByText('60% match', { exact: true })).toBeVisible()
  await picks.getByRole('button', { name: 'Not interested in Pottery afternoon' }).click()
  await expect(picks.getByText(/No picks match your current filters/)).toBeVisible()
  await picks.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(picks.getByText('60% match', { exact: true })).toBeVisible()
  await search.fill('No such workshop')
  await expect(picks.getByText(/No picks match your current filters/)).toBeVisible()
  await expect(picks.locator('.recommendation-card')).toHaveCount(0)
  await picks.getByRole('button', { name: 'View all picks', exact: true }).click()
  await expect(picks.getByText(/Your other picks/)).toBeVisible()
  await expect(picks.locator('.recommendation-card')).toHaveCount(2)
  await expect(search).toHaveValue('No such workshop')
  await expect(page.getByRole('button', { name: 'Remove Arts filter' })).toBeVisible()
  await expect(picks.getByRole('link', { name: 'Pottery afternoon', exact: true })).toHaveAttribute('href', '/events/pottery/rsvp')
  await page.getByRole('group', { name: 'Discovery view', exact: true }).getByRole('button', { name: 'Map', exact: true }).click()
  await expect(search).toHaveValue('No such workshop')
  await expect(picks.getByText(/Your other picks/)).toBeVisible()
  const map = await page.locator('.map-surface').boundingBox()
  const recommendation = await picks.boundingBox()
  expect(recommendation.y).toBeGreaterThanOrEqual(map.y + map.height)
  await page.getByRole('group', { name: 'Discovery view', exact: true }).getByRole('button', { name: 'List', exact: true }).click()
  await expect(picks.getByText(/Your other picks/)).toBeVisible()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(picks.locator('.recommendation-card')).toHaveCount(1)
  await expect(picks.getByText('Picks matching your current filters.')).toBeVisible()
  await expect(page.getByText('Finding your next event…', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('filtered-picks-desktop.png'), fullPage: true })
  expect(errors).toEqual([])
})

async function fixture(page) {
  let saved = false, dismissed = false, fail = false
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route('**/__recommendations', route => {
    if (route.request().method() === 'POST') {
      if (fail) return route.fulfill({ status: 503, json: {} })
      const { action } = route.request().postDataJSON()
      if (action === 'save') saved = true
      if (action === 'unsave') saved = false
      if (action === 'dismiss') dismissed = true
      if (action === 'undo_dismiss') dismissed = false
      return route.fulfill({ json: {} })
    }
    return route.fulfill({ json: { events: [
      ...(!dismissed ? [{ id: 'pottery', title: 'Pottery afternoon', category: 'arts', tags: ['arts'], start_time: '2030-01-02T10:00:00Z', spots_left: 10,
        compatibilityScore: saved ? 60 : 50, source: 'personalised', reason_type: 'interest', reason: 'Matches your selected interests: arts',
        recommendation_actions: true, saved }] : []),
      { id: 'music', title: 'Music evening', category: 'music', tags: ['music'], start_time: '2030-01-03T10:00:00Z', spots_left: 10,
        source: 'general_discovery', compatibilityScore: 0, rankingScore: null, reason: 'Upcoming event to explore', recommendation_actions: true }
    ] } })
  })
  await page.route('**/__recommendation-fixture.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const USING_SUPABASE = true;
    const session = {user: {id: 'fixture-user'}};
    export const supabase = {auth: {
      getSession: async () => ({data: {session}}),
      onAuthStateChange: () => ({data: {subscription: {unsubscribe() {}}}})
    }, from: () => new Proxy({}, {get(_target, method) {
      if (method === 'then') return resolve => resolve({data: []});
      return () => supabase.from();
    }})};
    export const api = {
      get: async () => ({data: await (await fetch('/__recommendations')).json()}),
      post: async (_url, body) => {
        const response = await fetch('/__recommendations', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
        if (!response.ok) throw new Error('Request failed');
        return {data: await response.json()};
      }
    };
  ` }))
  for (const [pattern, imports] of [
    [/\/src\/views\/DiscoverView\.vue(?:\?.*)?$/, /from (["'])\/src\/(?:lib\/supabase|utils\/api)\.js\1/g],
    [/\/src\/composables\/useEvents\.js(?:\?.*)?$/, /from (["'])\/src\/lib\/(?:supabase|api)\.js\1/g]
  ]) await page.route(pattern, async route => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace(imports, 'from "/__recommendation-fixture.js"') })
  })
  return { failActions(value) { fail = value } }
}

test('recommendation MVP displays scores and supports save, dismiss, undo and retry', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'warning') errors.push(message.text()) })
  const state = await fixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/discover')
  const picks = page.getByRole('region', { name: 'Picked for you' })
  await expect(picks.getByText('50% match', { exact: true })).toBeVisible()
  await expect(picks.getByText('General discovery', { exact: true })).toBeVisible()
  for (const scheme of ['light', 'dark']) {
    await page.getByLabel('Color theme').selectOption(scheme)
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.locator('main')).toHaveCount(1)
      const box = await picks.getByRole('button', { name: 'Save Pottery afternoon', exact: true }).boundingBox()
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  }
  await picks.getByRole('button', { name: 'Save Pottery afternoon', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(picks.getByRole('button', { name: 'Unsave Pottery afternoon', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(picks.getByText('60% match', { exact: true })).toBeVisible()
  await picks.getByRole('button', { name: 'Not interested in Pottery afternoon', exact: true }).click()
  await expect(picks.getByRole('heading', { name: 'Pottery afternoon' })).toHaveCount(0)
  await expect(picks.getByRole('button', { name: 'Undo', exact: true })).toBeFocused()
  await picks.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(picks.getByRole('heading', { name: 'Pottery afternoon' })).toBeVisible()
  state.failActions(true)
  await picks.getByRole('button', { name: 'Unsave Pottery afternoon', exact: true }).click()
  await expect(picks.getByRole('alert')).toContainText('Could not save your preference')
  state.failActions(false)
  await picks.getByRole('button', { name: 'Unsave Pottery afternoon', exact: true }).click()
  await expect(picks.getByRole('button', { name: 'Save Pottery afternoon', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('recommendation-mvp.png'), fullPage: true })
  expect(errors).toEqual([])
})
