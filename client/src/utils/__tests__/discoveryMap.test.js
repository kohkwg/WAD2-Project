import test from 'node:test';
import assert from 'node:assert/strict';
import { eventLatLng, inBounds, categoryStyle, groupMarkers, mergeOverlapping, eventsNear, distanceKm, SINGAPORE_BOUNDS } from '../discoveryMap.js';
test('neighbourhood counts include only mapped events within the radius', () => {
  const marina = {
    lat: 1.282,
    lng: 103.855
  };
  assert.ok(Math.abs(distanceKm(marina, {
    lat: 1.355,
    lng: 103.945
  }) - 12.9) < .5);
  const events = [{
    id: 'near',
    lat: 1.29,
    lng: 103.85
  }, {
    id: 'far',
    lat: 1.355,
    lng: 103.945
  }, {
    id: 'none',
    lat: null,
    lng: null
  }];
  assert.deepEqual(eventsNear(events, marina, 3).map(e => e.id), ['near']);
});
test('only valid Singapore coordinates are placed on the map', () => {
  assert.equal(eventLatLng({
    lat: null,
    lng: null
  }), null);
  assert.equal(eventLatLng({
    lat: '',
    lng: ''
  }), null);
  assert.equal(eventLatLng({
    lat: '1.3',
    lng: '103.8'
  }), null);
  assert.equal(eventLatLng({
    lat: 51.5,
    lng: -0.1
  }), null);
  assert.deepEqual(eventLatLng({
    lat: 1.2966,
    lng: 103.8502
  }), {
    lat: 1.2966,
    lng: 103.8502
  });
  assert.deepEqual(eventLatLng({
    venue: {
      lat: 1.35,
      lng: 103.94
    }
  }), {
    lat: 1.35,
    lng: 103.94
  });
});
test('search-area bounds include edges and exclude outside points', () => {
  const area = {
    south: 1.28,
    west: 103.84,
    north: 1.3,
    east: 103.86
  };
  assert.equal(inBounds({
    lat: 1.29,
    lng: 103.85
  }, area), true);
  assert.equal(inBounds({
    lat: 1.28,
    lng: 103.86
  }, area), true);
  assert.equal(inBounds({
    lat: 1.31,
    lng: 103.85
  }, area), false);
  assert.equal(inBounds(null, area), false);
  assert.equal(inBounds({
    lat: 1.35,
    lng: 103.82
  }, SINGAPORE_BOUNDS), true);
});
test('category pins always carry a text glyph alongside colour', () => {
  assert.deepEqual(categoryStyle({
    tags: ['food']
  }), {
    category: 'food',
    tone: 'mango',
    glyph: 'F'
  });
  assert.equal(categoryStyle({
    tags: ['unknown']
  }).glyph, '•');
  assert.equal(categoryStyle({}).tone, 'ink');
});
test('clusters and prominent markers represent each event exactly once', () => {
  const points = [{
    id: 'a',
    x: 300,
    y: 200
  }, {
    id: 'b',
    x: 303,
    y: 202
  }, {
    id: 'c',
    x: 310,
    y: 205
  }, {
    id: 'd',
    x: 800,
    y: 400
  }];
  const groups = groupMarkers(points, 1, ['a']);
  assert.equal(groups.find(g => g.events[0].id === 'a').prominent, true);
  const represented = groups.flatMap(g => g.events.map(e => e.id));
  assert.deepEqual(represented.sort(), ['a', 'b', 'c', 'd']);
  assert.equal(groups.find(g => g.events.some(e => e.id === 'b')).events.length, 2);
});
test('overlapping pins merge so no hit area covers another, keeping the picked flag', () => {
  const groups = [{
    key: 'a',
    x: 100,
    y: 100,
    events: [{
      id: 'a'
    }],
    prominent: true
  }, {
    key: 'b',
    x: 120,
    y: 110,
    events: [{
      id: 'b'
    }],
    prominent: false
  }, {
    key: 'c',
    x: 300,
    y: 100,
    events: [{
      id: 'c'
    }],
    prominent: false
  }];
  const merged = mergeOverlapping(groups);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].events.map(e => e.id), ['a', 'b']);
  assert.equal(merged[0].prominent, true);
  assert.equal(groups[0].events.length, 1);
});
test('zoom splits nearby events while co-located events remain selectable together', () => {
  const points = [{
    id: 'a',
    x: 100,
    y: 100
  }, {
    id: 'b',
    x: 130,
    y: 100
  }];
  assert.equal(groupMarkers(points, 1).length, 1);
  assert.equal(groupMarkers(points, 3).length, 2);
  assert.equal(groupMarkers([points[0], {
    ...points[0],
    id: 'c'
  }], 3)[0].events.length, 2);
});
