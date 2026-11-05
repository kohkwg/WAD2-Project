// name and username rules shared by create account and edit profile.
// usernames are stored lowercase, so "aishani" and "aishani" are the same username.

export function cleanUsername(raw) {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

export function nameError(raw) {
  return raw.trim() === '' ? 'Name is required.' : '';
}

export function usernameError(raw) {
  const handle = cleanUsername(raw);
  if (!handle) return 'Username is required.';
  if (!/^[a-z0-9_]+$/.test(handle)) return 'Username can only contain letters, numbers and underscores.';
  if (handle.length < 3 || handle.length > 20) return 'Username must be between 3 and 20 characters.';
  return '';
}

export function postalCodeError(raw) {
  const value = raw.trim();
  return value === '' || /^\d{6}$/.test(value) ? '' : 'Postal code must be exactly 6 digits.';
}
