import {test,expect} from '@playwright/test'
import {createSeedData} from '../src/utils/mockData.js'

for(const width of [375,575,768,1280]) {
  test(`demo discovery and profile stay usable at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900})
    const errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    await page.goto('/discover')
    await expect(page.getByRole('heading',{name:'Discover events'})).toBeVisible()
    await expect(page.locator('.event-card').first()).toBeVisible()
    await expect(page.locator('main')).toHaveCount(1)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.goto('/profile')
    await expect(page.getByRole('status')).toContainText('Profile editing requires live mode')
    await expect(page.locator('main')).toHaveCount(1)
    expect(errors).toEqual([])
  })
}

test('team members do not see the RSVP form, and checked-in attendees do not see cancellation',async({page})=>{
 const data=createSeedData()
 data.events[0].organiserId='u1'
 data.rsvps=[{id:'r-in',eventId:data.events[1].id,userId:'u1',status:'confirmed',checkedInAt:new Date().toISOString(),answers:{}}]
 await page.addInitScript(db=>localStorage.setItem('bookedz-feature2-demo',JSON.stringify(db)),data)
 await page.goto(`/events/${data.events[0].id}/rsvp`)
 await expect(page.getByRole('status').filter({hasText:'Organisers and helpers'})).toBeVisible()
 await expect(page.getByRole('button',{name:'RSVP',exact:true})).toHaveCount(0)
 await page.goto('/my-rsvps')
 const card=page.locator('.card',{hasText:data.events[1].title})
 await expect(card).toContainText('Checked in')
 await expect(card.getByRole('button',{name:'Cancel RSVP'})).toHaveCount(0)
})

test('Discover replaces the placeholder and preserves legacy browsing links',async({page})=>{
 await page.setViewportSize({width:575,height:900})
 await page.goto('/events?source=legacy#browse')
 await expect(page).toHaveURL(/\/discover\?source=legacy#browse$/)
 await expect(page.getByRole('heading',{name:'Discover events'})).toBeVisible()
 await expect(page.getByText(/Placeholder list/)).toHaveCount(0)
 await page.getByRole('button',{name:'Toggle navigation'}).click()
 const nav=page.getByRole('navigation',{name:'Main navigation'})
 await expect(nav.getByRole('link',{name:'Events',exact:true})).toHaveCount(0)
 await expect(nav.getByRole('link',{name:'Discover',exact:true})).toHaveCount(1)
 await nav.getByRole('link',{name:'Bookedz',exact:true}).click()
 await expect(page).toHaveURL(/\/discover$/)
 const detail=page.locator('.event-card a[href$="/rsvp"]').first()
 await detail.click()
 await expect(page).toHaveURL(/\/events\/[^/]+\/rsvp$/)
 await expect(page.getByRole('link',{name:'← All events'})).toBeVisible()
 await page.getByRole('link',{name:'← All events'}).click()
 await expect(page).toHaveURL(/\/discover$/)
})
