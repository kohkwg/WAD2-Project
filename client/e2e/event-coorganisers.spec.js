import { test, expect } from '@playwright/test'

test('co-organiser has all tool tabs and event editing; full event controls are available', async ({ page }) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/__coorganiser-api.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/utils/api.js';
    import * as original from '/src/utils/api.js';
    export const USING_SUPABASE = true;
    const shared = event => ({...event, isMine: false, canManage: true, organiserId: 'another-owner', creator: {username:'creator_account',displayName:'Creator',dino:'cheer'}});
    export async function getEventOperations(id) {const result=await original.getEventOperations(id);return {...result,event:shared(result.event)};}
    export async function getEvent(id) {return shared(await original.getEvent(id));}
    export async function getOrganiserEvents() {return (await original.getOrganiserEvents()).map(shared);}
  ` }))
  await page.route(/\/src\/views\/(ManageEventView|CreateEventView|OrganiserEventsView|ManageRsvpsView)\.vue(?:\?.*)?$/, async route => {
    const response = await route.fetch()
    const body = (await response.text()).replace(/from (["'])\/src\/utils\/api\.js\1/g, 'from "/__coorganiser-api.js"')
    await route.fulfill({ response, body })
  })
  await page.route(/\/src\/utils\/eventTeam\.js(?:\?.*)?$/, route => route.fulfill({contentType:'text/javascript',body:`
    export const USING_SUPABASE=true;
    export const teamRoleLabel=()=> 'Co-organiser';
    export async function getEventTeam(){return {isOwner:false,canManageTeam:true,members:[{id:'me',username:'coorganiser',role:'organiser'}],pending:[]};}
    export async function getMyEventTeams(){return {invitations:[],teams:[]};}
  `}))
  await page.goto('/organiser/events/e-weather-demo/manage?tab=tasks')
  await expect(page.getByRole('heading',{name:'Tasks',exact:true})).toBeVisible()
  const nav=page.getByRole('navigation',{name:'Event tools'})
  await nav.getByRole('button',{name:/^On the day/}).click()
  for (const name of ['Weather','Check-in station','Venue QR','Attendance']) await expect(nav.getByRole('link',{name,exact:true})).toBeVisible()
  await nav.getByRole('button',{name:/^Planning/}).click()
  for (const name of ['Tasks','Budget','Floor plan']) await expect(nav.getByRole('link',{name,exact:true})).toBeVisible()
  await nav.getByRole('button',{name:/^General/}).click()
  await nav.getByRole('link',{name:'Event team',exact:true}).click()
  await expect(page.getByText('@coorganiser',{exact:true})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Invite someone',exact:true})).toBeVisible()
  await nav.getByRole('button',{name:/^General/}).click()
  await nav.getByRole('link',{name:'Edit event',exact:true}).click()
  await expect(page.getByText('You can only edit events you organise.',{exact:true})).toHaveCount(0)
  await expect(page.getByRole('textbox').first()).toBeVisible()
  await page.goto('/organiser/events')
  await expect(page.locator('.organiser-event-card').first()).toBeVisible()
  await expect(page.locator('.organiser-event-card').first().getByText('@creator_account',{exact:true})).toBeVisible()
  await expect(page.locator('.organiser-event-card').first().locator('.creator-avatar img')).toBeVisible()
  await page.locator('.organiser-event-card').first().locator('summary').click()
  await expect(page.getByRole('button',{name:'Delete event',exact:true})).toBeVisible()
  for (const width of [375,575,768,1280]) {
    await page.setViewportSize({width,height:1000})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await expect(page.locator('main')).toHaveCount(1)
  }
  expect(errors).toEqual([])
})
