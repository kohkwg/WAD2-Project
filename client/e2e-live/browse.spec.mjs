import {test,expect} from '@playwright/test'

// Read-only anonymous check: consolidating navigation must preserve public browsing.
test('Discover and legacy event links remain public while Profile requires sign-in',async({page})=>{
 await page.goto('/events')
 await expect(page).toHaveURL(/\/discover$/)
 await expect(page.getByRole('heading',{name:'Discover events'})).toBeVisible()
 await expect(page.locator('.event-card').first()).toBeVisible()
 await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible()
 const href=await page.locator('.event-card a[href$="/rsvp"]').first().getAttribute('href')
 await page.goto(href)
 await expect(page.locator('main h1')).toBeVisible()
 await expect(page.getByRole('heading',{name:'Ready to RSVP?'})).toBeVisible()
 await page.getByRole('link',{name:'← All events'}).click()
 await expect(page).toHaveURL(/\/discover$/)
 await page.goto('/profile')
 await expect.poll(()=>new URL(page.url()).pathname).toBe('/login')
 expect(new URL(page.url()).searchParams.get('redirect')).toBe('/profile')
})
