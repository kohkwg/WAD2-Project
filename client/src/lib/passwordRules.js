// Rules for a new password (Create account and Reset password). Sign in does not use these,
// so older accounts with shorter passwords can still get in.
export function passwordErrors(password) {
  const errors = []
  if (password.length < 10) errors.push('Password must be at least 10 characters long.')
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) errors.push('Password must have both uppercase and lowercase letters.')
  if (!/\d/.test(password)) errors.push('Password must include at least one number.')
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must include at least one special character (like ! @ # $).')
  return errors
}
