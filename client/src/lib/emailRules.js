// Email checks that say what is wrong, in the style of the browser's own email messages.
// `requireCom` makes the address end in .com. The sign-in page turns it on for every form
// (Sign in, Create account, Forgot password).
export function emailError(raw, { requireCom = false } = {}) {
  const value = raw.trim()
  if (!value) return 'Please enter your email address.'
  if (/\s/.test(value)) return 'The email address cannot contain spaces.'
  const at = value.indexOf('@')
  if (at === -1) return `Please include an '@' in the email address. '${value}' is missing an '@'.`
  if (value.indexOf('@', at + 1) !== -1) return `A part following '@' should not contain the symbol '@'.`
  if (at === 0) return `Please enter a part followed by '@'. '${value}' is incomplete.`
  const domain = value.slice(at + 1)
  if (!domain) return `Please enter a part following '@'. '${value}' is incomplete.`
  if (requireCom) {
    if (!/\.com$/i.test(domain)) return `Please end the email address with '.com', for example name@gmail.com. '${value}' does not.`
    if (domain.length <= 4 || domain.startsWith('.')) return `Please enter a domain name between '@' and '.com', for example name@gmail.com.`
  }
  return ''
}
