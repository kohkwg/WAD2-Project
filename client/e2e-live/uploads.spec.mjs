// Runs on the test host only. R2 credentials never enter page.evaluate or browser code.
import fs from 'node:fs'
import { parseEnv } from 'node:util'
import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { authFile } from './accounts.mjs'
import { createTestEvent, db, openAs } from './helpers.mjs'
const require = createRequire(import.meta.url)
const { S3Client, DeleteObjectCommand } = require('../../server/node_modules/@aws-sdk/client-s3')
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const file = name => ({ name, mimeType: 'image/png', buffer: image })
const uploaded = new Set()
let organiser, participant, eventId
const title = `[TEST] cover and floor image ${Date.now()}`
test.describe.configure({ mode: 'serial' })
test.beforeAll(async ({ browser }) => {
 organiser=await openAs(browser,'organiser');participant=await openAs(browser,'participant')
 organiser.page.on('response',async response=>{
  if(response.request().method()==='POST' && /\/api\/uploads\/(cover|floor-plan)$/.test(new URL(response.url()).pathname) && response.ok()){
   const ticket=await response.json();if(ticket.key)uploaded.add(ticket.key)
  }
 })
})
test.afterAll(async()=>{
 try{
  if(eventId && organiser)await db(organiser.page,async id=>{const {supabase}=await import('/src/utils/supabase.js');const {error}=await supabase.from('events').delete().eq('id',id);if(error)throw error},eventId)
 }finally{
  const env=parseEnv(fs.readFileSync(new URL('../../server/.env',import.meta.url),'utf8'))
  const client=new S3Client({region:'auto',endpoint:`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY}})
  try{for(const key of uploaded)await client.send(new DeleteObjectCommand({Bucket:env.R2_BUCKET,Key:key}))}finally{client.destroy()}
  for(const [role,s] of [['organiser',organiser],['participant',participant]])if(s){await s.context.storageState({path:authFile(role)});await s.context.close()}
 }
})

test('cover uploads in the browser and persists through creation, discovery and public detail',async()=>{
 eventId=await createTestEvent(organiser.page,{title,tag:'arts',coverFile:file('[TEST] cover.png')})
 const url=await db(organiser.page,async id=>{
  const {supabase}=await import('/src/utils/supabase.js')
  const {data,error}=await supabase.from('events').select('cover_image_url').eq('id',id).single();if(error)throw error
  const view=await supabase.from('events_with_counts').select('image_url').eq('id',id).single();if(view.error)throw view.error
  if(view.data.image_url!==data.cover_image_url)throw Error('Discovery cover differs')
  return data.cover_image_url
 },eventId)
 expect(url).toMatch(/^https:\/\//)
 await participant.page.goto(`/events/${eventId}/rsvp`)
 const cover=participant.page.getByRole('img',{name:`Cover for ${title}`})
 await expect(cover).toBeVisible()
 await expect.poll(()=>cover.evaluate(img=>img.complete && img.naturalWidth>0)).toBe(true)
})

test('finished floor-plan image uploads, reloads and is visible to participants',async()=>{
 const page=organiser.page
 await page.goto(`/organiser/events/${eventId}/floor-plan`)
 await page.getByRole('button',{name:'Add box',exact:true}).click()
 await page.getByRole('button',{name:'Save floor plan',exact:true}).click()
 await expect(page.getByText('Saved.',{exact:true})).toBeVisible()
 await expect(page.getByLabel('Public finished floor-plan image')).toBeEnabled()
 await page.getByLabel('Public finished floor-plan image').setInputFiles(file('[TEST] finished.png'))
 await expect(page.getByRole('status').filter({hasText:'Public floor-plan image saved.'})).toBeVisible()
 await page.reload()
 await expect(page.getByRole('img',{name:'[TEST] finished.png',exact:true})).toBeVisible()
 await participant.page.goto(`/events/${eventId}/rsvp`)
 const img=participant.page.getByRole('img',{name:'[TEST] finished.png',exact:true})
 await expect(img).toBeVisible()
 await expect.poll(()=>img.evaluate(el=>el.complete && el.naturalWidth>0)).toBe(true)
 await expect(participant.page.getByLabel('Public finished floor-plan image')).toHaveCount(0)
})
