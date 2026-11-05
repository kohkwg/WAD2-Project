import { test, expect } from '@playwright/test';
import { setColorTheme } from './support/colorTheme.js';

// these checks expect the expanded sidebar. from 992px the sidebar starts as an icon rail
// unless someone expanded it (docs/decisions.md, 5 november), so start from that remembered choice.
test.beforeEach(async ({
  page
}) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('bookedz-sidebar', 'expanded');
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
test('owner invites a co-organiser from General with retry and retained choices', async ({
  page
}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await fixture(page);
  await page.goto('/organiser/events/e-weather-demo/manage?tab=tasks');
  const nav = page.getByRole('navigation', {
    name: 'Event tools'
  });
  await nav.getByRole('button', {
    name: /^General/
  }).click();
  await nav.getByRole('link', {
    name: 'Event team',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: 'Event team',
    exact: true
  })).toBeVisible();
  await page.getByLabel('Find by username', {
    exact: true
  }).fill('alice');
  await page.getByRole('button', {
    name: 'Find people',
    exact: true
  }).click();
  const invite = page.getByRole('button', {
    name: 'Invite @alice',
    exact: true
  });
  await invite.click();
  await expect(page.getByRole('alert')).toContainText('Connection failed');
  await expect(page.getByLabel('Invite as', {
    exact: true
  })).toHaveCount(0);
  await invite.click();
  await expect(page.getByRole('status')).toHaveText('Invitation sent to @alice.');
  await expect(invite).toBeDisabled();
  await page.getByRole('status').getByRole('button', {
    name: 'Dismiss notification',
    exact: true
  }).click();
  await expect(page.getByText('Invitation sent to @alice.', {
    exact: true
  })).toBeHidden();
  await expect(page.getByLabel('Find by username', {
    exact: true
  })).toHaveValue('alice');
  expect(await page.evaluate(() => window.invitedTeamRole)).toBe('organiser');
  for (const scheme of ['light', 'dark']) {
    await setColorTheme(page, scheme);
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({
        width,
        height: 1000
      });
      await expect(page.locator('main')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await nav.getByRole('button', {
    name: /^Planning/
  }).click();
  await nav.getByRole('link', {
    name: 'Tasks',
    exact: true
  }).click();
  await nav.getByRole('button', {
    name: /^General/
  }).click();
  await nav.getByRole('link', {
    name: 'Event team',
    exact: true
  }).click();
  await expect(page.getByLabel('Find by username', {
    exact: true
  })).toHaveValue('alice');
  expect(errors).toEqual([]);
});
test('recipient accepts and declines in Community and gets role-appropriate links', async ({
  page
}) => {
  await fixture(page);
  await page.goto('/community');
  const panel = page.getByRole('region', {
    name: 'Your event teams',
    exact: true
  });
  await panel.getByRole('button', {
    name: 'Accept team invitation to Team outing',
    exact: true
  }).click();
  await expect(panel.getByRole('status')).toHaveText('You joined the team for Team outing.');
  await expect(panel.getByRole('status')).toBeFocused();
  await expect(panel.getByRole('status').getByRole('link', {
    name: 'Team outing',
    exact: true
  })).toHaveAttribute('href', '/organiser/events/invited-1/manage?tab=tasks');
  await expect(panel.getByRole('link', {
    name: 'Check-in station',
    exact: true
  })).toHaveAttribute('href', '/organiser/events/invited-1/check-in');
  await expect(panel.getByRole('link', {
    name: 'Manage RSVPs',
    exact: true
  })).toBeVisible();
  await expect(panel.getByRole('link', {
    name: 'Floor plan',
    exact: true
  })).toBeVisible();
  await panel.getByRole('button', {
    name: 'Decline team invitation to Another event',
    exact: true
  }).click();
  await expect(panel.getByText('No event team invitations.', {
    exact: true
  })).toBeVisible();
});
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
test('RSVP conflict links directly to cancellation controls in Plans', async ({
  page
}) => {
  await fixture(page);
  await page.goto('/organiser/events');
  await page.evaluate(() => {
    window.teamHasRsvp = true;
  });
  const panel = page.getByRole('region', {
    name: 'Team invitations',
    exact: true
  });
  await panel.getByRole('button', {
    name: 'Accept team invitation to Team outing',
    exact: true
  }).click();
  const link = panel.getByRole('link', {
    name: 'Go to Plans to cancel',
    exact: true
  });
  await expect(link).toHaveAttribute('href', '/my-rsvps');
  await expect(panel.getByText('After cancelling, come back and accept this invitation.', {
    exact: true
  })).toBeVisible();
  await expect(panel.getByRole('button', {
    name: 'Accept team invitation to Team outing',
    exact: true
  })).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/my-rsvps$/);
  await expect(page.getByRole('heading', {
    name: 'Plans',
    exact: true
  })).toBeVisible();
});
test('accepted co-organiser event names link to Manage event', async ({
  page
}) => {
  await fixture(page);
  await page.goto('/community');
  const panel = page.getByRole('region', {
    name: 'Your event teams',
    exact: true
  });
  await panel.getByRole('button', {
    name: 'Accept team invitation to Another event',
    exact: true
  }).click();
  const links = panel.getByRole('link', {
    name: 'Another event',
    exact: true
  });
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) await expect(link).toHaveAttribute('href', '/organiser/events/invited-2/manage?tab=tasks');
  await links.first().focus();
  await expect(links.first()).toBeFocused();
  await expect(panel.getByRole('link', {
    name: 'Manage RSVPs',
    exact: true
  })).toBeVisible();
});
