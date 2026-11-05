// rule for a new password (create account, change password). sign in does not use it, so
// older accounts with shorter passwords can still get in. keep in step with the minimum
// password length set in supabase (authentication, sign in / providers, email).

const MIN_PASSWORD_LENGTH = 8;

export function passwordErrors(password) {
  return password.length < MIN_PASSWORD_LENGTH ? [`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`] : [];
}
