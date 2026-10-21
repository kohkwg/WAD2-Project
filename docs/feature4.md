# Feature 4: organiser operations

Current guide after the Gregory merge review, 21 October 2026. Denzel owns tasks,
announcements, budget tracking and weather-assisted venue switching. The app uses
Vue 3 Composition API, JavaScript, Bootstrap 5 and an asynchronous localStorage
demo layer. Weather uses real public HTTP reads; tests substitute controlled data.

## Run and verify

Use Node 22 and pnpm. From the repository root:

```sh
pnpm --dir client install --frozen-lockfile --ignore-scripts
pnpm --dir client dev
```

Open [My events](http://127.0.0.1:5173/organiser/events), then **Manage event**.
The route is `/organiser/events/:id/manage?tab=tasks`; other tools are
`announcements`, `budget` and `weather`. The public event/feed route is
`/events/:id/rsvp`.

The ordinary demo uses Gregory’s event list. Browser and Node tests add
`e-weather-demo` only inside their isolated test environment. **Reset demo data** asks for
confirmation, deletes all local event/RSVP/Feature 4 edits and reseeds on reload.
The demo event ages with saved storage; switch availability depends on current
weather and the event falling inside the forecast window.

```sh
pnpm --dir client build
pnpm --dir client test:unit
pnpm --dir client exec playwright install chromium
pnpm --dir client test:e2e
```

Chromium installation is a one-time setup. Playwright starts/reuses Vite on
`127.0.0.1:5173`. Express is optional and exposes only `/health`. No credentials,
local database, Docker, R2 emulator or weather scheduler are needed for the demo.
See [verification](testing.md) for current results, coverage and limitations; see the
[final review](reviews/2026-10-17-final-review.md) for fix acceptance and remaining
integration work.

## Behaviour

| Tool | Current behaviour |
| --- | --- |
| Tasks | Event-specific To do / In progress / Done columns. Required title, optional notes, create/edit/confirmed delete. SortableJS dragging plus status and Up/Down controls. New tasks append to To do; status/order save together. |
| Announcements | Plain-text manual posts, newest first, with create/edit/confirmed delete and edit timestamps. Public before RSVP. Automatic venue-switch posts are immutable in the demo. |
| Budget | Separate optional positive SGD limit and expense rows: name, category, planned and actual costs. Nonnegative integer cents; at most two decimal places; blank actual means zero. Warn at 90% actual spend, reached at 100%, over above 100%. |
| Weather | Fetch on tool entry or Refresh. Show source, area, condition and Singapore-time validity; diagnostic timestamps appear in Forecast details. Nearest area is an approximation; invalid/missing numeric coordinates require a saved manual choice. |
| Venue switch | Current rain/showers and an eligible outdoor event enable confirmation. Require a backup with address and an upcoming/ongoing event inside the forecast window. One-way only; confirmation rechecks eligibility. One demo write saves the active venue and one automatic public post. Repeated attempts reconcile saved success. |

Budget categories are Food & drink, Venue, Equipment, Marketing and Other. Totals
show planned, actual and remaining funds. Unset limit differs from zero and has
no percentage warning. Display/edit preserves exact cents throughout the demo's
safe-integer range; the future database has a smaller range to reconcile.

Each Weather entry/Refresh uses `getEventWeather(eventId)` to derive forecast and
areas from one HTTP response. Confirmation still reads fresh eligibility; the
combined snapshot is not a cache or a substitute for confirmation validation.
Unknown, malformed, stale, future or failed weather never enables switching.
Forecast reads have a 15-second deadline including JSON body loading. Ended,
indoor, far-future, missing-backup and already-switched events cannot switch.
Original venue data is retained; `event.venue` is the effective venue shown publicly.
There are no booking checks, reversals, email/push notifications or background switches.

Tool drafts survive tab changes and failed saves; changing event IDs clears them.
Cancelling a failed destructive action invalidates its retry. Dialog closure returns
focus to the opener or a logical action in the original tool; keyboard task moves
retain focus after save, failure and retry.
Public **Refresh announcements** reads posts and event details together, then
updates the venue/feed while preserving RSVP drafts. Failure retains the previous
pair and offers retry. This is explicit manual refresh, not live subscriptions or
transactionally consistent production reads. Initial feed loading is independent
of private RSVP loading. Current updates appear beside the public event summary
and before RSVP actions in mobile/DOM order. Required question groups use native
semantics, associated errors and a focused validation summary.

The fixed `org1`/`u1` identities and local ownership checks are demo workflow
guards. Event deletion now cascades in the demo through RSVPs, tasks, posts,
budget and saved forecast choice; the imported SQL has database cascades. Browser storage is editable by its user and provides no production auth,
RLS, cross-tab transaction or multi-user concurrency guarantee. Gregory’s Leaflet
map now renders event pins; the organiser may move the pin, whose coordinates
are authoritative for weather even if the address text stays the same. The
effective venue and pin must match after a backup switch.

## Components and data flow

`ManageEventView.vue` owns saved workspace data and per-tool request state. It
passes props to `event-operations/{TaskBoard,AnnouncementManager,BudgetTracker,WeatherTool}`
and handles emitted actions through `utils/api.js`. `ConfirmationDialog` is shared.
`AnnouncementFeed` is independently reusable and currently mounts on `RsvpView`.
Money and weather interpretation live in `feature4.js` and `feature4Weather.js`.
Event-ID/request guards prevent older results replacing a different event.

All data functions remain asynchronous. Storage key `bookedz-feature2-demo` holds
existing event/RSVP data plus
`feature4: { version, tasks, announcements, budgets, forecastAreas }`.
Additive migration preserves existing records and unknown fields.

| Capability | API contract |
| --- | --- |
| Private workspace | `getEventOperations(eventId)` → `{ event, tasks, announcements, budget: { limitCents, items }, forecastAreaOverride }` |
| Tasks | `createTask(eventId, input)`, `updateTask(eventId, taskId, input)`, `deleteTask(eventId, taskId)` |
| Board | `saveTaskBoard(eventId, columns)`; complete ordered IDs for `todo`, `in_progress`, `done`, every task exactly once |
| Public feed | `getAnnouncements(eventId)`; public post DTOs only |
| Manual posts | `createAnnouncement(eventId, body)`, `updateAnnouncement(eventId, announcementId, body)`, `deleteAnnouncement(eventId, announcementId)` |
| Budget | `saveBudgetLimit(eventId, limitCents)`, `saveBudgetItem(eventId, input)`, `deleteBudgetItem(eventId, itemId)` |
| Weather | `getEventWeather(eventId)` → `{ forecast, areas }` from one read; existing `getForecastAreas()`, `setForecastArea(eventId, areaName)`, `getEventForecast(eventId)` remain asynchronous |
| Switch | `confirmBackupVenueSwitch(eventId)` → `{ event, announcement }` |

Tasks carry `id/eventId/title/notes/status/position`. Posts carry
`id/eventId/body/kind/createdAt/updatedAt`; kind is `manual` or `venue-switch`.
Expense inputs carry `name/category/plannedCents/actualCents` and `id` when editing.
Preserve async success/failure, exact money and public/private separation in a live adapter.

## Live integration handoff

Timothy’s `tim` branch contains the same imported initial SQL and a CRUD
script, not an additional Feature 4 contract. The browser publishable key
connects to the supplied project; the local server secret key was rejected
by Supabase, so no test accounts were created.
The agreed direction uses the existing browser Supabase client with real user
auth/RLS. Live Feature 4 stays unavailable until Timothy approves its contracts;
the venue switch remains disabled. Feature 4 needs no parallel
Express CRUD layer. Keep privileged keys server-side and failed live writes
visible; do not silently substitute demo writes.

| Frontend | Imported SQL mapping |
| --- | --- |
| Tasks | `notes` → `description`; preserve `status` and `position`; optional assignee/role/due fields do not add UI scope |
| Expenses | `kind='expense'`; name → `description`; planned/actual cents ↔ decimal SGD `estimated_amount`/`actual_amount` (`numeric(12,2)`); nullable actual reads as zero |
| Manual posts | `title='Event update'`, `body`, `audience='everyone'`, `is_automatic=false` |
| Effective venue | Derive from original `venue_id`, `backup_venue_id` and `using_backup`; retain the primary venue |
| Switch RPC | `switch_event_venue(p_event_id, p_use_backup=true, p_message=null)` returns an announcement row; refetch event for the UI contract |

Before activation, confirm deployed migrations, real auth sessions/test records
and these gaps with Timothy:

- Public anonymous/pre-RSVP announcement reads and owner-only private tools versus
  imported helper/co-organiser permissions.
- The follow-up `20261021000000_public_announcements.sql` migration grants anonymous
  read access to `everyone` posts for published events. It is prepared for
  Timothy's review and has not been deployed or verified against cloud RLS.
- Authoritative positive overall budget limit; exact decimal mapping and the
  database's smaller amount range (maximum SGD 9,999,999,999.99 per amount).
- Immutable automatic posts, manual edited timestamps, atomic board saves and a
  persisted manual forecast-area preference.
- Authoritative one-way weather-switch eligibility. The imported RPC permits
  reversal and does not check current rain, forecast validity or event timing.
- Reconciliation after uncertain/committed writes. Already-at-target currently
  raises an error; read the event/history before retrying. A failed post-commit
  refresh must not create another automatic post or imply rollback.

Verify grants/RLS, denied access, expired sessions, concurrent writes and response
loss against approved development records. Coordinate stable venue/plan identity
with Gregory/Vivienne and public feed placement with Aishani. Ownership and
remaining teammate defects are in the [handoff](iteration2-teammate-handoff.md).

## History and attribution

[Iteration 1](feature4-iteration1.md) delivered the demo.
[Iteration 2](iteration2-implementation.md) fixed ordering/refresh and refined the
shared Bootstrap presentation. The [branch handoff](handoff.md) records the later
review fixes, teammate coordination and remaining live work. The public [AI disclosure](../README.md#ai-assistance-disclosure)
identifies AI-authored implementation, tests and documentation.
[SortableJS](https://github.com/SortableJS/Sortable) (MIT) powers dragging;
[Playwright](https://github.com/microsoft/playwright) (Apache-2.0) powers browser
tests. Preserve attribution in code and presentation materials.
