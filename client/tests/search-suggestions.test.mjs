import checks from '../../server/tests/checks.js'
const { checkEqual, checkDeepEqual, checkTrue } = checks
import { test } from 'vitest';
import { buildSuggestionIndex, suggest, SUGGESTION_LIMIT, MIN_QUERY_LENGTH } from '../src/lib/searchSuggestions.js'

let nextId = 0
const ev = (title, extra = {}) => ({ id: `e${++nextId}`, title, description: '', venue_name: '', tags: [], ...extra })
const rows = (events, query, options) => suggest(buildSuggestionIndex(events), query, options)
const labels = list => list.map(row => row.label)
const ofKind = (list, kind) => list.filter(row => row.kind === kind)
const keywordLabels = events => buildSuggestionIndex(events).entries.filter(entry => entry.kind === 'keyword').map(entry => entry.label)

test('queries under two characters return nothing', () => {
  checkEqual(MIN_QUERY_LENGTH, 2)
  const events = [ev('Garden Party', { tags: ['arts'] })]
  checkDeepEqual(rows(events, ''), [])
  checkDeepEqual(rows(events, 'g'), [])
  checkDeepEqual(rows(events, '  g  '), [])
  checkDeepEqual(rows(events, undefined), [])
  checkTrue(rows(events, 'ga').length > 0, 'two characters should be enough')
})

test('a start-of-text match beats a later-word match', () => {
  const events = [ev('Old Garden Walk'), ev('Garden Party')]
  const list = ofKind(rows(events, 'gar'), 'event')
  checkDeepEqual(labels(list), ['Garden Party', 'Old Garden Walk'])
  // Across every kind, a start-of-text row precedes any later-word row
  const all = rows(events, 'gar')
  checkTrue(all[0].label.toLowerCase().startsWith('gar'), `first row was ${all[0].label}`)
  const firstLater = all.findIndex(row => !row.label.toLowerCase().startsWith('gar'))
  checkTrue(firstLater === -1 || all.slice(0, firstLater).every(row => row.label.toLowerCase().startsWith('gar')))
})

test('within a tier higher weight comes first, then alphabetical', () => {
  const events = [
    ev('One', { tags: ['mural'] }),
    ev('Two', { tags: ['music'] }), ev('Three', { tags: ['music'] }), ev('Four', { tags: ['music'] }),
  ]
  checkDeepEqual(labels(ofKind(rows(events, 'mu'), 'category')), ['Music', 'Mural'])

  // Equal weight: alphabetical, not insertion order
  const ties = [ev('Quiz', { tags: ['alps'] }), ev('Chess', { tags: ['alpha'] })]
  checkDeepEqual(labels(ofKind(rows(ties, 'al'), 'category')), ['Alpha', 'Alps'])
  checkDeepEqual(labels(ofKind(rows([...ties].reverse(), 'al'), 'category')), ['Alpha', 'Alps'])
})

test('matching ignores case and accents and highlight parts keep the label spelling', () => {
  const events = [ev('Café Nero')]
  for (const query of ['cafe', 'CAFE', 'Café', 'cafÉ', ' cafe ']) {
    const list = rows(events, query)
    const row = ofKind(list, 'event')[0]
    checkTrue(row, `no event row for "${query}"`)
    checkEqual(row.label, 'Café Nero')
    checkEqual(row.eventId, events[0].id)
    checkDeepEqual(row.parts, { before: '', match: 'Café', after: ' Nero' })
  }
  const later = ofKind(rows([ev('Late Café Nero')], 'cafe'), 'event')[0]
  checkDeepEqual(later.parts, { before: 'Late ', match: 'Café', after: ' Nero' })
  // The reverse: an unaccented stored word is found by an accented query
  checkEqual(ofKind(rows([ev('Cafe Nero')], 'café'), 'event').length, 1)
})

test('stop words, short words and pure numbers are never keywords', () => {
  const events = [
    ev('The Go 2024 Fest', { description: 'with an ox at 1234 and the dog' }),
    ev('Big Ox 99 Night', { description: 'Come join the fun' }),
  ]
  const words = keywordLabels(events)
  for (const bad of ['the', 'go', 'ox', 'at', '2024', '1234', '99', 'with', 'an', 'and', 'come', 'join', 'fun']) {
    checkTrue(!words.includes(bad), `"${bad}" must not be a keyword`)
  }
  checkTrue(words.includes('fest'), 'a real title word is still a keyword')
  checkTrue(words.includes('night'))
  checkEqual(ofKind(rows(events, 'the'), 'keyword').length, 0)
  checkEqual(ofKind(rows(events, '202'), 'keyword').length, 0)
  checkEqual(ofKind(rows(events, 'ox'), 'keyword').length, 0)
})

test('a description-only word needs two events but a title word needs one', () => {
  const oneDescription = [ev('Jam Session', { description: 'Bring your ukulele.' }), ev('Quiz Night')]
  checkDeepEqual(ofKind(rows(oneDescription, 'ukule'), 'keyword'), [])

  const twoDescriptions = [...oneDescription, ev('Open Stage', { description: 'Bring your ukulele too' })]
  const keyword = ofKind(rows(twoDescriptions, 'ukule'), 'keyword')
  checkDeepEqual(labels(keyword), ['ukulele'])
  checkEqual(keyword[0].count, 2)
  checkEqual(keyword[0].searchText, 'ukulele')

  const title = ofKind(rows([ev('Origami Workshop')], 'origa'), 'keyword')
  checkDeepEqual(labels(title), ['origami'])
  checkEqual(title[0].count, 1)
})

test('a phrase is never built across punctuation', () => {
  // Phrases only become rows when two events share them, so each text appears twice
  const events = [
    ev('Games One', { description: 'Rock, paper scissors and stone cold brew' }),
    ev('Games Two', { description: 'Rock, paper scissors and stone cold brew' }),
  ]
  const words = keywordLabels(events)
  checkTrue(!words.includes('rock paper'), 'rock, paper must not become "rock paper"')
  checkTrue(words.includes('paper scissors'), 'a single space does build a phrase')
  checkTrue(words.includes('stone cold'))
  checkDeepEqual(rows(events, 'rock pap'), [])
  checkDeepEqual(labels(ofKind(rows(events, 'stone c'), 'keyword')), ['stone cold'])
  // Other separators stop phrases too
  const dashed = [0, 1].map(() => ev('Dashed', { description: 'Sand - surf party and sand  surf club' }))
  checkTrue(!keywordLabels(dashed).includes('sand surf'))
  checkTrue(!keywordLabels(dashed).includes('sand - surf'))
})

test('Online and Venue to be announced never produce venue or keyword rows or counts', () => {
  const events = [
    ev('Chess Club', { description: 'Chess online', venue_name: 'Online' }),
    ev('Board Games', { description: 'Chess online', venue_name: ' online ' }),
    ev('Reading Hour', { description: 'Quiet books', venue_name: 'Online' }),
    ev('Pottery', { description: 'Clay things', venue_name: 'Venue to be announced' }),
    ev('Painting', { description: 'Colours', venue_name: 'venue to be announced' }),
  ]
  checkEqual(ofKind(rows(events, 'onl'), 'venue').length, 0)
  checkEqual(ofKind(rows(events, 'ven'), 'venue').length, 0)
  checkEqual(ofKind(rows(events, 'ven'), 'keyword').length, 0)
  checkEqual(ofKind(rows(events, 'announ'), 'keyword').length, 0)
  checkEqual(ofKind(rows(events, 'announ'), 'venue').length, 0)

  // The description word is a keyword, and the venue label of the third event doesn't count
  const online = ofKind(rows(events, 'onl'), 'keyword').filter(row => row.label === 'online')
  checkEqual(online.length, 1)
  checkEqual(online[0].count, 2)
})

test('the others tag is never a category row and excludeCategories removes a category', () => {
  const events = [ev('Chess', { tags: ['others', 'music'] }), ev('Quiz', { tags: ['others'] })]
  checkEqual(ofKind(rows(events, 'oth'), 'category').length, 0)
  checkDeepEqual(labels(ofKind(rows(events, 'mu'), 'category')), ['Music'])
  checkEqual(ofKind(rows(events, 'mu', { excludeCategories: ['music'] }), 'category').length, 0)
  checkEqual(ofKind(rows(events, 'mu', { excludeCategories: ['tech'] }), 'category').length, 1)
})

test('a unique title is an event row and a repeated title becomes a search', () => {
  const events = [ev('Pottery Basics'), ev('Open Mic'), ev('Open Mic')]
  const unique = ofKind(rows(events, 'potte'), 'event')
  checkEqual(unique.length, 1)
  checkEqual(unique[0].eventId, events[0].id)
  checkEqual(unique[0].count, 1)

  const repeated = rows(events, 'open m')
  checkEqual(ofKind(repeated, 'event').length, 0)
  const row = ofKind(repeated, 'keyword').find(item => item.label === 'Open Mic')
  checkTrue(row, 'repeated title should be a keyword row')
  checkEqual(row.searchText, 'Open Mic')
  checkEqual(row.eventId, undefined)
  checkEqual(row.count, 2)
})

test('at most two event rows and the limit is respected', () => {
  const jazz = ['One', 'Two', 'Three', 'Four'].map(word => ev(`Jazz Evening ${word}`))
  const list = rows(jazz, 'jaz', { limit: 20 })
  checkEqual(ofKind(list, 'event').length, 2)
  checkTrue(ofKind(list, 'keyword').length > 0, 'other kinds still fill the list')

  const many = 'abcdefghij'.split('').map(letter => ev(`Title ${letter}x`, { tags: [`sam${letter}${letter}`] }))
  checkEqual(SUGGESTION_LIMIT, 6)
  checkEqual(rows(many, 'sam', { limit: 50 }).length, 10)
  checkEqual(rows(many, 'sam').length, SUGGESTION_LIMIT)
  checkEqual(rows(many, 'sam', { limit: 3 }).length, 3)
  checkEqual(rows(many, 'sam', { limit: 1 }).length, 1)
})

test('typing a whole keyword or venue does not offer it again', () => {
  const events = [
    ev('Sunset Run', { venue_name: 'Harbour Hall' }),
    ev('Dawn Run', { venue_name: 'Harbour Hall' }),
  ]
  checkDeepEqual(labels(ofKind(rows(events, 'harbour hall'), 'venue')), [])
  checkDeepEqual(labels(ofKind(rows(events, 'HARBOUR  Hall '), 'venue')), [])
  checkDeepEqual(labels(ofKind(rows(events, 'harbour'), 'keyword')), [])
  // Still offered while the word is incomplete or when it leads to something longer
  checkDeepEqual(labels(ofKind(rows(events, 'harbour'), 'venue')), ['Harbour Hall'])
  checkDeepEqual(labels(ofKind(rows(events, 'harbo'), 'keyword')), ['harbour'])
  checkEqual(ofKind(rows(events, 'run'), 'keyword').length, 0)
})

test('every row count equals the events containing its text and no row is empty', () => {
  const events = [
    ev('Marina Bay Run', { description: 'Run along the bay front', venue_name: 'Marina Bay', tags: ['sports'] }),
    ev('Bay Cleanup', { description: 'Clean the bay and beach', venue_name: 'East Coast Park', tags: ['volunteering'] }),
    ev('Beach Volleyball', { description: 'Sand, sun and the bay', venue_name: 'East Coast Park', tags: ['sports'] }),
    ev('Park Run', { description: 'Weekly run', venue_name: 'Online', tags: ['sports'] }),
    ev('Park Run', { description: 'Weekly run again', venue_name: 'Venue to be announced' }),
    ev('Café Nero Tasting', { description: 'Coffee and cafe talk', venue_name: 'Cafe Street' }),
  ]
  const index = buildSuggestionIndex(events)
  const documentOf = event => [event.title, event.description,
    ['online', 'venue to be announced'].includes(event.venue_name.trim().toLowerCase()) ? '' : event.venue_name]
    .filter(Boolean).join('\n').toLowerCase()
  let checked = 0
  for (const query of ['ba', 'bay', 'bea', 'mar', 'par', 'run', 'ea', 'eas', 'cle', 'cafe', 'caf', 'spo', 'vol', 'wee', 'cof', 'sun', 'tas', 'park']) {
    for (const row of suggest(index, query, { limit: 50 })) {
      checked++
      checkTrue(row.count > 0, `${row.kind}:${row.label} has no events`)
      if (row.kind === 'category') {
        checkEqual(row.count, events.filter(event => event.tags.includes(row.category)).length, `category ${row.label}`)
      } else if (row.kind === 'event') {
        checkEqual(row.count, 1)
      } else {
        const expected = events.filter(event => documentOf(event).includes(row.searchText.toLowerCase())).length
        checkEqual(row.count, expected, `${row.kind} "${row.label}" for query "${query}"`)
      }
    }
  }
  checkTrue(checked > 15, `only ${checked} rows were checked`)
})

test('inside-a-word matches are never keywords, never under 3 letters, and allowed for venues and events', () => {
  const smart = [ev('Smart Cities Summit')]
  checkEqual(ofKind(rows(smart, 'mart'), 'keyword').length, 0)
  checkEqual(ofKind(rows(smart, 'mart'), 'event').length, 1, 'inside a title is fine at 4 characters')
  checkEqual(ofKind(rows(smart, 'art'), 'event').length, 1, 'and at exactly 3')
  checkDeepEqual(rows(smart, 'ar'), [], 'but not at 2')

  const marina = [ev('Sunset Run', { venue_name: 'Marina Bay' }), ev('Dawn Run', { venue_name: 'Marina Bay' })]
  checkDeepEqual(labels(rows(marina, 'rin')), ['Marina Bay'])
  checkDeepEqual(ofKind(rows(marina, 'rin'), 'venue').map(row => row.count), [2])
  checkDeepEqual(rows(marina, 'ri'), [])
  checkDeepEqual(labels(rows(marina, 'ina')), ['Marina Bay'])
  checkEqual(ofKind(rows(marina, 'ina'), 'keyword').length, 0)
})

test('an empty or missing index returns no rows', () => {
  checkDeepEqual(suggest(undefined, 'abc'), [])
  checkDeepEqual(suggest(null, 'abc'), [])
  checkDeepEqual(suggest({}, 'abc'), [])
  checkDeepEqual(suggest({ entries: [], documents: [] }, 'abc'), [])
  checkDeepEqual(suggest(buildSuggestionIndex(), 'abc'), [])
  checkDeepEqual(suggest(buildSuggestionIndex([]), 'abc'), [])
  checkDeepEqual(buildSuggestionIndex([]).entries, [])
  // Rows with nothing usable don't throw
  const sparse = buildSuggestionIndex([{ id: 1 }, { id: 2, title: null, tags: null, venue_name: null, description: null }])
  checkDeepEqual(suggest(sparse, 'abc'), [])
})
