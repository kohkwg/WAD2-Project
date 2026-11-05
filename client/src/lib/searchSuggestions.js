// Discover search suggestions. Pure functions over the event rows Discover already reads, so
// demo and live mode behave the same and typing causes no network requests.
//
// buildSuggestionIndex(events) turns the rows into searchable entries; suggest(index, query)
// picks the rows to show. A row is only offered when choosing it finds at least one event.

import { ONLINE_VENUE_NAME } from '../utils/onlineEvents.js'
import { VENUE_TBA_NAME } from '../utils/venueReveal.js'

export const SUGGESTION_LIMIT = 6
export const MIN_QUERY_LENGTH = 2
const MAX_EVENT_ROWS = 2 // one kind shouldn't fill the list
const MIN_TERM_LENGTH = 3
const MIN_DESCRIPTION_EVENTS = 2 // free text is noisy: one mention isn't a useful keyword
const MIN_PHRASE_EVENTS = 2
const MIN_CONTAINS_LENGTH = 3// "art" may find "Smart Cities"; "ar" would find too much

const WEIGHT = { title: 3, tag: 2, venue: 2, description: 1 }

// Display labels, not stored venue names: searching for them finds nothing
const DISPLAY_ONLY_VENUES = new Set([ONLINE_VENUE_NAME, VENUE_TBA_NAME].map(fold))
const HIDDEN_CATEGORIES = new Set(['others'])

// Common English, plus words nearly every event description uses
const STOP_WORDS = new Set(`
  a about above after again all also am an and any are around as at be because been before being
  below between both but by can could did do does doing down during each few for from further get
  had has have having he her here hers him his how i if in into is it its just like me more most
  my no nor not now of off on once only or other our ours out over own same she should so some
  such than that the their theirs them then there these they this those through to too under
  until up very was we well were what when where which while who whom why will with would you
  your yours
  event events join come bring welcome please everyone anyone people us let lets free new meet
  time day days week weeks today tomorrow session sessions great good best fun enjoy ready held
  take part open available need needed sure want looking see learn make hour hours minute minutes
  month months year years
`.trim().split(/\s+/))

// Case and accents never affect matching; whitespace runs count as one space
function fold(text) {
  return String(text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

const isUsefulWord = word => word.length >= MIN_TERM_LENGTH && /\p{L}/u.test(word) && !STOP_WORDS.has(word)

// Useful words and two-word phrases, as written. A phrase only joins words separated by one space:
// the search looks for the exact text, so "rock, paper" could never find "rock paper".
function termsIn(text) {
  const words = [...String(text ?? '').matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)]
  const terms = []
  words.forEach((match, index) => {
    const useful = isUsefulWord(fold(match[0]))
    if (useful) terms.push(match[0])
    const next = words[index + 1]
    if (!useful || !next || !isUsefulWord(fold(next[0]))) return
    const end = next.index + next[0].length
    const gap = text.slice(match.index + match[0].length, next.index)
    if (gap === ' ') terms.push(text.slice(match.index, end))
  })
  return terms
}

/** Makes the search index from the event list: titles, venues, categories and keywords. */
export function buildSuggestionIndex(events = []) {
  const documents = []
  const titles = new Map()
  const venues = new Map()
  const categories = new Map()
  const keywords = new Map()

  for (const event of events) {
    const title = String(event.title ?? '').trim()
    const venueName = String(event.venue_name ?? '').trim()
    const venue = DISPLAY_ONLY_VENUES.has(fold(venueName)) ? '' : venueName
    // The same fields the search checks; a line break stops text matching across two fields
    documents.push([title, event.description, venue].filter(Boolean).join('\n').toLowerCase())

    if (title) {
      const group = titles.get(fold(title)) || { label: title, ids: [] }
      group.ids.push(event.id)
      titles.set(fold(title), group)
    }
    if (venue) {
      const group = venues.get(fold(venue)) || { label: venue, events: 0 }
      group.events++
      venues.set(fold(venue), group)
    }
    for (const tag of new Set(event.tags || [])) {
      if (!HIDDEN_CATEGORIES.has(tag)) categories.set(tag, (categories.get(tag) || 0) + 1)
    }

    // Each event counts once per keyword, at its strongest field
    const best = new Map()
    const note = (text, field) => {
      for (const term of termsIn(text)) {
        const key = fold(term)
        const current = best.get(key)
        if (!current || WEIGHT[field] > current.weight) best.set(key, { surface: term, weight: WEIGHT[field], field })
      }
    }
    note(event.description, 'description')
    note(venue, 'venue')
    note(title, 'title')
    for (const [key, { surface, weight, field }] of best) {
      const keyword = keywords.get(key) || { surface, weight: 0, events: 0, inTitle: false, descriptionEvents: 0 }
      keyword.weight += weight
      keyword.events++
      if (field === 'title') { keyword.inTitle = true; keyword.surface = surface }
      if (field === 'description') keyword.descriptionEvents++
      keywords.set(key, keyword)
    }
  }

  // Earlier kinds win when the same words could be two kinds of row
  const entries = new Map()
  const add = (key, entry) => { if (!entries.has(key)) entries.set(key, { ...entry, folded: key }) }

  for (const [tag, count] of categories) {
    add(fold(tag), { kind: 'category', label: tag.charAt(0).toUpperCase() + tag.slice(1), category: tag, count, weight: count * WEIGHT.tag })
  }
  for (const [key, { label, ids }] of titles) {
    // A repeated title is a search; only a unique one can go straight to its event
    if (ids.length === 1) add(key, { kind: 'event', label, eventId: ids[0], count: 1, weight: WEIGHT.title })
    else add(key, { kind: 'keyword', label, searchText: label, weight: ids.length * WEIGHT.title })
  }
  for (const [key, { label, events: count }] of venues) {
    add(key, { kind: 'venue', label, searchText: label, weight: count * WEIGHT.venue })
  }
  for (const [key, { surface, weight, events: eventCount, inTitle, descriptionEvents }] of keywords) {
    if (!inTitle && descriptionEvents < MIN_DESCRIPTION_EVENTS && weight < WEIGHT.venue) continue
    // "talks" adds nothing beside "talk": the search finds text inside words, so "talk" covers both
    if (key.endsWith('s') && keywords.has(key.slice(0, -1))) continue
    if (key.includes(' ')) {
      // A phrase from one event repeats that event's own row, and one from a venue name its venue's
      if (eventCount < MIN_PHRASE_EVENTS) continue
      if ([...venues.keys()].some(venueName => venueName.includes(key))) continue
    }
    const label = surface.toLowerCase()
    add(key, { kind: 'keyword', label, searchText: label, weight })
  }

  return { entries: [...entries.values()], documents }
}

// Where the query starts in the text: 0 at the start, 1 at a later word, 2 inside a word, or null
function matchTier(text, query) {
  if (text.startsWith(query)) return 0
  for (let at = text.indexOf(query); at !== -1; at = text.indexOf(query, at + 1)) {
    if (!/[\p{L}\p{N}]/u.test(text[at - 1])) return 1
  }
  return text.includes(query) ? 2 : null
}

// Splits a label around the matched text for highlighting, keeping the label's own spelling
function highlightParts(label, query) {
  let folded = ''
  const origin = [] // origin[i] = where folded character i came from in the label
  Array.from(label).reduce((position, character) => {
    for (const unit of fold(character) || (character.trim() ? '' : ' ')) {
      folded += unit
      origin.push(position)
    }
    return position + character.length
  }, 0)
  const start = folded.indexOf(query)
  if (start === -1) return { before: label, match: '', after: '' }
  const from = origin[start]
  const lastUnit = start + query.length - 1
  let to = lastUnit + 1 < origin.length ? origin[lastUnit + 1] : label.length
  if (to === from) to = label.length
  return { before: label.slice(0, from), match: label.slice(from, to), after: label.slice(to) }
}

// The rows to show for what's typed so far.
// excludeCategories: categories already applied, which choosing again would do nothing for.
export function suggest(index, query, { limit = SUGGESTION_LIMIT, excludeCategories = [] } = {}) {
  const needle = fold(query)
  if (needle.length < MIN_QUERY_LENGTH || !index?.entries?.length) return []

  const ranked = []
  for (const entry of index.entries) {
    if (entry.kind === 'category' && excludeCategories.includes(entry.category)) continue
    // Typing a whole keyword or venue already searches for it, so the row would change nothing
    if (entry.searchText && entry.folded === needle) continue
    const tier = matchTier(entry.folded, needle)
    if (tier === null) continue
    // Inside a word is only worth offering for specific names, and not for very short queries
    if (tier === 2 && (entry.kind === 'keyword' || needle.length < MIN_CONTAINS_LENGTH)) continue
    ranked.push({ entry, tier })
  }
  ranked.sort((a, b) => a.tier - b.tier
    || b.entry.weight - a.entry.weight
    || a.entry.label.localeCompare(b.entry.label))

  const rows = []
  let eventRows = 0
  for (const { entry } of ranked) {
    if (rows.length >= limit) break
    if (entry.kind === 'event' && eventRows >= MAX_EVENT_ROWS) continue
    // Counted the way the search matches, and only for rows that might be shown
    const text = entry.searchText?.toLowerCase()
    const count = text === undefined
      ? entry.count
      : index.documents.reduce((total, document) => total + Number(document.includes(text)), 0)
    if (!count) continue
    if (entry.kind === 'event') eventRows++
    rows.push({
      id: `${entry.kind}:${entry.folded}`,
      kind: entry.kind,
      label: entry.label,
      searchText: entry.searchText,
      category: entry.category,
      eventId: entry.eventId,
      count,
      parts: highlightParts(entry.label, needle),
    })
  }
  return rows
}
