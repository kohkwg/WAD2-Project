// Turns OCR text from a receipt into candidate expense lines: [{ name, cents }].
const SKIP = /\b(sub\s*-?\s*total|total|gst|tax|change|cash|visa|master(card)?|nets|rounding|service\s*charge|amount\s*due|tender|balance|payment|paid|discount|card)\b/i
// "TX (7.5%)"-style lines are taxes or discounts, however the word was misread.
const PERCENT_LINE = /\(\s*\d+(\.\d+)?\s*%\s*\)/
const PRICE_AT_END = /^(.*?)[\s.:*-]*(?:S?\$|SGD)?\s*(\d{1,6}[.,]\d{2})\s*[A-Za-z]?$/

export function parseReceiptText(text) {
  const items = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || SKIP.test(line) || PERCENT_LINE.test(line)) continue
    const match = PRICE_AT_END.exec(line)
    if (!match) continue
    const name = match[1].replace(/^\d+\s*[x×]?\s+/i, '').replace(/[|_~]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!/[A-Za-z]{2}/.test(name)) continue
    const cents = Math.round(Number(match[2].replace(',', '.')) * 100)
    if (!Number.isSafeInteger(cents) || cents <= 0) continue
    items.push({ name: name.slice(0, 80), cents })
  }
  // Totals are often misread ("Tora", "AHOUNT"): drop trailing lines that repeat the last item or equal the sum above them (plus up to 12% tax).
  while (items.length > 1) {
    const last = items.at(-1).cents
    const before = items.slice(0, -1)
    const sum = before.reduce((total, item) => total + item.cents, 0)
    if (last === before.at(-1).cents || (before.length >= 2 && last >= sum - 2 && last <= sum * 1.12 + 2)) items.pop()
    else break
  }
  return items
}

// First "dd/mm/yyyy" (day first, as on Singapore receipts) with an optional "hh:mm", as a datetime-local value.
export function parseReceiptDate(text) {
  const match = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:\D{1,3}(\d{1,2}):(\d{2}))?/.exec(String(text || ''))
  if (!match) return ''
  const [, day, month, rawYear, hour = '12', minute = '00'] = match
  const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear)
  const date = new Date(year, Number(month) - 1, Number(day), Number(hour), Number(minute))
  if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day) || date.getHours() !== Number(hour)) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${year}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
