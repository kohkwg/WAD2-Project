// The answer types an organiser can ask for on the RSVP form, and what each one stores.
// The database has these as short_text, long_text, yes_no, number, single_choice and multi_choice.
export const QUESTION_TYPES = [
  { value: 'text', label: 'Short answer' },
  { value: 'longtext', label: 'Long answer' },
  { value: 'yesno', label: 'Yes / No' },
  { value: 'number', label: 'Number' },
  { value: 'choice', label: 'Pick one' },
  { value: 'multichoice', label: 'Pick several' },
]
export const OPTION_RANGE = { min: 2, max: 10, length: 80 }

export const questionTypeLabel = (type) => QUESTION_TYPES.find((entry) => entry.value === type)?.label || 'Short answer'
export const needsOptions = (type) => type === 'choice' || type === 'multichoice'

// "Red, Blue" or one per line → ['Red', 'Blue'] (trimmed, no blanks, no repeats)
export function parseOptions(text) {
  const seen = new Set()
  const options = []
  for (const part of String(text || '').split(/[\n,]/)) {
    const option = part.trim().slice(0, OPTION_RANGE.length)
    if (option && !seen.has(option.toLowerCase())) { seen.add(option.toLowerCase()); options.push(option) }
  }
  return options
}
export const optionsError = (options) => (options.length < OPTION_RANGE.min
  ? `Give at least ${OPTION_RANGE.min} options.`
  : options.length > OPTION_RANGE.max ? `Give at most ${OPTION_RANGE.max} options.` : '')

// The empty answer a fresh RSVP form starts with
export const blankAnswer = (type) => (type === 'multichoice' ? [] : '')
export const answerIsEmpty = (answer) => (Array.isArray(answer) ? answer.length === 0 : String(answer ?? '').trim() === '')

// How a saved answer reads in the guest list
export function answerText(question, answer) {
  if (answer === undefined || answer === null || answerIsEmpty(answer)) return '—'
  if (question.type === 'yesno') return answer === 'yes' ? 'Yes' : 'No'
  return Array.isArray(answer) ? answer.join(', ') : String(answer)
}
