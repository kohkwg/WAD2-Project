// Feature 6 UI contract tests with isolated browser-local persistence, never hosted writes.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const apiSource = readFileSync(new URL('../src/utils/api.js', import.meta.url), 'utf8')
  .replace(/export const USING_SUPABASE = .*/, 'export const USING_SUPABASE = true')
  .replace(/const backend = .*/, 'const backend = mockApi')
  .replace(/const operationsBackend = .*/, 'const operationsBackend = mockApi')
  .replace(/const weatherBackend = .*/, 'const weatherBackend = mockApi')
const fixture = `
const read = (eid) => JSON.parse(localStorage.getItem('f6-' + eid) || '{"plan":null,"programme":[],"helpers":[],"images":[]}');
const write = (eid, row) => localStorage.setItem('f6-' + eid, JSON.stringify(row));
export const canEditFloorPlan = async () => true;
export const getFloorPlan = async eid => { if(eid === 'e2' && sessionStorage.getItem('delay-e2')) await new Promise(resolve=>setTimeout(()=>{window.__f6LateDone=true;resolve()},500)); return read(eid).plan; };
export const saveFloorPlan = async (eid, input) => { const state = read(eid); state.plan = {id:'plan-'+eid, layout:input}; write(eid,state); return state.plan; };
export const getProgramme = async eid => read(eid).programme;
export const saveProgrammeItem = async (eid,input) => { if (sessionStorage.getItem('fail-programme')) { sessionStorage.removeItem('fail-programme'); throw Error('Programme save failed. Retry.'); } const state=read(eid); const item={...input,id:input.id || crypto.randomUUID()}; state.programme=[...state.programme.filter(x=>x.id!==item.id),item];write(eid,state);return item; };
export const deleteProgrammeItem = async (eid,id) => {const state=read(eid);state.programme=state.programme.filter(x=>x.id!==id);write(eid,state);return {id};};
export const getPlanMembers = async () => [{user_id:'real-member', member_role:'helper',profiles:{display_name:'Test Helper'}}];
export const getHelperPlacements = async eid => read(eid).helpers;
export const saveHelperPlacement = async (eid,input) => {if(input.id) await new Promise(resolve=>setTimeout(resolve,150));const state=read(eid); const item={...input,id:input.id || crypto.randomUUID()};state.helpers=[...state.helpers.filter(x=>x.id!==item.id),item];write(eid,state);return item;};
export const deleteHelperPlacement = async(eid,id)=>{const state=read(eid);state.helpers=state.helpers.filter(x=>x.id!==id);write(eid,state);};
export const getFloorImages = async eid => { const rows=read(eid).images; if(sessionStorage.getItem('delay-images')) await new Promise(resolve=>window.__releaseImages=resolve); return rows; };
export const saveFloorImage = async(eid,pid,input)=>{const state=read(eid);const item={...input,id:input.id || 'image',floor_plan_id:pid};state.images=[item];write(eid,state);return item;};
export const floorImageRequest = async(path) => { if (!path && sessionStorage.getItem('delay-ticket')) {await new Promise(resolve=>window.__releaseTicket=resolve);window.__ticketResolved=true;} return path ? {publicUrl:'/f6.png'} : {uploadUrl:'/f6-upload',publicUrl:'/f6.png',key:'floorplans/key'}; };
`
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
test.beforeEach(async ({ page }) => {
  await page.route(/\/src\/utils\/api(?:\.js)?(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: apiSource }))
  await page.route(/\/src\/utils\/floorPlan(?:\.js)?(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: fixture }))
  await page.route('**/f6-upload', route => route.fulfill({ status: 200 }))
  await page.route('**/f6.png', route => route.fulfill({ contentType: 'image/png', body: png }))
  await page.route('**/*.supabase.co/**', route => route.abort())
})
test('programme retries, helper keyboard persistence, public image upload and responsive canvas', async ({ page }) => {
  const warnings = []
  page.on('pageerror', error => warnings.push(error.message))
  page.on('console', message => { if (/Extraneous|dragend/.test(message.text())) warnings.push(message.text()) })
  await page.goto('/organiser/events/e1/floor-plan')
  await page.getByRole('button', { name: 'Add box', exact: true }).click()
  await page.getByRole('button', { name: 'Save floor plan', exact: true }).click()
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible()
  const canvas = page.locator('.konvajs-content')
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox(), scale = box.width / 900
  await page.mouse.move(box.x + 100 * scale, box.y + 85 * scale)
  await page.mouse.down()
  await page.mouse.move(box.x + 230 * scale, box.y + 165 * scale, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save floor plan', exact: true }).click()
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible()
  await page.getByLabel('Team member', { exact: true }).selectOption('real-member')
  await page.getByRole('button', { name: 'Add helper', exact: true }).click()
  const helpers = page.getByRole('region', { name: 'Team helper placements' })
  await helpers.getByLabel('X', { exact: true }).fill('250')
  await helpers.getByLabel('Y', { exact: true }).fill('200')
  await page.getByRole('button', { name: 'Save helper positions' }).click()
  await expect(page.getByText('Helper positions saved.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save helper positions' })).toBeDisabled()
  await page.getByRole('button', { name: 'Add programme item' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Opening')
  await page.getByLabel('Starts (Singapore)').fill('2026-11-01T09:00')
  await page.getByLabel('Floor-plan zone').selectOption({ index: 1 })
  await page.evaluate(() => sessionStorage.setItem('fail-programme', 'true'))
  await page.getByRole('button', { name: 'Save programme item' }).click()
  await expect(page.getByRole('alert')).toContainText('Programme save failed')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Opening')
  await page.getByRole('button', { name: 'Save programme item' }).click()
  await expect(page.getByRole('heading', { name: 'Opening', exact: true })).toBeVisible()
  await page.getByLabel('Public finished floor-plan image').setInputFiles({ name: 'finished.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByText('Public floor-plan image saved.')).toBeVisible()
  await expect(page.getByAltText('finished.png')).toBeVisible()
  await page.reload()
  await expect(helpers.getByLabel('X', { exact: true })).toHaveValue('250')
  await expect(page.getByRole('heading', { name: 'Opening', exact: true })).toBeVisible()
  await expect(page.getByAltText('finished.png')).toBeVisible()
  for (const width of [375, 575, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator('main')).toHaveCount(1)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect.poll(async () => (await page.locator('.konvajs-content').boundingBox()).width <= width).toBe(true)
  }
  expect(warnings).toEqual([])
})

test('reused event route ignores a late previous-event floor plan', async ({ page }) => {
  await page.goto('/organiser/events/e1/floor-plan')
  await page.getByRole('button', { name: 'Add box', exact: true }).click()
  await page.getByRole('button', { name: 'Save floor plan', exact: true }).click()
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible()
  await page.evaluate(async () => {
    sessionStorage.setItem('delay-e2', '1')
    const { default: router } = await import('/src/router/index.js')
    await router.push('/organiser/events/e2/floor-plan')
    await router.push('/organiser/events/e1/floor-plan')
  })
  await expect.poll(() => page.evaluate(() => Boolean(window.__f6LateDone))).toBe(true)
  await expect(page.getByLabel('Box name: New Box 1')).toHaveValue('New Box 1')
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible()
})

test('image uploads wait for the existing asset and reuse its row', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('delay-images', '1')
    localStorage.setItem('f6-e1', JSON.stringify({ plan: { id: 'plan-e1', layout: { objects: [], people: [] } }, programme: [], helpers: [], images: [{ id: 'existing-image', floor_plan_id: 'plan-e1', name: 'previous.png' }] }))
  })
  await page.goto('/organiser/events/e1/floor-plan')
  await expect(page.getByText('Loading floor-plan images…')).toBeVisible()
  const input = page.getByLabel('Public finished floor-plan image')
  await expect(input).toBeDisabled()
  await page.evaluate(() => window.__releaseImages())
  await expect(input).toBeEnabled()
  await input.setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByText('Public floor-plan image saved.')).toBeVisible()
  await expect(page.getByAltText('replacement.png')).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('f6-e1')).images[0].id)).toBe('existing-image')
})

test('leaving the editor while the image ticket is pending prevents upload', async ({ page }) => {
  let uploads = 0
  await page.route('**/f6-upload', route => { uploads++; return route.fulfill({ status: 200 }) })
  await page.goto('/organiser/events/e1/floor-plan')
  await page.getByRole('button', { name: 'Add box', exact: true }).click()
  await page.getByRole('button', { name: 'Save floor plan', exact: true }).click()
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible()
  await page.evaluate(() => sessionStorage.setItem('delay-ticket', '1'))
  await page.getByLabel('Public finished floor-plan image').setInputFiles({ name: 'leaving.png', mimeType: 'image/png', buffer: png })
  await expect.poll(() => page.evaluate(() => Boolean(window.__releaseTicket))).toBe(true)
  await page.evaluate(async () => {
    const { default: router } = await import('/src/router/index.js')
    await router.push('/events')
    window.__releaseTicket()
  })
  await expect.poll(() => page.evaluate(() => Boolean(window.__ticketResolved))).toBe(true)
  expect(uploads).toBe(0)
})

test('dragging a node already at the boundary clamps its canvas position', async ({ page }) => {
  await page.goto('/organiser/events/e1/floor-plan')
  await page.getByRole('button', { name: 'Add box', exact: true }).click()
  await page.getByRole('button', { name: 'Save floor plan', exact: true }).click()
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible()
  await page.getByLabel('Team member', { exact: true }).selectOption('real-member')
  await page.getByRole('button', { name: 'Add helper', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove helper Test Helper' })).toBeVisible()
  const positions = await page.locator('.konvajs-content').evaluate(element => {
    let component = element.parentElement.__vueParentComponent
    while (component && !component.exposed?.getNode && !component.exposed?.getStage) component = component.parent
    const stage = component.exposed.getNode?.() || component.exposed.getStage()
    const node = stage.find('Group')[0]
    node.position({ x: -500, y: 20 }); node.fire('dragend', { target: node })
    const first = node.position()
    // The model is now already x=20/y=20; a second off-stage drag must also reset
    // the imperative node even though Vue sees no new coordinate value.
    node.position({ x: -500, y: 20 }); node.fire('dragend', { target: node })
    const second = node.position()
    const helper = stage.find('Group')[1]
    helper.position({ x: -500, y: 40 }); helper.fire('dragend', { target: helper })
    const helperFirst = helper.position()
    helper.position({ x: -500, y: 40 }); helper.fire('dragend', { target: helper })
    return { first, second, helperFirst, helperSecond: helper.position() }
  })
  expect(positions).toEqual({ first: { x: 20, y: 20 }, second: { x: 20, y: 20 }, helperFirst: { x: 40, y: 40 }, helperSecond: { x: 40, y: 40 } })
})
