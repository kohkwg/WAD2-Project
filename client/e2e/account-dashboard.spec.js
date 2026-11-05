import { test, expect } from '@playwright/test';

async function fixture(page, {
  empty = false,
  failed = false
} = {}) {
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.route('**/__dashboard-api.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
  export * from '/src/utils/api.js';
  export const USING_SUPABASE=true;
  export const getCurrentUser=async()=>({id:'dashboard-user',email:'dashboard@example.invalid'});
  export const onAuthChange=()=>()=>{};
  export const getUser=async()=>({name:'Dina Test',interests:['music']});
  const start=new Date(Date.now()+86400000).toISOString(),end=new Date(Date.now()+90000000).toISOString();
  const event={id:'next-test',title:'Tomorrow’s workshop',startTime:start,endTime:end,status:'published',venue:{name:'Test Hall',lat:1.3,lng:103.8},tags:['tech']};
  export const getMyRsvps=async()=>${empty} ? [] : [{id:'r1',status:'confirmed',event},{id:'r2',status:'pending',event:{...event,id:'other-test',title:'Another plan'}}];
  export const getSavedEvents=async()=>${empty} ? [] : [{...event,id:'saved-test',title:'Saved weekend idea'}];
  export async function getGroups(){if(${failed}&&!window.dashboardRecovered)throw new Error('Offline');return [];}
  export const getGroupInvites=async()=>[];
  export const getOrganiserEvents=async()=>${empty}?[]:[{...event,id:'hosted-test',title:'Hosted event',isMine:true},{...event,id:'hidden-group',kind:'group',title:'Group is not a hosted event'}];
 `
  }));
  await page.route(/\/src\/(?:components\/(?:landing\/AccountDashboard|NavBar)\.vue|views\/LandingView\.vue)(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(/from (["'])\/src\/utils\/api(?:\.js)?\1/g, 'from "/__dashboard-api.js"')
    });
  });
  await page.route(/\/src\/utils\/profileFriends(?:\.js)?(?:\?.*)?$/, route => route.fulfill({
    contentType: 'text/javascript',
    body: `export const getFriends=async()=>({friends:[],incoming:[],outgoing:[]});`
  }));
  await page.route(/\/src\/utils\/eventTeam\.js(?:\?.*)?$/, route => route.fulfill({
    contentType: 'text/javascript',
    body: `export const getMyEventTeams=async()=>({invitations:${empty} ? [] : [{eventId:'team-test'}]});`
  }));
}
test('dashboard prioritises next plan, invitations and saved events without duplicate sections', async ({
  page
}, testInfo) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await fixture(page);
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.goto('/');
  await expect(page.getByRole('heading', {
    level: 1,
    name: 'Dina'
  })).toBeVisible();
  await expect(page.getByText('1 co-organiser invitation', {
    exact: true
  })).toBeVisible();
  await expect(page.getByText('Tomorrow', {
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('link', {
    name: 'View ticket',
    exact: true
  })).toHaveAttribute('href', '/events/next-test/ticket');
  await expect(page.getByRole('link', {
    name: /Saved weekend idea/
  })).toHaveAttribute('href', '/events/saved-test/rsvp');
  await expect(page.locator('.dash-stat')).toHaveCount(3);
  await expect(page.getByRole('heading', {
    name: 'Your interests',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('heading', {
    name: 'Friends',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('heading', {
    name: 'Events you run',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('link', {
    name: /Hosted event/
  })).toHaveAttribute('href', '/organiser/events/hosted-test/manage');
  await expect(page.getByText('Group is not a hosted event', {
    exact: true
  })).toHaveCount(0);
  await expect(page.locator('.dash-links')).toHaveCount(0);
  await expect(page.getByText('dashboard@example.invalid', {
    exact: true
  })).toHaveCount(0);
  for (const scheme of ['light', 'dark']) {
    await page.evaluate(async value => {
      const {
        setTheme
      } = await import('/src/lib/theme.js');
      setTheme(value);
    }, scheme);
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      await expect(page.locator('main')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 375 || width === 1280) await page.screenshot({
        path: testInfo.outputPath(`dashboard-${scheme}-${width}.png`),
        fullPage: true
      });
    }
  }
  expect(errors).toEqual([]);
});
test('empty dashboard has a clear next step and retries partial updates', async ({
  page
}) => {
  await fixture(page, {
    empty: true,
    failed: true
  });
  await page.goto('/');
  await expect(page.getByText('Nothing confirmed yet. Find something to do this week.', {
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('heading', {
    name: 'Needs you',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('heading', {
    name: 'Your groups',
    exact: true
  })).toHaveCount(0);
  await page.evaluate(() => {
    window.dashboardRecovered = true;
  });
  await page.getByRole('button', {
    name: 'Retry updates',
    exact: true
  }).click();
  await expect(page.getByText('Some dashboard updates couldn’t load.', {
    exact: false
  })).toHaveCount(0);
  await expect(page.getByRole('link', {
    name: 'Explore events',
    exact: true
  })).toHaveAttribute('href', '/discover');
});
