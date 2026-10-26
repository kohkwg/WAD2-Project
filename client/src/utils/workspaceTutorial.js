// Browser-local onboarding preferences; no event data or hosted writes.
const remembered = new Set()
export const tutorialKey = (ownerId, live) => `bookedz:organiser-tour:v1:${live ? 'live' : 'demo'}:${encodeURIComponent(ownerId)}`
export function hasSeenTutorial(ownerId, live) {
  const key = tutorialKey(ownerId, live)
  if (remembered.has(key)) return true
  try { return Boolean(localStorage.getItem(key)) } catch { return false }
}
export function markTutorialSeen(ownerId, live, outcome) {
  const key = tutorialKey(ownerId, live)
  remembered.add(key)
  try { localStorage.setItem(key, outcome) } catch { /* Remember for this session when storage is blocked. */ }
}

export const WORKSPACE_TOUR_STEPS = Object.freeze([
  { id: 'context', title: 'Your event workspace', tab: 'tasks', target: '[data-workspace-tour="context"]', body: 'Check the event name, time and active venue here. Every tool in this workspace belongs to this event.' },
  { id: 'add-task', title: 'Start with a task', tab: 'tasks', target: '[data-workspace-tour="add-task"]', body: 'Use Add task to capture a job before the event. A title is enough; notes are optional. This tour will not create or change any tasks.' },
  { id: 'task-controls', title: 'Keep track of the work', tab: 'tasks', target: '[data-workspace-tour="task-controls"]', body: 'Search and filter Open, Completed or All tasks here. In the list below, tick a checkbox to complete a task, or open its title to start work and see the details.' },
  { id: 'announcements', title: 'Update your participants', tab: 'announcements', target: '[data-workspace-tour="announcements"]', body: 'Write announcements here. Publishing makes an update visible on the public event page. Existing posts can be edited or removed.' },
  { id: 'budget', title: 'Watch your event budget', tab: 'budget', target: '[data-workspace-tour="budget"]', body: 'See the budget limit, planned costs, actual spending and remaining funds. Add expenses below to keep these totals up to date. Amounts are in Singapore dollars.' },
  { id: 'weather', title: 'Check the backup plan', tab: 'weather', target: '[data-workspace-tour="weather"]', body: 'Check your active and backup venues here. A switch is offered only when the latest authorised weather check allows it. Confirming a switch is one-way and posts a public venue update.' },
  { id: 'guests', title: 'Find guest and venue tools', tab: 'tasks', target: '[data-workspace-tour="guests"]', revealSections: true, body: 'Registrations manages sign-ups, approvals and the waitlist. In live mode, this group also links to check-in, Venue QR, the attendance report and floor plan, subject to your access.' },
  { id: 'public-event', title: 'See what participants see', tab: 'tasks', target: '[data-workspace-tour="public-event"]', body: 'Open the public event page to check the details and announcements participants can see. You can replay this tutorial from the event header whenever you need it.' },
])
