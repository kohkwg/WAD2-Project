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
  await page.route(/\/src\/utils\/profileGroups\.js(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    export const USING_SUPABASE = true;
    const groups = [];
    let invitations = [{id: 'incoming-1', name: 'Brunch club', ownerName: 'A friend', ownerUsername: 'friend'}, {id: 'incoming-2', name: 'Weekend club', ownerName: 'A friend'}];
    const members = new Map();
    const attempts = new Map();
    let inviteFailed = false;
    window.acceptGroupInvite = () => {
      members.get('created-group').find(p=>p.id==='alice').status='accepted';
      window.dispatchEvent(new Event('social-update'));
    };
    export async function getGroups() {
      if (${unavailable}) throw new Error('Groups are not available yet. Your profile is still available under Edit profile.');
      return structuredClone({groups, invitations});
    }
    export async function getGroupMembers(id) {return structuredClone(members.get(id) || [{id:'friend', displayName:'A friend', username:'friend', status:'accepted', isOwner:true}, {id:'me', displayName:'Me', username:'myself', status:'accepted'}]);}
    export async function createGroup(name, request) {
      if (!attempts.has(request)) {
        attempts.set(request, 'created-group');
        groups.push({id:'created-group', name, isOwner:true});
        members.set('created-group', [{id:'me',displayName:'Me', username:'myself',status:'accepted',isOwner:true}]);
        throw new Error('Reply lost. Retry creating your group.');
      }
      return attempts.get(request);
    }
    export async function searchPeople(query) {
      if (query === 'old') {await new Promise(resolve => setTimeout(resolve, 300)); window.oldGroupSearchDone = true; return [{id:'old',username:'old_person',displayName:'Old result'}];}
      return query.startsWith('ali') ? [{id:'alice',username:'alice',displayName:'Alice'}] : [];
    }
    export async function inviteMember(group, user) {
      if (!inviteFailed) {inviteFailed=true; throw new Error('Invite failed. Please retry.');}
      const rows=members.get(group);
      if (!rows.some(row=>row.id===user)) rows.push({id:user,username:'alice',displayName:'Alice',status:'invited'});
    }
    export async function respondToInvite(id, accept) {
      const invitation=invitations.find(item=>item.id===id);
      invitations=invitations.filter(item=>item.id!==id);
      if (accept) groups.push({id:invitation.id,name:invitation.name,isOwner:false});
    }
  ` }))
}

test('Profile tabs retain drafts; groups create, invite, accept and decline with retry', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await fixture(page)
  await page.goto('/profile')
  await page.getByLabel('Name', { exact: true }).fill('My unsaved name')
  const nav = page.getByRole('navigation', { name: 'Profile tools' })
  await nav.getByRole('link', { name: /Groups/ }).click()
  await expect(page).toHaveURL(/tab=groups/)
  await expect(page.getByText('No groups yet.', { exact: false })).toBeVisible()
  for (const scheme of ['light', 'dark']) {
    await page.getByLabel('Color theme').selectOption(scheme)
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.locator('main')).toHaveCount(1)
    }
  }
  await page.getByLabel('Group name', { exact: true }).fill('Our friends')
  await page.getByRole('button', { name: 'Create group', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Reply lost')
  await expect(page.getByLabel('Group name', { exact: true })).toHaveValue('Our friends')
  await page.getByRole('button', { name: 'Create group', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Group created')
  await expect(page.getByRole('status')).toBeFocused()
  await expect(page.locator('#selected-group option')).toHaveCount(1)
  await page.getByLabel('Find by username').fill('old')
  await page.getByRole('button', { name: 'Find people', exact: true }).click()
  await page.getByLabel('Find by username').fill('alice')
  await page.getByRole('button', { name: 'Find people', exact: true }).click()
  const invite = page.getByRole('button', { name: 'Invite @alice', exact: true })
  await expect(invite).toBeVisible()
  await expect(page.getByText('Old result', { exact: true })).toHaveCount(0)
  await invite.click()
  await expect(page.getByRole('alert')).toContainText('Invite failed')
  await invite.click()
  await expect(page.getByRole('status')).toHaveText('Invitation sent to @alice.')
  await expect(invite).toBeDisabled()
  await page.evaluate(()=>window.acceptGroupInvite())
  await expect(invite).toHaveText('Already a member')
  await expect(page.getByLabel('Find by username')).toHaveValue('alice')
  await expect.poll(() => page.evaluate(() => window.oldGroupSearchDone)).toBe(true)
  await expect(page.getByText('Old result', { exact: true })).toHaveCount(0)
  for (const [width, scheme] of [[375, 'dark'], [1280, 'light']]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.getByLabel('Color theme').selectOption(scheme)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await page.screenshot({ path: testInfo.outputPath(`groups-${scheme}-${width}.png`) })
  }
  await page.getByRole('button', { name: 'Accept invitation to Brunch club', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('You joined Brunch club.')
  await page.getByRole('button', { name: 'Decline invitation to Weekend club', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Invitation to Weekend club declined.')
  await expect(page.getByRole('heading', { name: 'Invitations', exact: true })).toHaveCount(0)
  await page.getByLabel('Choose a group').selectOption('incoming-1')
  await expect(page.getByText('The group owner can invite more friends.')).toBeVisible()
  await expect(page.getByLabel('Find by username')).toHaveCount(0)
  await nav.getByRole('link', { name: /Edit profile/ }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('My unsaved name')
  expect(errors).toEqual([])
})

test('missing Groups setup keeps Edit profile usable and supports direct tab URLs', async ({ page }) => {
  await fixture(page, true)
  await page.goto('/profile?tab=groups')
  await expect(page.getByRole('alert')).toContainText('Groups are not available yet')
  await expect(page.getByRole('button', { name: 'Retry groups', exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: 'Profile tools' }).getByRole('link', { name: /Edit profile/ }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Me')
})
