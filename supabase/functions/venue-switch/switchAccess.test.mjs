import test from 'node:test'
import assert from 'node:assert/strict'
import { canManageVenueSwitch } from './switchAccess.mjs'
test('owner uses existing access; co-organiser needs verified membership', async () => {
  assert.equal(await canManageVenueSwitch('owner','owner',()=>{throw new Error('unnecessary lookup')}),true)
  assert.equal(await canManageVenueSwitch('coorg','owner',async()=>true),true)
  for(const value of [false,null,undefined,'true',{},[]]) assert.equal(await canManageVenueSwitch('other','owner',async()=>value),false)
  assert.equal(await canManageVenueSwitch(null,'owner',async()=>true),false)
})
