import { test, expect } from '@playwright/test';
import { setColorTheme } from './support/colorTheme.js';

// these checks expect the expanded sidebar. from 992px the sidebar starts as an icon rail
// unless someone expanded it, so start from that remembered choice.
test.beforeEach(async ({
  page
}) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('dino-sidebar', 'expanded');
    } catch {/* storage blocked */}
  });
});

async function fixture(page, unavailable = false) {
  await page.route(/\/src\/utils\/eventTeam\.js(?:\?.*)?$/, route => route.fulfill({
    contentType: 'text/javascript',
    body: `
    export const USING_SUPABASE = true;
    export const teamRoleLabel = ()=> 'Co-organiser';
    const pending=[];
    const invitations=[{eventId:'invited-1',title:'Team outing',role:'organiser',ownerName:'Owner'},{eventId:'invited-2',title:'Another event',role:'organiser',ownerName:'Owner'}];
    const teams=[];
    let failed=false;
    export async function getEventTeam() {if(${unavailable})throw new Error('Event team invitations are not available yet. Your other tools are still available.');return structuredClone({isOwner:true,members:[{id:'owner',displayName:'Owner',username:'owner',role:'organiser',isOwner:true}],pending});}
    export async function searchTeamPeople(_id,query) {return query.startsWith('ali')?[{id:'alice',displayName:'Alice',username:'alice'}]:[];}
    export async function inviteTeamMember(_id,id,role) {
      window.invitedTeamRole='organiser'; role='organiser';
      if(!failed){failed=true;throw new Error('Connection failed. Please retry.');}
      if(!pending.some(p=>p.id===id))pending.push({id,displayName:'Alice',username:'alice',role});
    }
    export async function getMyEventTeams(){return structuredClone({invitations,teams});}
    export async function respondToTeamInvite(id,accept){if(accept&&window.teamHasRsvp)throw new Error('Cancel your attendee RSVP before joining this event team.');const i=invitations.findIndex(p=>p.eventId===id);if(i>=0){const [row]=invitations.splice(i,1);if(accept)teams.push(row);}}
  `
  }));
}
test('pending database setup leaves other Manage event tools available', async ({
  page
}) => {
  await fixture(page, true);
  await page.goto('/organiser/events/e-weather-demo/manage?tab=team');
  await expect(page.getByRole('alert')).toContainText('Event team invitations are not available yet');
  const nav = page.getByRole('navigation', {
    name: 'Event tools'
  });
  await nav.getByRole('button', {
    name: /^Planning/
  }).click();
  await nav.getByRole('link', {
    name: 'Tasks',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: 'Tasks',
    exact: true
  })).toBeVisible();
});
test('Organise shows only pending invitation notices and removes resolved notices', async ({
  page
}) => {
  await fixture(page);
  await page.goto('/organiser/events');
  const panel = page.getByRole('region', {
    name: 'Team invitations',
    exact: true
  });
  await expect(panel.getByRole('heading')).toHaveCount(0);
  await expect(panel.getByRole('button', {
    name: /Accept team invitation/
  })).toHaveCount(2);
  await panel.getByRole('button', {
    name: 'Accept team invitation to Team outing',
    exact: true
  }).click();
  await expect(panel.getByRole('button', {
    name: /Accept team invitation/
  })).toHaveCount(1);
  await expect(panel.getByRole('link', {
    name: 'Floor plan',
    exact: true
  })).toHaveCount(0);
  await panel.getByRole('button', {
    name: 'Decline team invitation to Another event',
    exact: true
  }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByText('No event team invitations.', {
    exact: true
  })).toHaveCount(0);
  for (const width of [375, 575, 768, 1280]) {
    await page.setViewportSize({
      width,
      height: 1000
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('main')).toHaveCount(1);
  }
});
