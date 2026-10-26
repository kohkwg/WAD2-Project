import { test, expect } from '@playwright/test'
import { authFile } from './accounts.mjs'
import { openAs, db } from './helpers.mjs'

test.describe.configure({ mode: 'serial' })
let organiser, participant, eventId
const extraEventIds=[]
const title = `[TEST] integration ${Date.now()}`

test.beforeAll(async ({ browser }) => {
 organiser=await openAs(browser,'organiser')
 participant=await openAs(browser,'participant')
})
test.afterAll(async () => {
 if(eventId && organiser) await db(organiser.page,async id=>{
  const {supabase}=await import('/src/utils/supabase.js')
  const {error}=await supabase.from('events').delete().eq('id',id)
  if(error)throw error
 },eventId)
 if(extraEventIds.length && organiser) await db(organiser.page,async ids=>{
  const {supabase}=await import('/src/utils/supabase.js')
  const {error}=await supabase.from('events').delete().in('id',ids);if(error)throw error
 },extraEventIds)
 for(const [role,s] of [['organiser',organiser],['participant',participant]]){
  if(s){await s.context.storageState({path:authFile(role)});await s.context.close()}
 }
})

test('F2 creates an approval event through the live atomic API',async()=>{
 eventId=await db(organiser.page,async title=>{
  const {createEvent}=await import('/src/utils/api.js')
  return (await createEvent({requestId:crypto.randomUUID(),title,description:'[TEST] disposable full integration',
   startTime:new Date(Date.now()+3600000).toISOString(),endTime:new Date(Date.now()+7200000).toISOString(),capacity:5,requiresApproval:true,isOutdoor:false,
   venue:{name:'[TEST] SMU integration venue',address:'80 Stamford Road',postal:'178902',lat:1.2974,lng:103.8496},backupVenue:null,tags:['gaming'],questions:[]})).id
 },title)
 expect(eventId).toMatch(/^[0-9a-f-]{36}$/)
})

test('F1 loads live discovery once per identity and keeps profile readable',async()=>{
 let recommendations=0
 const page=participant.page
 page.on('request',request=>{if(new URL(request.url()).pathname==='/api/recommendations')recommendations++})
 await page.goto('/discover')
 await expect(page.getByRole('heading',{name:'Discover events'})).toBeVisible()
 await expect(page.locator('.event-card').first()).toBeVisible()
 await expect(page.getByRole('alert')).toHaveCount(0)
 await expect.poll(()=>recommendations).toBe(1)
 // Repeated auth events from getSession and token refresh must not restart ranking.
 await db(page,async()=>{const {supabase}=await import('/src/utils/supabase.js');await supabase.auth.getSession();await supabase.auth.getSession()})
 await expect(page.locator('.loading-state')).toHaveCount(0)
 expect(recommendations).toBe(1)
 await page.goto('/profile')
 await expect(page.getByLabel('Name',{exact:true})).toBeVisible()
 await expect(page.getByRole('alert')).toHaveCount(0)
})

test('F1 profile save persists and test values are restored',async()=>{
 const page=participant.page
 const original=await db(page,async()=>{
  const {supabase}=await import('/src/utils/supabase.js')
  const {data:auth}=await supabase.auth.getUser()
  const {data,error}=await supabase.from('profiles').select('display_name,postal_code,lat,lng,interest_weights').eq('id',auth.user.id).single()
  if(error)throw error
  return {id:auth.user.id,...data}
 })
 try{
  await page.goto('/profile')
  await page.getByLabel('Name',{exact:true}).fill('[TEST] Profile save verification')
  await page.getByLabel('Postal code',{exact:true}).fill('')
  await page.getByRole('button',{name:'Save profile',exact:true}).click()
  await expect(page.getByRole('status').filter({hasText:'Profile saved.'})).toBeVisible()
  const saved=await db(page,async id=>{
   const {supabase}=await import('/src/utils/supabase.js')
   const {data,error}=await supabase.from('profiles').select('display_name,postal_code').eq('id',id).single();if(error)throw error
   return data
  },original.id)
  expect(saved.display_name).toBe('[TEST] Profile save verification')
  expect(saved.postal_code).toBe(null)
 }finally{
  await db(page,async ({id,...row})=>{
   const {supabase}=await import('/src/utils/supabase.js')
   const {error}=await supabase.from('profiles').update(row).eq('id',id);if(error)throw error
  },original)
 }
})

test('F2 participant submits pending RSVP and owner approves',async()=>{
 await participant.page.goto(`/events/${eventId}/rsvp`)
 await participant.page.getByRole('button',{name:'RSVP',exact:true}).click()
 await expect(participant.page.locator('main')).toContainText('Awaiting approval')
 const registration=await db(organiser.page,async id=>{
  const {supabase}=await import('/src/utils/supabase.js')
  const {data,error}=await supabase.rpc('event_registrations',{p_event_id:id})
  if(error)throw error
  const row=data.find(r=>r.status==='pending')
  const result=await supabase.rpc('approve_registration',{p_registration_id:row.registration_id})
  if(result.error)throw result.error
  return row.registration_id
 },eventId)
 expect(registration).toBeTruthy()
 await participant.page.goto('/my-rsvps')
 await expect(participant.page.locator('.card',{hasText:title})).toContainText('Confirmed')
})

test('F4 persists task, public announcement and exact-cent budget through live UI',async()=>{
 const page=organiser.page
 await page.goto(`/organiser/events/${eventId}/manage?tab=tasks`)
 await page.getByRole('button',{name:'Add task',exact:true}).click()
 await page.getByLabel('Task title',{exact:true}).fill('[TEST] Prepare welcome desk')
 await page.getByRole('button',{name:'Save task',exact:true}).click()
 await expect(page.locator('.task-title').filter({hasText:'[TEST] Prepare welcome desk'})).toBeVisible()
 await page.reload()
 await expect(page.locator('.task-title').filter({hasText:'[TEST] Prepare welcome desk'})).toBeVisible()
 const result=await db(page,async id=>{
  const api=await import('/src/utils/api.js')
  await api.createAnnouncement(id,'[TEST] Doors open at the main entrance.')
  await api.saveBudgetLimit(id,10000)
  await api.saveBudgetItem(id,{name:'[TEST] Supplies',category:'Other',plannedCents:10000,actualCents:9550})
  return api.getEventOperations(id)
 },eventId)
 expect(result.budget.limitCents).toBe(10000)
 expect(result.budget.items[0].actualCents).toBe(9550)
 await page.goto(`/organiser/events/${eventId}/manage?tab=budget`)
 await expect(page.locator('main')).toContainText('95.5%')
 await participant.page.goto(`/events/${eventId}/rsvp`)
 await expect(participant.page.locator('main')).toContainText('[TEST] Doors open at the main entrance.')
 const denial=await db(participant.page,async id=>{
  try{const api=await import('/src/utils/api.js');await api.createTask(id,{title:'[TEST] denied'});return false}catch{return true}
 },eventId)
 expect(denial).toBe(true)
})

test('F4 reads real NEA weather and verifies the server-authorised switch outcome',async()=>{
 const id=await db(organiser.page,async()=>{
  const {createEvent}=await import('/src/utils/api.js')
  return (await createEvent({requestId:crypto.randomUUID(),title:'[TEST] live NEA switch',description:'Temporary weather verification',
   startTime:new Date(Date.now()+30*60000).toISOString(),endTime:new Date(Date.now()+90*60000).toISOString(),capacity:5,requiresApproval:false,isOutdoor:true,
   venue:{name:'[TEST] Outdoor SMU',address:'80 Stamford Road',postal:'178902',lat:1.2974,lng:103.8496},
   backupVenue:{name:'[TEST] Backup hall',address:'81 Victoria Street',postal:'188065',lat:1.2966,lng:103.8502},tags:['outdoors'],questions:[]})).id
 })
 extraEventIds.push(id)
 const result=await db(organiser.page,async id=>{
  const api=await import('/src/utils/api.js')
  const snapshot=await api.getEventWeather(id)
  let switched=false,reason=''
  try{await api.confirmBackupVenueSwitch(id);switched=true}catch(error){reason=error.message}
  const event=await api.getEvent(id)
  const posts=await api.getAnnouncements(id)
  return {available:snapshot.forecast.available,condition:snapshot.forecast.forecast,switched,reason,usingBackup:event.usingBackup,automatic:posts.filter(p=>p.kind==='venue-switch').length}
 },id)
 expect(result.available).toBe(true)
 expect(result.condition).toBeTruthy()
 if(result.switched){expect(result.usingBackup).toBe(true);expect(result.automatic).toBe(1)}
 else{expect(result.reason).toMatch(/forecast|rain|showers|window|weather/i);expect(result.usingBackup).toBe(false);expect(result.automatic).toBe(0)}
 console.log(`Live NEA switch outcome: ${result.switched ? 'switched successfully' : 'safely refused: '+result.reason}`)
})

for(const width of [375,575,768,1280]){
 test(`shared shell and live pages have no overflow or runtime errors at ${width}px`,async()=>{
  const page=organiser.page
  await page.setViewportSize({width,height:900})
  const errors=[]
  const listener=e=>errors.push(e.message)
  page.on('pageerror',listener)
  try{
   for(const path of ['/discover','/profile','/my-rsvps',`/organiser/events/${eventId}/manage?tab=tasks`]){
    await page.goto(path)
    await expect(page.locator('main h1').first()).toBeVisible()
    await expect(page.locator('main')).toHaveCount(1)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
   }
   expect(errors).toEqual([])
  }finally{page.off('pageerror',listener)}
 })
}
