// feature 6 ui contract tests with isolated browser-local persistence, never hosted writes.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const apiSource = readFileSync(new URL('../src/utils/api.js', import.meta.url), 'utf8').replace(/export const USING_SUPABASE = .*/, 'export const USING_SUPABASE = true').replace(/const backend = .*/, 'const backend = mockApi').replace(/const operationsBackend = .*/, 'const operationsBackend = mockApi').replace(/const weatherBackend = .*/, 'const weatherBackend = mockApi');
const fixture = `
const read = (eid) => JSON.parse(localStorage.getItem('f6-' + eid) || '{"plan":null,"programme":[],"helpers":[],"images":[]}');
const write = (eid, row) => localStorage.setItem('f6-' + eid, JSON.stringify(row));
export const canEditFloorPlan = async () => true;
export const getFloorPlans = async eid => { if(eid === 'e2' && sessionStorage.getItem('delay-e2')) await new Promise(resolve=>setTimeout(()=>{window.__f6LateDone=true;resolve()},500)); const plan = read(eid).plan; return plan ? [plan] : []; };
export const uploadPlanBackground = async () => { throw Error('Backgrounds are not part of this fixture.'); };
export const deleteFloorAsset = async () => ({});
export const saveFloorPlan = async (eid, input) => { const state = read(eid); state.plan = {id:'plan-'+eid, name:input.name, width:input.width, height:input.height, layout:{version:1, objects:input.objects, people:input.people, locked:input.locked, venue:input.venue, background:input.background}}; write(eid,state); return state.plan; };
export const getProgramme = async eid => read(eid).programme;
export const saveProgrammeItem = async (eid,input) => { if (sessionStorage.getItem('fail-programme')) { sessionStorage.removeItem('fail-programme'); throw Error('Programme save failed. Retry.'); } const state=read(eid); const item={...input,id:input.id || crypto.randomUUID()}; state.programme=[...state.programme.filter(x=>x.id!==item.id),item];write(eid,state);return item; };
export const deleteProgrammeItem = async (eid,id) => {const state=read(eid);state.programme=state.programme.filter(x=>x.id!==id);write(eid,state);return {id};};
export const getPlanMembers = async () => [{user_id:'real-member', member_role:'helper',profiles:{display_name:'Test Helper'}}];
export const getHelperPlacements = async eid => read(eid).helpers;
export const saveHelperPlacement = async (eid,input) => {if(input.id) await new Promise(resolve=>setTimeout(resolve,150));const state=read(eid); const item={...input,id:input.id || crypto.randomUUID()};state.helpers=[...state.helpers.filter(x=>x.id!==item.id),item];write(eid,state);return item;};
export const deleteHelperPlacement = async(eid,id)=>{const state=read(eid);state.helpers=state.helpers.filter(x=>x.id!==id);write(eid,state);};
`;
test.beforeEach(async ({
  page
}) => {
  await page.route(/\/src\/utils\/api(?:\.js)?(?:\?.*)?$/, route => route.fulfill({
    contentType: 'text/javascript',
    body: apiSource
  }));
  await page.route(/\/src\/utils\/floorPlan(?:\.js)?(?:\?.*)?$/, route => route.fulfill({
    contentType: 'text/javascript',
    body: fixture
  }));
  await page.route('**/*.supabase.co/**', route => route.abort());
});
test('reused event route ignores a late previous-event floor plan', async ({
  page
}) => {
  await page.goto('/organiser/events/e1/floor-plan');
  await page.getByRole('button', {
    name: 'Add box',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: 'Save floor plan',
    exact: true
  }).click();
  await expect(page.getByText('Saved.', {
    exact: true
  })).toBeVisible();
  await page.evaluate(async () => {
    sessionStorage.setItem('delay-e2', '1');
    const {
      default: router
    } = await import('/src/router/index.js');
    await router.push('/organiser/events/e2/floor-plan');
    await router.push('/organiser/events/e1/floor-plan');
  });
  await expect.poll(() => page.evaluate(() => Boolean(window.__f6LateDone))).toBe(true);
  await expect(page.getByRole('group', {
    name: 'Elements on this plan'
  }).getByRole('button', {
    name: 'New Box 1'
  })).toBeVisible();
  await expect(page.getByText('All changes saved', {
    exact: true
  })).toBeVisible();
});

// ---- canva-style canvas: toolbar, selection, in-place rename, keyboard ----
const stageNode = (page, selector, read) => page.locator('.konvajs-content').evaluate((element, [selector, read]) => {
  let component = element.parentElement.__vueParentComponent;
  while (component && !component.exposed?.getNode && !component.exposed?.getStage) component = component.parent;
  const stage = component.exposed.getNode?.() || component.exposed.getStage();
  const node = stage.findOne(selector);
  if (!node) return null;
  return read === 'rect' ? node.getClientRect({
    skipStroke: true,
    skipShadow: true
  }) : {
    x: node.x(),
    y: node.y()
  };
}, [selector, read]);
async function doubleClickNode(page, selector) {
  const frame = await page.locator('.konvajs-content').boundingBox();
  const rect = await stageNode(page, selector, 'rect');
  // konva redraws its click-detection layer on the next frame; wait so new items can be hit
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.mouse.dblclick(frame.x + rect.x + rect.width / 2, frame.y + rect.y + rect.height / 2);
}
const elements = page => page.getByRole('group', {
  name: 'Elements on this plan'
});
const selection = page => page.getByRole('group', {
  name: 'Selected element'
});
