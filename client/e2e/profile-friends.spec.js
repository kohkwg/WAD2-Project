import { test, expect } from '@playwright/test'

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
      if (${unavailable}) throw new Error('Friends are not available yet. Your profile and groups are still available in their tabs.');
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

test('Friends supports username search, request retry, acceptance and decline', async ({page}) => {
  const errors=[]
  page.on('pageerror', e=>errors.push(e.message))
  await page.emulateMedia({reducedMotion:'reduce'})
  await fixture(page)
  await page.goto('/profile')
  await page.getByLabel('Name', {exact:true}).fill('Unsaved profile')
  const nav=page.getByRole('navigation',{name:'Profile tools'})
  await nav.getByRole('link',{name:/Friends/}).click()
  await expect(page).toHaveURL(/tab=friends/)
  await expect(page.getByRole('heading',{name:'Your friends (0)',exact:true})).toBeVisible()
  for (const scheme of ['light','dark']) {
    await page.getByLabel('Color theme').selectOption(scheme)
    for (const width of [375,575,768,1280,1600]) {
      await page.setViewportSize({width,height:1000})
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await expect(page.locator('main')).toHaveCount(1)
      await expect.poll(async () => (await page.locator('main').boundingBox()).width).toBeGreaterThanOrEqual(width - (width >= 992 ? 240 : 0) - 2)
      const widths = await page.locator('.account-page').evaluate(el => ({ account: el.clientWidth, panel: el.querySelector('.friends-panel').clientWidth }))
      expect(widths.panel).toBeGreaterThanOrEqual(widths.account - 2)
    }
  }
  const username=page.locator('.friends-panel').getByLabel('Username',{exact:true})
  await username.fill('ab')
  await page.getByRole('button',{name:'Find people',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Enter at least 3')
  await username.fill('old')
  await page.getByRole('button',{name:'Find people',exact:true}).click()
  await username.fill('car')
  await page.getByRole('button',{name:'Find people',exact:true}).click()
  await page.getByRole('button',{name:'Add friend @carol',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Reply lost')
  await page.getByRole('button',{name:'Add friend @carol',exact:true}).click()
  await expect(page.getByRole('status')).toHaveText('Friend request sent to @carol.')
  await expect(page.getByRole('status')).toBeFocused()
  await expect(page.getByRole('button',{name:'Request sent @carol',exact:true})).toBeDisabled()
  await expect(page.getByRole('heading',{name:'Sent requests',exact:true})).toHaveCount(0)
  await expect.poll(()=>page.evaluate(()=>window.oldFriendsSearchDone)).toBe(true)
  await expect(page.getByText('Old result',{exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Accept friend request from alice',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Your friends (1)',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Decline friend request from bobby',exact:true}).click()
  await expect(page.getByText('No incoming requests.',{exact:true})).toBeVisible()
  await nav.getByRole('link',{name:/Edit profile/}).click()
  await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Unsaved profile')
  const account = await page.locator('.account-page').boundingBox()
  const profile = await page.locator('.profile-page').boundingBox()
  expect(profile.width).toBeGreaterThanOrEqual(account.width - 2)
  expect(errors).toEqual([])
})

test('missing Friends setup does not block Profile and direct Friends URL works',async ({page})=>{
  await fixture(page,true)
  await page.goto('/profile?tab=friends')
  await expect(page.getByRole('alert')).toContainText('Friends are not available yet')
  await expect(page.getByRole('button',{name:'Retry friends',exact:true})).toBeVisible()
  await page.getByRole('navigation',{name:'Profile tools'}).getByRole('link',{name:/Edit profile/}).click()
  await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Me')
})


test('incoming requests and remote acceptance update without losing search or Profile drafts',async ({page})=>{
  await fixture(page)
  await page.goto('/profile')
  await page.getByLabel('Name',{exact:true}).fill('Unsaved edit')
  const nav=page.getByRole('navigation',{name:'Profile tools'})
  await nav.getByRole('link',{name:/Friends/}).click()
  const input=page.locator('.friends-panel').getByLabel('Username',{exact:true})
  await input.fill('car')
  await page.getByRole('button',{name:'Find people',exact:true}).click()
  await input.focus()
  await page.evaluate(()=>window.receiveFriendRequest())
  await expect(page.getByRole('button',{name:'Accept friend request from dana',exact:true})).toBeVisible()
  await expect(input).toHaveValue('car')
  await expect(input).toBeFocused()
  await page.getByRole('button',{name:'Add friend @carol',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Reply lost')
  await page.getByRole('button',{name:'Add friend @carol',exact:true}).click()
  await expect(page.getByRole('button',{name:'Request sent @carol',exact:true})).toBeDisabled()
  await page.evaluate(()=>window.acceptSentFriendRequest())
  await expect(page.getByRole('button',{name:'Already friends @carol',exact:true})).toBeDisabled()
  await expect(page.getByRole('heading',{name:'Your friends (1)',exact:true})).toBeVisible()
  await expect(input).toHaveValue('car')
  await nav.getByRole('link',{name:/Edit profile/}).click()
  await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Unsaved edit')
})
