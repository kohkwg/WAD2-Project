import { test, expect } from '@playwright/test'

// Discover search suggestions in demo mode (no sign-in, no hosted writes). Queries come from the demo
// events in src/utils/mockData.js: "Evening Futsal Match" (sports, Our Tampines Hub), "Acoustic Night @
// Campus Green" (music), "Intro to Vue Workshop" (tech, career) and "Career Fair Prep Talk" (career).

let pageErrors
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
})
test.afterEach(() => {
  expect(pageErrors, 'uncaught page errors').toEqual([])
})

const searchBox = page => page.locator('#event-search')
const list = page => page.locator('#search-suggestions')
const options = page => page.getByRole('option')
const cards = page => page.locator('main article.discovery-event-row')

async function expectMusicFilter(page) {
  await expect(page.getByRole('button', { name: 'Remove Music filter', includeHidden: true })).toHaveCount(1)
  await expect(page.locator('.filter-toggle .filter-count')).toHaveText(/1/)
}

async function openDiscover(page) {
  await page.goto('/discover')
  await expect(searchBox(page)).toBeVisible()
  await expect(cards(page).first()).toBeVisible()
}

// Typing needs the focus first: the suggestion events load on focus, and then the list follows the text
async function typeQuery(page, text) {
  await searchBox(page).click()
  await searchBox(page).fill('')
  await searchBox(page).pressSequentially(text, { delay: 30 })
}

test('typing shows a listbox with kind labels and aria-expanded', async ({ page }) => {
  await openDiscover(page)
  await expect(searchBox(page)).toHaveAttribute('role', 'combobox')
  await expect(searchBox(page)).toHaveAttribute('aria-expanded', 'false')
  await typeQuery(page, 'fut')
  await expect(list(page)).toBeVisible()
  await expect(list(page)).toHaveAttribute('role', 'listbox')
  await expect(searchBox(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(searchBox(page)).toHaveAttribute('aria-controls', 'search-suggestions')
  await expect(options(page)).toHaveCount(2)
  await expect(options(page).nth(0)).toContainText('Keyword')
  await expect(options(page).nth(0)).toContainText('futsal')
  await expect(options(page).nth(0)).toContainText('1 event')
  await expect(options(page).nth(1)).toContainText('Event')
  await expect(options(page).nth(1)).toContainText('Evening Futsal Match')
  // Only the typed part is highlighted, in the label's own spelling
  await expect(options(page).nth(1).locator('mark')).toHaveText('Fut')
  await expect(options(page).nth(1).locator('.suggestion-label')).toHaveText('Evening Futsal Match')
  await expect(page.getByRole('status').filter({ hasText: '2 suggestions available' })).toBeAttached()

  // One character is too short
  await searchBox(page).fill('f')
  await expect(list(page)).toBeHidden()
  await expect(searchBox(page)).toHaveAttribute('aria-expanded', 'false')
})

test('ArrowDown sets the active option, Enter chooses it and Escape closes without clearing', async ({ page }) => {
  await openDiscover(page)
  await typeQuery(page, 'fut')
  await expect(options(page)).toHaveCount(2)
  await expect(searchBox(page)).not.toHaveAttribute('aria-activedescendant', /.+/)

  await page.keyboard.press('ArrowDown')
  await expect(searchBox(page)).toHaveAttribute('aria-activedescendant', 'search-suggestion-0')
  await expect(options(page).nth(0)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(searchBox(page)).toHaveAttribute('aria-activedescendant', 'search-suggestion-1')
  await page.keyboard.press('ArrowUp')
  await expect(searchBox(page)).toHaveAttribute('aria-activedescendant', 'search-suggestion-0')

  // Escape closes only the list: the typed text stays and the box keeps focus
  await page.keyboard.press('Escape')
  await expect(list(page)).toBeHidden()
  await expect(searchBox(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(searchBox(page)).not.toHaveAttribute('aria-activedescendant', /.+/)
  await expect(searchBox(page)).toHaveValue('fut')
  await expect(searchBox(page)).toBeFocused()

  // ArrowDown reopens it on the first row, and Enter chooses the keyword
  await page.keyboard.press('ArrowDown')
  await expect(list(page)).toBeVisible()
  await expect(searchBox(page)).toHaveAttribute('aria-activedescendant', 'search-suggestion-0')
  await page.keyboard.press('Enter')
  await expect(searchBox(page)).toHaveValue('futsal')
  await expect(list(page)).toBeHidden()
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page).first()).toContainText('Evening Futsal Match')
})

test('choosing a keyword fills the box and the results match its count', async ({ page }) => {
  await openDiscover(page)
  await typeQuery(page, 'acou')
  const keyword = options(page).filter({ hasText: 'Keyword' })
  await expect(keyword).toHaveCount(1)
  await expect(keyword).toContainText('acoustic')
  const count = Number((await keyword.locator('.suggestion-count').innerText()).match(/^\d+/)[0])
  await keyword.click()
  await expect(searchBox(page)).toHaveValue('acoustic')
  await expect(list(page)).toBeHidden()
  await expect(cards(page)).toHaveCount(count)
  await expect(cards(page).first()).toContainText('Acoustic Night')
})

test('choosing a venue fills the box and the results match', async ({ page }) => {
  await openDiscover(page)
  await typeQuery(page, 'tampi')
  const venue = options(page).filter({ hasText: 'Venue' })
  await expect(venue).toHaveCount(1)
  await expect(venue).toContainText('Our Tampines Hub')
  await expect(venue).toContainText('1 event')
  await venue.click()
  await expect(searchBox(page)).toHaveValue('Our Tampines Hub')
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page).first()).toContainText('Evening Futsal Match')
  await expect(cards(page).first()).toContainText('Our Tampines Hub')
  // The whole venue name is typed: it isn't offered again
  await searchBox(page).click()
  await expect(options(page).filter({ hasText: 'Venue' })).toHaveCount(0)
})

test('choosing a category clears the box and adds an active filter chip', async ({ page }) => {
  await openDiscover(page)
  await typeQuery(page, 'mu')
  const category = options(page).filter({ hasText: 'Category' })
  await expect(category).toHaveCount(1)
  await expect(category).toContainText('Music')
  await category.click()
  await expect(searchBox(page)).toHaveValue('')
  await expect(list(page)).toBeHidden()
  // Discover hides the chip row visually (design-baseline.css) and shows the filter as the Filters count,
  // so look for the chip in the DOM and for the checked Music option in the panel
  await expectMusicFilter(page)
  // two demo events have the music tag: Acoustic Night and Campus Green Social
  await expect(cards(page)).toHaveCount(2)
  await expect(cards(page).filter({ hasText: 'Acoustic Night' })).toHaveCount(1)
  await expect(cards(page).filter({ hasText: 'Evening Futsal' })).toHaveCount(0)
  await page.locator('.filter-toggle').click()
  await expect(page.locator('#event-filter-panel').getByRole('checkbox', { name: 'Music' })).toBeChecked()
})

// Clicking the row right after typing, before the 250ms search debounce has settled
test('choosing an event row straight after typing opens its RSVP page', async ({ page }) => {
  await openDiscover(page)
  await typeQuery(page, 'vue')
  const row = options(page).filter({ hasText: 'Intro to Vue Workshop' })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Event')
  await row.click()
  await expect(page).toHaveURL(/\/events\/[^/]+\/rsvp(?:[?#].*)?$/)
  await expect(page.getByRole('heading', { name: /Intro to Vue Workshop/ }).first()).toBeVisible()
})

test('after the search has settled, an event row opens its RSVP page and Back returns to Discover', async ({ page }) => {
  await openDiscover(page)
  await typeQuery(page, 'vue')
  await expect(page).toHaveURL(/search=vue/)
  const row = options(page).filter({ hasText: 'Intro to Vue Workshop' })
  await expect(row).toHaveCount(1)
  await row.click()
  await expect(page).toHaveURL(/\/events\/[^/]+\/rsvp(?:[?#].*)?$/)
  await expect(page.getByRole('heading', { name: /Intro to Vue Workshop/ }).first()).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/discover(?:[?#].*)?$/)
  await expect(searchBox(page)).toBeVisible()
})

test('with a category filter active, suggestions do not offer events outside it', async ({ page }) => {
  await openDiscover(page)
  await typeQuery(page, 'mu')
  await options(page).filter({ hasText: 'Category' }).click()
  await expectMusicFilter(page)

  // Inside Music: Acoustic Night is offered
  await typeQuery(page, 'acou')
  await expect(options(page).filter({ hasText: 'Acoustic Night @ Campus Green' })).toHaveCount(1)
  // Outside it: nothing for Futsal (sports) or Pottery (arts); the list stays closed
  await typeQuery(page, 'fut')
  await expect(options(page).filter({ hasText: /futsal/i })).toHaveCount(0)
  await expect(list(page)).toBeHidden()
  await expect(searchBox(page)).toHaveAttribute('aria-expanded', 'false')
  await typeQuery(page, 'pott')
  await expect(options(page)).toHaveCount(0)
  // The chosen category isn't offered a second time
  await typeQuery(page, 'mu')
  await expect(options(page).filter({ hasText: 'Category' })).toHaveCount(0)
})

test('opening Filters closes the suggestion list', async ({ page }) => {
  await openDiscover(page)
  await typeQuery(page, 'fut')
  await expect(list(page)).toBeVisible()
  await page.locator('.filter-toggle').click()
  await expect(page.locator('#event-filter-panel')).toBeVisible()
  await expect(list(page)).toBeHidden()
  await expect(searchBox(page)).toHaveAttribute('aria-expanded', 'false')
})

test('the open list fits a 375px screen and the page keeps exactly one main', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openDiscover(page)
  await typeQuery(page, 'ca')
  await expect(list(page)).toBeVisible()
  await expect(options(page).first()).toBeVisible()
  expect(await options(page).count()).toBeGreaterThan(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal page overflow').toBe(true)
  const box = await list(page).boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(375)
  await expect(page.locator('main')).toHaveCount(1)
})
