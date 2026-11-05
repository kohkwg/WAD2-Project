import { test, expect } from '@playwright/test'

// These checks use the theme dropdown in the expanded sidebar; from 992px the sidebar starts as an icon rail
// unless someone expanded it (docs/decisions.md, 5 November), so start from that remembered choice.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('bookedz-sidebar', 'expanded') } catch { /* storage blocked */ } }) })

async function fixture(page, unavailable = false) {
  await page.route(/\/src\/utils\/profileSocial\.js(?:\?.*)?$/, route => route.fulfill({contentType:'text/javascript',body: `
    export function subscribeSocialUpdates(callback,isActive) {
      const listener=()=>{if(isActive())callback()};
      window.addEventListener('social-update',listener);
      return ()=>window.removeEventListener('social-update',listener);
    }
  `}))

  await page.route('**/__account-fixture.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const USING_SUPABASE = true;
    export const geocodePostalCode = async () => ({lat: 1.3, lng: 103.8});
    export const changeEmail = async () => ({});
    export const changePassword = async () => ({});
    export const supabase = {
      auth: {getUser: async () => ({data: {user: {id: 'me'}}})},
      from: () => ({select: () => ({eq: () => ({maybeSingle: async () => ({data: {id: 'me', display_name: 'Me', username: 'myself', profile_interests: []}})})})}),
      rpc: async () => ({error: null})
    };
  ` }))
  await page.route(/\/src\/views\/ProfileView\.vue(?:\?.*)?$/, async route => {
    const response = await route.fetch()
    const body = (await response.text()).replace(/from (["'])\/src\/(?:lib\/(?:supabase|onemap)|utils\/api)\.js\1/g, 'from "/__account-fixture.js"')
    await route.fulfill({ response, body })
  })
  await page.route(/\/src\/utils\/profileFriends\.js(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    export const USING_SUPABASE = true;
    const incoming = [{id:'alice',username:'alice',displayName:'Alice'}, {id:'bob',username:'bobby',displayName:'Bob'}];
    const outgoing = [];
    const friends = [];
    let failed = false;
    window.receiveFriendRequest = () => {
      incoming.push({id:'dana',username:'dana',displayName:'Dana'});
      window.dispatchEvent(new Event('social-update'));
    };
    window.acceptSentFriendRequest = () => {
      friends.push(...outgoing.splice(0));
      window.dispatchEvent(new Event('social-update'));
    };
    export async function getFriends() {
      if (${unavailable}) throw new Error('Friends are not available yet. Your profile and Go together still work.');
      return structuredClone({friends,incoming,outgoing});
    }
    export async function searchPeople(query) {
      if (query === 'old') { await new Promise(resolve=>setTimeout(resolve,200)); window.oldFriendsSearchDone=true; return [{id:'old',username:'old_person',displayName:'Old result',relationship:'none'}]; }
      return query === 'car' ? [{id:'carol',username:'carol',displayName:'Carol',relationship:outgoing.length?'outgoing':'none'}] : [];
    }
    export async function sendRequest(id) {
      if (!outgoing.some(p=>p.id===id)) outgoing.push({id,username:'carol',displayName:'Carol'});
      if (!failed) {failed=true;throw new Error('Reply lost. Try again.');}
    }
    export async function respondToRequest(id,accept) {
      const i=incoming.findIndex(p=>p.id===id);
      if (i>=0) {const [person]=incoming.splice(i,1);if(accept) friends.push(person);}
    }
  ` }))
}

// Friends is a small side panel in Community (moved from Profile on 4 November 2026)
const panel = page => page.locator('#friends .friends-panel')

test('Friends in Community supports username search, request retry, acceptance and decline', async ({page}) => {
  const errors=[]
  page.on('pageerror', e=>errors.push(e.message))
  await page.emulateMedia({reducedMotion:'reduce'})
  await fixture(page)
  await page.goto('/community')
  await expect(page.getByRole('heading',{name:'Go together',exact:true})).toBeVisible()
  await expect(panel(page).getByRole('heading',{name:'Your friends (0)',exact:true})).toBeVisible()
  for (const scheme of ['light','dark']) {
    await page.getByLabel('Color theme').selectOption(scheme)
    for (const width of [375,768,1280,1600]) {
      await page.setViewportSize({width,height:1000})
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await expect(page.locator('main')).toHaveCount(1)
    }
  }
  // Wide screens: the panel is a narrow column beside the groups; narrow screens: below them
  await page.setViewportSize({width:1600,height:1000})
  const wide = await page.evaluate(()=>({ feed: document.querySelector('.community-main').getBoundingClientRect(), aside: document.querySelector('#friends').getBoundingClientRect() }))
  expect(wide.aside.left).toBeGreaterThan(wide.feed.right)
  expect(wide.aside.width).toBeLessThan(400)
  await page.setViewportSize({width:375,height:900})
  const narrow = await page.evaluate(()=>({ feed: document.querySelector('.community-main').getBoundingClientRect(), aside: document.querySelector('#friends').getBoundingClientRect() }))
  expect(narrow.aside.top).toBeGreaterThan(narrow.feed.bottom - 1)
  await page.setViewportSize({width:1280,height:1000})

  const username=panel(page).getByLabel('Username',{exact:true})
  await username.fill('ab')
  await panel(page).getByRole('button',{name:'Find people',exact:true}).click()
  await expect(panel(page).getByRole('alert')).toContainText('Enter at least 3')
  await username.fill('old')
  await panel(page).getByRole('button',{name:'Find people',exact:true}).click()
  await username.fill('car')
  await panel(page).getByRole('button',{name:'Find people',exact:true}).click()
  await panel(page).getByRole('button',{name:'Add friend @carol',exact:true}).click()
  await expect(panel(page).getByRole('alert')).toContainText('Reply lost')
  await panel(page).getByRole('button',{name:'Add friend @carol',exact:true}).click()
  await expect(panel(page).getByRole('status')).toHaveText('Friend request sent to @carol.')
  await expect(panel(page).getByRole('status')).toBeFocused()
  await expect(panel(page).getByRole('button',{name:'Request sent @carol',exact:true})).toBeDisabled()
  await expect.poll(()=>page.evaluate(()=>window.oldFriendsSearchDone)).toBe(true)
  await expect(panel(page).getByText('Old result',{exact:true})).toHaveCount(0)
  await panel(page).getByRole('button',{name:'Accept friend request from alice',exact:true}).click()
  await expect(panel(page).getByRole('heading',{name:'Your friends (1)',exact:true})).toBeVisible()
  await panel(page).getByRole('button',{name:'Decline friend request from bobby',exact:true}).click()
  await expect(panel(page).getByText('No incoming requests.',{exact:true})).toBeVisible()
  expect(errors).toEqual([])
})

test('missing Friends setup shows a retry in the panel and old Profile links land on it', async ({page})=>{
  await fixture(page,true)
  await page.goto('/profile?tab=friends')
  await expect(page).toHaveURL(/\/community#friends$/)
  await expect(panel(page).getByRole('alert')).toContainText('Friends are not available yet')
  await expect(panel(page).getByRole('button',{name:'Retry friends',exact:true})).toBeVisible()
  // Go together still works beside it
  await expect(page.getByRole('button',{name:'Start a group',exact:true})).toBeVisible()
  await page.goto('/profile?tab=groups')
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('heading',{name:'Your profile',exact:true})).toBeVisible()
  await expect(page.getByRole('navigation',{name:'Profile tools'})).toHaveCount(0)
})

test('incoming requests and remote acceptance update without losing the search', async ({page})=>{
  await fixture(page)
  await page.goto('/community')
  const input=panel(page).getByLabel('Username',{exact:true})
  await input.fill('car')
  await panel(page).getByRole('button',{name:'Find people',exact:true}).click()
  await input.focus()
  await page.evaluate(()=>window.receiveFriendRequest())
  await expect(panel(page).getByRole('button',{name:'Accept friend request from dana',exact:true})).toBeVisible()
  await expect(input).toHaveValue('car')
  await expect(input).toBeFocused()
  await panel(page).getByRole('button',{name:'Add friend @carol',exact:true}).click()
  await expect(panel(page).getByRole('alert')).toContainText('Reply lost')
  await panel(page).getByRole('button',{name:'Add friend @carol',exact:true}).click()
  await expect(panel(page).getByRole('button',{name:'Request sent @carol',exact:true})).toBeDisabled()
  await page.evaluate(()=>window.acceptSentFriendRequest())
  await expect(panel(page).getByRole('button',{name:'Already friends @carol',exact:true})).toBeDisabled()
  await expect(panel(page).getByRole('heading',{name:'Your friends (1)',exact:true})).toBeVisible()
  await expect(input).toHaveValue('car')
})


test('Community fills the available width and keeps its responsive Friends panel',async({page})=>{
  await fixture(page)
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.goto('/community')
  await expect(page.getByRole('heading',{name:'Go together',exact:true})).toBeVisible()
  for(const scheme of ['light','dark']){
    await page.getByLabel('Color theme').selectOption(scheme)
    for(const width of [375,575,768,1280,1920,2560]){
      await page.setViewportSize({width,height:1000})
      await expect.poll(()=>page.locator('main').evaluate(el=>Math.abs(el.getBoundingClientRect().width-(innerWidth-parseFloat(getComputedStyle(document.querySelector('.app-shell')).paddingLeft))))).toBeLessThan(3)
      const layout=await page.locator('.community-page').evaluate(el=>{
        const main=el.closest('main'),css=getComputedStyle(main)
        return { gap:main.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)-el.getBoundingClientRect().width, overflow:document.documentElement.scrollWidth>innerWidth, feed:el.querySelector('.community-main').getBoundingClientRect().x, friends:el.querySelector('.community-aside').getBoundingClientRect().x }
      })
      expect(Math.abs(layout.gap)).toBeLessThan(3)
      expect(layout.overflow).toBe(false)
      if(width>=1200)expect(layout.friends).toBeGreaterThan(layout.feed)
      await expect(page.locator('main')).toHaveCount(1)
    }
  }
})
