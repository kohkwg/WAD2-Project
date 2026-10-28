import test from 'node:test'
import assert from 'node:assert/strict'
import * as api from '../src/utils/mockApi.js'
import { createSeedData } from '../src/utils/mockData.js'
let value
const key = 'bookedz-feature2-demo'
globalThis.localStorage = { getItem: () => value, setItem: (_key, data) => { value = data }, removeItem: () => {value = null} }
function seed(change) { const db=createSeedData(); change(db); value=JSON.stringify(db); return db }

test('demo refuses an RSVP by an event organiser or helper', async () => {
  const db = seed(db => { db.events[0].organiserId='u1'; db.rsvps=[] })
  await assert.rejects(api.createRsvp({eventId:db.events[0].id, name:'Alex',answers:{}}), /organisers and helpers/i)
  seed(db => {db.rsvps=[];db.eventMembers=[{eventId:db.events[0].id,userId:'u1',role:'helper'}]})
  await assert.rejects(api.createRsvp({eventId:db.events[0].id,name:'Alex',answers:{}}), /organisers and helpers/i)
})

test('demo refuses cancellation after check-in and preserves the registration', async () => {
  seed(db => {db.rsvps=[{id:'r-checked',eventId:db.events[0].id,userId:'u1',status:'confirmed',checkedInAt:new Date().toISOString()}]})
  await assert.rejects(api.cancelRsvp('r-checked'), /checked in/i)
  assert.equal(JSON.parse(value).rsvps[0].status,'confirmed')
})

test('demo waitlist offer is capped at start and no new offers happen after start', async () => {
  for (const minutes of [60,-60]) {
    const db=seed(db=>{
      const event=db.events[0];event.capacity=1;event.startTime=new Date(Date.now()+minutes*60000).toISOString()
      db.rsvps=[{id:'r-cancel',eventId:event.id,userId:'u1',status:'confirmed'}, {id:'r-wait',eventId:event.id,userId:'u2',status:'waitlisted',createdAt:new Date().toISOString()}]
    })
    await api.cancelRsvp('r-cancel')
    const offered=JSON.parse(value).rsvps[1]
    if(minutes>0) assert.equal(offered.offerExpiresAt, db.events[0].startTime)
    else assert.equal(offered.status, 'waitlisted')
  }
})
