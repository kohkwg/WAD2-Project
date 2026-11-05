import { test, expect } from '@playwright/test'

// These checks use the theme dropdown in the expanded sidebar; from 992px the sidebar starts as an icon rail
// unless someone expanded it (docs/decisions.md, 5 November), so start from that remembered choice.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('bookedz-sidebar', 'expanded') } catch { /* storage blocked */ } }) })

const palette = {
  light: ['#fff8f1','#ffffff','#1f2937','#636975','#ff6b35','#9a3412','#ffe4d6','#fde7b0','#14b8a6','#ec4899','#e9ded3'],
  dark: ['#1c1917','#292524','#fafaf9','#a8a29e','#ff8a5b','#ffb79a','#4a2b1f','#5b4210','#2dd4bf','#f472b6','#57534e'],
}
const names = ['canvas','surface','ink','muted','primary','primary-dark','peach','mango','teal','pink','border']
const rgb = hex => `rgb(${[1,3,5].map(offset => parseInt(hex.slice(offset,offset+2),16)).join(', ')})`
test.beforeEach(async ({page}) => {
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.emulateMedia({reducedMotion:'reduce'})
})

test('Discover pairs a street map with the timeline and legacy links retain filters', async ({page}) => {
  const errors = [], modules = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (/SingaporeMap\.vue|utils\/discoveryMap/.test(request.url())) modules.push(request.url()) })
  await page.goto('/discover?view=map&search=Acoustic')
  await expect(page).toHaveURL(/view=list/)
  await expect(page.getByRole('searchbox', {name:'Search by title, description or venue'})).toHaveValue('Acoustic')
  await expect(page.locator('.discovery-event-row')).toHaveCount(1)
  await expect(page.getByRole('link', {name:'Map',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button', {name:'Map',exact:true})).toHaveCount(0)
  await expect(page.locator('.discovery-map-column')).toHaveCount(1)
  await expect(page.locator('.discovery-street-map')).toBeVisible()
  const mapAction = page.getByRole('button', {name:'Show Acoustic Night @ Campus Green on map'})
  await mapAction.click()
  await expect(page.getByRole('region', {name:'Selected map events'})).toBeVisible()
  await page.getByRole('button', {name:'Close event preview'}).click()
  await expect(mapAction).toBeFocused()
  const title = page.locator('.discovery-event-row .row-title').first()
  const href = await title.getAttribute('href')
  await title.click()
  await expect(page).toHaveURL(new RegExp(href+'$'))
  await page.goBack()
  await expect(page.locator('.discovery-event-row')).toHaveCount(1)
  await page.goto('/discover?view=categories')
  await expect(page.getByRole('heading',{name:'All categories',exact:true})).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('button',{name:'Map',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Explore events',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Explore events',exact:true}).click()
  await expect(page).toHaveURL(/\/discover\?/)
  expect(modules).toEqual([])
  expect(errors).toEqual([])
})

test('supplied palette reaches actual surfaces, headings and actions in both themes', async ({page},testInfo) => {
  const errors=[]
  page.on('pageerror', error=>errors.push(error.message))
  for(const theme of ['light','dark']) for(const width of [375,575,768,1280]) {
    for(const path of ['/discover','/my-rsvps','/organiser/events','/organiser/events/new']) {
      await page.setViewportSize({width:1280,height:950})
      await page.goto(path)
      await page.getByLabel('Color theme').selectOption(theme)
      await page.setViewportSize({width,height:950})
      if(path==='/discover')await expect(page.locator('.discovery-event-row').first()).toBeVisible()
      if(path==='/my-rsvps')await expect(page.locator('.rsvp-tabs')).toBeVisible()
      if(path==='/organiser/events')await expect(page.locator('.organiser-event-card').first()).toBeVisible()
      const actual=await page.evaluate(keys=>{
        const style=getComputedStyle(document.documentElement)
        return keys.map(key=>style.getPropertyValue('--bookedz-'+key).trim().toLowerCase())
      },names)
      expect(actual).toEqual(palette[theme])
      await expect(page.locator('body')).toHaveCSS('background-color',rgb(palette[theme][0]))
      await expect(page.locator('body')).toHaveCSS('color',rgb(palette[theme][2]))
      await expect(page.locator('.app-sidebar')).toHaveCSS('background-color',rgb(palette[theme][1]))
      if(path==='/my-rsvps')await expect(page.locator('.rsvps-heading')).toHaveCSS('background-image',new RegExp(rgb(palette[theme][6]).replace(/[()]/g,'\\$&')))
      if(path==='/organiser/events')await expect(page.locator('.organiser-heading')).toHaveCSS('background-image',new RegExp(rgb(palette[theme][6]).replace(/[()]/g,'\\$&')))
      if(path==='/organiser/events/new')await expect(page.getByRole('button',{name:'Next',exact:true})).toHaveCSS('background-color',rgb(palette[theme][4]))
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await expect(page.locator('main')).toHaveCount(1)
      await expect(page.getByRole('link',{name:'Map',exact:true})).toHaveCount(0)
      if([375,1280].includes(width))await page.screenshot({path:testInfo.outputPath(`${path.split('/').at(-1)}-${theme}-${width}.png`)})
    }
  }
  expect(errors).toEqual([])
})
