// Early tests for the waitlist scoring (the profs asked for test code early).
// Run with:  pnpm test:unit
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  interestMatch,
  showUpRate,
  calculateWaitlistScore,
  NEW_USER_SHOW_UP,
} from '../waitlistScore.js'

const today = new Date('2026-10-14T12:00:00')
const daysAgo = (n) => new Date(today.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

describe('interestMatch', () => {
  it('is the share of event tags the person is interested in', () => {
    assert.equal(interestMatch(['music'], ['music', 'tech']), 0.5)
    assert.equal(interestMatch(['music', 'tech'], ['music', 'tech']), 1)
    assert.equal(interestMatch(['sports'], ['music']), 0)
  })

  it('is 0 when the event has no tags', () => {
    assert.equal(interestMatch(['music'], []), 0)
  })
})

describe('showUpRate', () => {
  it('gives new users a neutral middle value', () => {
    assert.equal(showUpRate([], today), NEW_USER_SHOW_UP)
  })

  it('is 1 for someone who always turned up', () => {
    const history = [
      { eventDate: daysAgo(5), attended: true, lateCancel: false },
      { eventDate: daysAgo(50), attended: true, lateCancel: false },
    ]
    assert.ok(Math.abs((showUpRate(history, today)) - (1)) < 0.005)
  })

  it('counts recent events more than old ones', () => {
    // Same record (1 show, 1 no-show), only the timing differs
    const showedUpRecently = [
      { eventDate: daysAgo(5), attended: true, lateCancel: false },
      { eventDate: daysAgo(200), attended: false, lateCancel: false },
    ]
    const showedUpLongAgo = [
      { eventDate: daysAgo(200), attended: true, lateCancel: false },
      { eventDate: daysAgo(5), attended: false, lateCancel: false },
    ]
    assert.ok((showUpRate(showedUpRecently, today)) > (showUpRate(showedUpLongAgo, today)))
  })

  it('penalises a late cancellation more than a plain no-show', () => {
    const noShow = [{ eventDate: daysAgo(10), attended: false, lateCancel: false }]
    const attendedOnce = { eventDate: daysAgo(10), attended: true, lateCancel: false }
    const withNoShow = [attendedOnce, ...noShow]
    const withLateCancel = [
      attendedOnce,
      { eventDate: daysAgo(10), attended: false, lateCancel: true },
    ]
    assert.ok((showUpRate(withLateCancel, today)) < (showUpRate(withNoShow, today)))
  })

  it('never goes below 0', () => {
    const history = [{ eventDate: daysAgo(1), attended: false, lateCancel: true }]
    assert.equal(showUpRate(history, today), 0)
  })
})

describe('calculateWaitlistScore', () => {
  const base = { userInterests: ['music'], eventTags: ['music'], history: [], today }

  it('ranks a member above an otherwise identical non-member', () => {
    const member = calculateWaitlistScore({ ...base, isMember: true })
    const nonMember = calculateWaitlistScore({ ...base, isMember: false })
    assert.ok((member.total) > (nonMember.total))
  })

  it('returns the parts so the organiser can see why', () => {
    const result = calculateWaitlistScore({ ...base, isMember: true })
    assert.deepEqual(result.parts, { member: 1, interest: 1, showUp: NEW_USER_SHOW_UP })
    assert.ok(Math.abs((result.total) - (0.4 + 0.3 + 0.3 * NEW_USER_SHOW_UP)) < 0.005)
  })
})
