// Feature 4 uses integer SGD cents at the frontend/demo boundary.
export const TASK_STATUSES = Object.freeze(['todo', 'in_progress', 'done'])
export const BUDGET_CATEGORIES = Object.freeze(['Food & drink', 'Venue', 'Equipment', 'Marketing', 'Other'])
export const FALLBACK_BUDGET_CATEGORY = 'Other'
export const MAX_CATEGORY_LENGTH = 40
export const MAX_QUANTITY = 100_000

export function validateQuantity(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_QUANTITY) throw new Error(`Quantity must be a whole number from 1 to ${MAX_QUANTITY}.`)
  return value
}

export function parseQuantity(value) {
  const input = String(value ?? '').trim()
  if (!/^\d+$/.test(input)) throw new Error(`Quantity must be a whole number from 1 to ${MAX_QUANTITY}.`)
  return validateQuantity(Number(input))
}

/** Exact unit cost × quantity; expense amounts are stored as these line totals. */
export function lineTotalCents(unitCents, quantity) {
  validateCents(unitCents)
  const total = BigInt(unitCents) * BigInt(validateQuantity(quantity))
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Line total exceeds the supported cents range.')
  return Number(total)
}

/** Validate an expense's quantity and that each line total splits into whole-cent unit costs. */
export function validateExpenseAmounts({ quantity = 1, plannedCents, actualCents }) {
  validateQuantity(quantity)
  if (validateCents(plannedCents) % quantity || validateCents(actualCents) % quantity) throw new Error('Line totals must divide into whole-cent unit costs.')
  return quantity
}

/** Built-in categories, then an event's custom ones, with the fallback kept last. */
export function budgetCategoryOptions(custom = []) {
  return [...BUDGET_CATEGORIES.filter((name) => name !== FALLBACK_BUDGET_CATEGORY), ...custom, FALLBACK_BUDGET_CATEGORY]
}

/** Trimmed custom category name, rejecting blanks, overlong names and case-insensitive duplicates. */
export function validateCategoryName(value, existing = []) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!name) throw new Error('Enter a category name.')
  if (name.length > MAX_CATEGORY_LENGTH) throw new Error(`Category names can be at most ${MAX_CATEGORY_LENGTH} characters.`)
  if (budgetCategoryOptions(existing).some((entry) => entry.toLowerCase() === name.toLowerCase())) throw new Error(`“${name}” is already a category.`)
  return name
}

export function validateCents(value, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < 0 || (positive && value === 0)) {
    throw new Error(positive ? 'Budget limit must be positive integer cents.' : 'Amount must be nonnegative integer cents.')
  }
  return value
}

/** Convert a plain decimal SGD input without floating point multiplication. */
export function parseMoneyToCents(value, { allowBlank = false } = {}) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Enter a valid money amount.')
  const input = String(value).trim()
  if (input === '' && allowBlank) return 0
  if (!/^\d+(?:\.\d{1,2})?$/.test(input)) throw new Error('Enter a nonnegative amount with at most two decimal places.')
  const [whole, fraction = ''] = input.split('.')
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Money amount exceeds the supported cents range.')
  return Number(cents)
}

/** Exact decimal input, including every cent at Number.MAX_SAFE_INTEGER. */
export function formatMoneyInput(cents) {
  if (!Number.isSafeInteger(cents)) throw new Error('Money must be integer cents.')
  const amount = BigInt(cents)
  const magnitude = amount < 0n ? -amount : amount
  return `${amount < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`
}

export function formatMoney(cents) {
  const [whole, fraction] = formatMoneyInput(cents).split('.')
  const negative = whole.startsWith('-')
  const grouped = new Intl.NumberFormat('en-SG').format(BigInt(negative ? whole.slice(1) : whole))
  return `${negative ? '-$' : '$'}${grouped}.${fraction}`
}

export function summariseBudget({ limitCents, items }) {
  let plannedCents = 0
  let actualCents = 0
  for (const item of items) {
    plannedCents += validateCents(item.plannedCents)
    actualCents += validateCents(item.actualCents)
    validateCents(plannedCents)
    validateCents(actualCents)
  }
  if (limitCents === null) return { plannedCents, actualCents, remainingCents: null, percentage: null, level: 'unset' }
  validateCents(limitCents, { positive: true })
  const level = actualCents > limitCents ? 'over' : actualCents === limitCents ? 'reached'
    : BigInt(actualCents) * 10n >= BigInt(limitCents) * 9n ? 'warning' : 'normal'
  return { plannedCents, actualCents, remainingCents: limitCents - actualCents, percentage: actualCents * 100 / limitCents, level }
}
