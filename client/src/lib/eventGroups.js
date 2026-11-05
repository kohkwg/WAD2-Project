// ten interest tags roll up into five groups. discover chips, event artwork and map pins
// all read from here, so a group always looks the same everywhere.

export const EVENT_GROUPS = [{
  id: 'hangouts',
  label: 'Hangouts',
  categories: ['gaming', 'food'],
  art: 'festival'
}, {
  id: 'learn',
  label: 'Learn & career',
  categories: ['tech', 'career'],
  art: 'city'
}, {
  id: 'arts',
  label: 'Arts & music',
  categories: ['arts', 'music'],
  art: 'arts'
}, {
  id: 'sports',
  label: 'Sports & wellness',
  categories: ['sports', 'outdoors', 'wellness'],
  art: 'sports'
}, {
  id: 'community',
  label: 'Community',
  categories: ['volunteering'],
  art: 'garden'
}];

export function groupOfCategory(category) {
  const value = String(category || '').toLowerCase();
  return EVENT_GROUPS.find(group => group.categories.includes(value)) || null;
}

export function sameCategories(a, b) {
  return a.length === b.length && a.every(category => b.includes(category));
}
