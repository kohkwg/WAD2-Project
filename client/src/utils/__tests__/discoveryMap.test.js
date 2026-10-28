import test from 'node:test'
import assert from 'node:assert/strict'
import { projectVenue, projectIllustratedVenue, ILLUSTRATION_ANCHORS, groupMarkers } from '../discoveryMap.js'

test('illustrated projection matches the documented landmark calibration anchors', () => {
  for (const anchor of ILLUSTRATION_ANCHORS) {
    const point = projectIllustratedVenue(anchor)
    assert.ok(Math.abs(point.x - anchor.x) < .001, anchor.name)
    assert.ok(Math.abs(point.y - anchor.y) < .001, anchor.name)
  }
  assert.equal(projectIllustratedVenue({ lat: null, lng: null }), null)
  assert.equal(projectIllustratedVenue({ lat: 51.5, lng: -.1 }), null)
  const venue = { lat: 1.2966, lng: 103.8502 }
  assert.deepEqual(projectIllustratedVenue(venue), projectIllustratedVenue(venue))
  const point = projectIllustratedVenue(venue)
  assert.ok(point.x > 0 && point.x < 1200 && point.y > 0 && point.y < 900)
})

test('valid Singapore coordinates preserve geographic direction without inventing missing locations', () => {
  assert.equal(projectVenue({ lat: null, lng: null }), null)
  assert.equal(projectVenue({ lat: '', lng: '' }), null)
  assert.equal(projectVenue({ lat: 51.5, lng: -0.1 }), null)
  assert.equal(projectVenue({ lat: '1.3', lng: '103.8' }), null)
  const west = projectVenue({ lat: 1.35, lng: 103.7 })
  const east = projectVenue({ lat: 1.35, lng: 103.95 })
  const north = projectVenue({ lat: 1.45, lng: 103.7 })
  assert.ok(west.x < east.x)
  assert.ok(north.y < west.y)
})

test('clusters and prominent markers represent each event exactly once', () => {
  const points = [
    { id: 'a', x: 300, y: 200 }, { id: 'b', x: 303, y: 202 },
    { id: 'c', x: 310, y: 205 }, { id: 'd', x: 800, y: 400 },
  ]
  const groups = groupMarkers(points, 1, ['a'])
  assert.equal(groups.find(g => g.events[0].id === 'a').prominent, true)
  const represented = groups.flatMap(g => g.events.map(e => e.id))
  assert.deepEqual(represented.sort(), ['a', 'b', 'c', 'd'])
  assert.equal(groups.find(g => g.events.some(e => e.id === 'b')).events.length, 2)
})

test('zoom splits nearby events while co-located events remain selectable together', () => {
  const points = [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 130, y: 100 }]
  assert.equal(groupMarkers(points, 1).length, 1)
  assert.equal(groupMarkers(points, 3).length, 2)
  assert.equal(groupMarkers([points[0], { ...points[0], id: 'c' }], 3)[0].events.length, 2)
})
