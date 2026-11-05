// Email checks. `simple` gives the one generic message used by Sign in; otherwise the message
// says what is wrong, in the style of the browser's own email messages. Any real-looking
// domain is fine (.com, .edu.sg, .org, ...).
const GENERIC = 'Please enter a valid email address.'

export function emailError(raw, { simple = false } = {}) {
  const value = raw.trim()
  if (!value) return 'Email is required.'
  const fail = detailed => (simple ? GENERIC : detailed)
  if (/\s/.test(value)) return fail('The email address cannot contain spaces.')
  const at = value.indexOf('@')
  if (at === -1) return fail(`Please include an '@' in the email address. '${value}' is missing an '@'.`)
  if (value.indexOf('@', at + 1) !== -1) return fail(`A part following '@' should not contain the symbol '@'.`)
  if (at === 0) return fail(`Please enter a part followed by '@'. '${value}' is incomplete.`)
  if (at === value.length - 1) return fail(`Please enter a part following '@'. '${value}' is incomplete.`)
  // Domain: dot-separated labels, ending in a letters-only extension of 2+ characters.
  if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value.slice(at + 1))) {
    return fail(`Please enter a valid domain after the '@', for example name@gmail.com.`)
  }
  return ''
}
