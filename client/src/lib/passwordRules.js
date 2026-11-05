// Rule for a new password (Create account, Change password). Sign in does not use it, so
// older accounts with shorter passwords can still get in. Keep in step with the minimum
// password length set in Supabase (Authentication, Sign In / Providers, Email).
export const MIN_PASSWORD_LENGTH = 8

export function passwordErrors(password) {
  return password.length < MIN_PASSWORD_LENGTH ? [`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`] : []
}
