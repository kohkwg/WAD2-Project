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
`
test.beforeEach(async ({ page }) => {
  await page.route(/\/src\/utils\/api(?:\.js)?(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: apiSource }))
  await page.route(/\/src\/utils\/floorPlan(?:\.js)?(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: fixture }))
  await page.route('**/*.supabase.co/**', route => route.abort())
})
test('programme retries, helper keyboard persistence and responsive canvas', async ({ page }) => {
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
  await page.reload()
  await expect(helpers.getByLabel('X', { exact: true })).toHaveValue('250')
  await expect(page.getByRole('heading', { name: 'Opening', exact: true })).toBeVisible()
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
  await expect(page.getByRole('group', { name: 'Elements on this plan' }).getByRole('button', { name: 'New Box 1' })).toBeVisible()
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible()
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

// ---- Canva-style canvas: toolbar, selection, in-place rename, keyboard ----
const stageNode = (page, selector, read) => page.locator('.konvajs-content').evaluate((element, [selector, read]) => {
  let component = element.parentElement.__vueParentComponent
  while (component && !component.exposed?.getNode && !component.exposed?.getStage) component = component.parent
  const stage = component.exposed.getNode?.() || component.exposed.getStage()
  const node = stage.findOne(selector)
  if (!node) return null
  return read === 'rect' ? node.getClientRect({ skipStroke: true, skipShadow: true }) : { x: node.x(), y: node.y() }
}, [selector, read])
async function doubleClickNode(page, selector) {
  const frame = await page.locator('.konvajs-content').boundingBox()
  const rect = await stageNode(page, selector, 'rect')
  // Konva redraws its click-detection layer on the next frame; wait so new items can be hit
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.mouse.dblclick(frame.x + rect.x + rect.width / 2, frame.y + rect.y + rect.height / 2)
}
const elements = page => page.getByRole('group', { name: 'Elements on this plan' })
const selection = page => page.getByRole('group', { name: 'Selected element' })

test('the canvas is full width with a toolbar and no plan-zones panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/organiser/events/e1/floor-plan')
  await expect(page.getByRole('button', { name: 'Add box', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add person', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lock layout canvas' })).toBeVisible()
  await expect(page.getByText('Plan zones')).toHaveCount(0)
  await expect(page.getByText('Free markers')).toHaveCount(0)
  await expect.poll(async () => (await page.locator('.konvajs-content').boundingBox()).width).toBeGreaterThan(900)
  const canvas = await page.locator('.editor-shell').boundingBox()
  const helpers = await page.getByRole('region', { name: 'Team helper placements' }).boundingBox()
  expect(helpers.y).toBeGreaterThan(canvas.y + canvas.height - 1) // helper placements sit below the canvas
})

test('new elements start selected and their settings are editable', async ({ page }) => {
  await page.goto('/organiser/events/e1/floor-plan')
  await expect(selection(page)).toContainText('Select a box or person')
  await page.getByRole('button', { name: 'Add box', exact: true }).click()
  await expect(selection(page).getByLabel('Name', { exact: true })).toHaveValue('New Box 1')
  await selection(page).getByLabel('Name', { exact: true }).fill('Registration')
  await expect(elements(page).getByRole('button', { name: 'Registration' })).toHaveAttribute('aria-pressed', 'true')
  await selection(page).getByRole('button', { name: /^Use colour #9b51e0/ }).click()
  await expect(selection(page).getByRole('button', { name: /^Use colour #9b51e0/ })).toHaveAttribute('aria-pressed', 'true')
  await selection(page).getByLabel('Width', { exact: true }).fill('200')
  await selection(page).getByLabel('Width', { exact: true }).press('Tab')
  const canvasWidth = (await page.locator('.konvajs-content').boundingBox()).width
  await expect.poll(async () => Math.round((await stageNode(page, '.box-group', 'rect')).width)).toBe(Math.round(200 * canvasWidth / 900))
  await page.getByRole('button', { name: 'Add person', exact: true }).click()
  await expect(selection(page).getByLabel('Name', { exact: true })).toHaveValue('Person 1')
  await selection(page).getByRole('combobox', { name: /^Role/ }).selectOption('Organiser')
  await selection(page).getByRole('button', { name: 'Remove Person 1' }).click()
  await expect(elements(page).getByRole('button', { name: 'Person 1' })).toHaveCount(0)
  await expect(selection(page)).toContainText('Select a box or person')
})

test('double-clicking a box or person renames it in place', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/organiser/events/e1/floor-plan')
  await page.getByRole('button', { name: 'Add box', exact: true }).click()
  await page.locator('.konvajs-content').scrollIntoViewIfNeeded()
  await doubleClickNode(page, '.box-group')
  const editor = page.getByLabel('Box name', { exact: true })
  await expect(editor).toBeVisible()
  await expect(editor).toBeFocused()
  await editor.fill('Main Stage')
  await editor.press('Enter')
  await expect(editor).toHaveCount(0)
  await expect(elements(page).getByRole('button', { name: 'Main Stage' })).toBeVisible()
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()

  await doubleClickNode(page, '.box-group')
  await page.getByLabel('Box name', { exact: true }).fill('Nope')
  await page.getByLabel('Box name', { exact: true }).press('Escape')
  await expect(elements(page).getByRole('button', { name: 'Main Stage' })).toBeVisible()

  await doubleClickNode(page, '.box-group')
  await page.getByLabel('Box name', { exact: true }).fill('   ')
  await page.getByLabel('Box name', { exact: true }).press('Enter')
  await expect(elements(page).getByRole('button', { name: 'Main Stage' })).toBeVisible() // empty keeps the old name

  await page.getByRole('button', { name: 'Add person', exact: true }).click()
  await doubleClickNode(page, '.name-text')
  const personEditor = page.getByLabel('Person name', { exact: true })
  await expect(personEditor).toBeVisible()
  await personEditor.fill('Alex')
  await page.locator('.konvajs-content').click({ position: { x: 5, y: 5 } }) // clicking away commits
  await expect(elements(page).getByRole('button', { name: 'Alex' })).toBeVisible()
})

test('elements can be selected, nudged, deselected and deleted from the keyboard', async ({ page }) => {
  await page.goto('/organiser/events/e1/floor-plan')
  await page.getByRole('button', { name: 'Add box', exact: true }).click()
  await page.getByRole('button', { name: 'Add box', exact: true }).click()
  const second = elements(page).getByRole('button', { name: 'New Box 2' })
  const first = elements(page).getByRole('button', { name: 'New Box 1' })
  await expect(second).toHaveAttribute('aria-pressed', 'true')
  await first.click()
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await expect(second).toHaveAttribute('aria-pressed', 'false')
  const before = await stageNode(page, '.box-group', 'pos')
  await first.press('ArrowRight')
  await first.press('Shift+ArrowDown')
  await expect.poll(() => stageNode(page, '.box-group', 'pos')).toEqual({ x: before.x + 5, y: before.y + 20 })
  await first.press('Escape')
  await expect(first).toHaveAttribute('aria-pressed', 'false')
  await expect(selection(page)).toContainText('Select a box or person')
  await first.click()
  await first.press('Delete')
  await expect(first).toHaveCount(0)
  await expect(second).toBeVisible()
})

test('a locked canvas cannot be edited', async ({ page }) => {
  await page.goto('/organiser/events/e1/floor-plan')
  await page.getByRole('button', { name: 'Add box', exact: true }).click()
  await page.locator('.konvajs-content').scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Lock layout canvas' }).click()
  await expect(page.getByRole('button', { name: 'Add box', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add person', exact: true })).toBeDisabled()
  await doubleClickNode(page, '.box-group')
  await expect(page.getByLabel('Box name', { exact: true })).toHaveCount(0)
  await expect(elements(page).getByRole('button', { name: 'New Box 1' })).toBeDisabled()
})

test('the selection bar never moves the canvas, and sits below it under 1200px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/organiser/events/e1/floor-plan')
  const top = async () => (await page.locator('.konvajs-content').boundingBox()).y
  const idle = await top()
  await page.getByRole('button', { name: 'Add box', exact: true }).click()
  expect(await top()).toBe(idle)
  for (const width of [1100, 768, 375]) {
    await page.setViewportSize({ width, height: 900 })
    const canvas = await page.locator('.konvajs-content').boundingBox()
    const bar = await selection(page).boundingBox()
    expect(bar.y, `bar below canvas at ${width}px`).toBeGreaterThan(canvas.y + canvas.height - 1)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('new boxes and people are placed clear of each other', async ({ page }) => {
  await page.goto('/organiser/events/e1/floor-plan')
  for (const name of ['Add box', 'Add box', 'Add person', 'Add box', 'Add person', 'Add box']) {
    await page.getByRole('button', { name, exact: true }).click()
  }
  const rects = await page.locator('.konvajs-content').evaluate(element => {
    let component = element.parentElement.__vueParentComponent
    while (component && !component.exposed?.getNode && !component.exposed?.getStage) component = component.parent
    const stage = component.exposed.getNode?.() || component.exposed.getStage()
    return [...stage.find('.box-group'), ...stage.find('.person-group')].map(node => node.getClientRect({ skipStroke: true, skipShadow: true }))
  })
  expect(rects).toHaveLength(6)
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j]
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
      expect(apart, `item ${i} and ${j} overlap`).toBe(true)
    }
  }
})
