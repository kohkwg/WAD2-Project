import { test, expect } from '@playwright/test'

// These checks use the theme dropdown in the expanded sidebar; from 992px the sidebar starts as an icon rail
// unless someone expanded it (docs/decisions.md, 5 November), so start from that remembered choice.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('bookedz-sidebar', 'expanded') } catch { /* storage blocked */ } }) })

test('inline notices dismiss by keyboard, retain actions and reappear for changed/repeated messages', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.goto('/organiser/events/e-weather-demo/manage?tab=tasks')
  await page.evaluate(async()=>{
    const {h,render,ref,nextTick}=await import('/node_modules/.vite/deps/vue.js')
    const {dismissibleNotice}=await import('/src/directives/dismissibleNotice.js')
    const {withDirectives}=await import('/node_modules/.vite/deps/vue.js')
    const host=document.createElement('div');host.id='notice-fixture';document.querySelector('main').append(host)
    const message=ref('Saved changes.'), tone=ref('success'), count=ref(0)
    window.notificationFixture={message,tone,count,nextTick}
    render(h({setup(){return()=>h('div',[
      message.value?withDirectives(h('div',{class:`alert alert-${tone.value}`,role:'status'},[
        message.value,h('button',{type:'button',onClick:()=>count.value++},'Retry action')
      ]),[[dismissibleNotice]]):null,
      h('input',{value:'Draft stays', 'aria-label':'Example draft'}),
      h('button',{type:'button'},'Next control'),
    ])}}),host)
  })
  const fixture=page.locator('#notice-fixture')
  for(const scheme of ['light','dark']){
    await page.getByLabel('Color theme').selectOption(scheme)
    for(const width of [375,575,768,1280]){
      await page.setViewportSize({width,height:1000})
      const button=fixture.getByRole('button',{name:'Dismiss notification',exact:true})
      const box=await button.boundingBox()
      expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44)
      expect(await fixture.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
    }
  }
  await fixture.getByRole('button',{name:'Retry action',exact:true}).click()
  expect(await page.evaluate(()=>window.notificationFixture.count.value)).toBe(1)
  const dismiss=fixture.getByRole('button',{name:'Dismiss notification',exact:true})
  await dismiss.focus();await page.keyboard.press('Enter')
  await expect(fixture.getByRole('status')).toHaveCount(0)
  await expect(fixture.getByLabel('Example draft')).toBeFocused()
  await expect(fixture.getByLabel('Example draft')).toHaveValue('Draft stays')
  await page.evaluate(()=>{window.notificationFixture.message.value='A different message.';window.notificationFixture.tone.value='danger'})
  await expect(fixture.getByRole('status')).toBeVisible()
  await expect(fixture.getByRole('button',{name:'Dismiss notification',exact:true})).toHaveCount(1)
  await fixture.getByRole('button',{name:'Dismiss notification',exact:true}).click()
  await page.evaluate(async()=>{const f=window.notificationFixture;f.message.value='';await f.nextTick();f.message.value='A different message.'})
  await expect(fixture.getByRole('status')).toBeVisible()
  await expect(fixture.getByRole('button',{name:'Dismiss notification',exact:true})).toHaveCount(1)
  expect(errors).toEqual([])
})

test('toast close is at top right and does not invoke its Undo action',async({page})=>{
  await page.goto('/organiser/events/e-weather-demo/manage')
  await page.evaluate(async()=>{
    const {toast}=await import('/src/composables/useToast.js')
    window.toastActionCount=0
    toast('Notification to read',{duration:60000,action:{label:'Undo',onClick:()=>window.toastActionCount++}})
  })
  const toast=page.locator('.toast-item').filter({hasText:'Notification to read'})
  await expect(toast).toBeVisible()
  const close=toast.getByRole('button',{name:'Dismiss notification',exact:true})
  const parent=await toast.boundingBox(), button=await close.boundingBox()
  expect(Math.abs(button.y-parent.y)).toBeLessThan(2)
  expect(Math.abs(button.x+button.width-parent.x-parent.width)).toBeLessThan(2)
  await close.click()
  await expect(toast).toHaveCount(0)
  expect(await page.evaluate(()=>window.toastActionCount)).toBe(0)
})

test('current budget summary and save feedback can be dismissed without changing the saved limit',async({page})=>{
  await page.goto('/organiser/events/e-weather-demo/manage?tab=budget')
  const limit=page.getByLabel('Budget limit (SGD)',{exact:true})
  await limit.fill('100.00');await limit.press('Tab')
  const feedback=page.locator('.tool-feedback').getByRole('status')
  await expect(feedback).toContainText('Budget limit saved')
  await feedback.getByRole('button',{name:'Dismiss notification',exact:true}).click()
  await expect(feedback).toHaveCount(0)
  const summary=page.locator('.budget-sheet .sheet-summary').getByRole('status')
  await summary.getByRole('button',{name:'Dismiss notification',exact:true}).click()
  await expect(summary).toHaveCount(0)
  await expect(limit).toHaveValue('100.00')
  await page.reload()
  await expect(limit).toHaveValue('100.00')
  await expect(page.locator('.budget-sheet .sheet-summary').getByRole('status')).toBeVisible()
})
