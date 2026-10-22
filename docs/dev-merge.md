# `dev` merge and integration guide

Current working reference for the first Denzel–Gregory–Timothy integration,
22 October 2026. Start here for branch history, app behaviour, accepted decisions
and remaining contracts. [Feature 4](feature4.md) contains its detailed API and
weather rules; [verification](testing.md) separates tested behaviour from plans.
Current conclusions from earlier iteration notes and review reports are included
in these guides. Their full original versions remain in Git history.

## What was merged

| Source | Included work | Why the interface looks familiar |
| --- | --- | --- |
| `denzel` at `4b5ad7b` | Feature 4 organiser tasks, announcements, SGD budget, weather switch, accessibility/retry fixes and the existing event/RSVP demo scaffold. | This branch already contained much of Gregory's earlier event/RSVP UI and a selective copy of Timothy's initial Supabase SQL/client. |
| `tim` at `575e20d` | Initial database schema, RLS and RSVP functions; Supabase configuration, a health-only Express scaffold and a manual CRUD check script. `main` merged `tim` at `f969d40`, before `dev` was assembled. | SQL, permissions and a health route add little visible UI. The SQL source is not proof that every migration is deployed. |
| `gregory` at `a07ae60` | Updated event creation, RSVP/waitlist management, sign-in UI, Supabase event/RSVP adapter, and a Leaflet venue map with a movable pin. | The earlier screens existed on `denzel`; the most substantial addition is live data wiring. |
| Merge integration | The async `api.js` boundary now selects demo or Supabase for event/RSVP/auth calls. Conflict resolution retained Feature 4 demo behaviour, public event routes, effective venue display, attendee removal and event deletion. | The same pages render both data modes. |

The local `dev` branch and `origin/dev` reached `4a82d01` after PR
[#2](https://github.com/kohkwg/WAD2-Project/pull/2) merged the integration
branch. The earlier direct Gregory PR
[#1](https://github.com/kohkwg/WAD2-Project/pull/1) was automatically marked
merged when the same commits arrived through PR #2. The temporary
`codex/gregory-dev-integration` branch remains in Git history but is already
integrated. `dev` contains all three contributions; it has not been merged to
`main`. The local `gregory` branch may lag `origin/gregory`, and Timothy's
`tim` is remote-only in this checkout; neither fact removes their commits from
`dev`. Team members should start their next feature iteration from `dev`, work
on their own branch and return changes through review. The current checkout is
in the Syncthing project folder; no second worktree is required.

## How the merged app works

The Vue app starts at `client/src/main.js`; `client/src/router/index.js` selects
pages. Pages use `client/src/utils/api.js`, which selects `mockApi.js` or
`supabaseApi.js` for events, RSVPs and authentication. The live Feature 4
adapter uses `supabaseFeature4Api.js` and `supabaseFeature4Weather.js`; the
NEA-confirmed switch also has an authenticated Edge Function and server-only
database transaction. The SQL and function are deployed to the Bookerz development
project; signed-in browser flows still need verification. With a browser Supabase
URL and publishable key, Supabase mode is selected unless
`VITE_USE_MOCK=true`. Without those values, the app uses the browser-local demo.
No server secret belongs in a `VITE_` variable. The demo is not a production
security boundary and does not silently replace failed live writes.

| Route / area | Implemented behaviour |
| --- | --- |
| `/events`, `/events/:id/rsvp` | Public event list/details, current venue and map, announcements area, RSVP entry. These routes stay open before login. |
| `/login` | Supabase sign-in/sign-up; private routes redirect here when no session exists. |
| `/my-rsvps` | Participant registrations, offers, cancellation and closed statuses. |
| `/organiser/events/new` | Four-step creation form; OneMap address search, exact map pin, optional backup venue and RSVP questions. |
| `/organiser/events/:id/rsvps` | Organiser approval, rejection, confirmed-attendee removal, membership and waitlist views. |
| `/organiser/events/:id/manage` | Denzel's demo tools and deployed live owner-only tasks, announcements, budget, weather and NEA-confirmed switching. |

The demo uses Gregory's seed event list in `mockData.js` and stores changes in
browser `localStorage`. A near-start weather event is added only by isolated tests.
The demo waitlist score weights membership 40%, matching interests 30% and
attendance history 30%; offers reserve a place for 24 hours. In live mode the
Supabase adapter calls database functions for registration, availability,
approval, cancellation and offers. The initial SQL also defines check-in,
floor-plan, programme and helper tables/functions, but their teammate UI is
not part of this merge. `/events` remains a placeholder list until Aishani's
discovery branch is integrated; attendance and floor-plan/programme pages are
likewise pending their owners.

`server/server.js` currently exposes only `/health`; frontend event/RSVP/auth
calls go directly from the browser to Supabase. Its `test:crud` script is a
separate manual integration check, not the running application API.

## Decisions made during conflict resolution

- A published event and its public update area must be reachable before login.
  Show the **effective** venue and pin after a backup switch.
- The moved map pin is the event's exact coordinate, even if the displayed venue
  name/address remains unchanged. Weather uses that coordinate for the nearest
  forecast area.
- An organiser may remove a confirmed attendee after confirmation. Record the
  result as `rejected`, display **Declined by organiser**, and offer a freed place
  to the waitlist. It must not count as the attendee's late cancellation.
- The organiser may delete an event after confirmation. The demo removes its
  RSVPs, tasks, posts, budget and saved forecast area. The initial SQL cascades
  event-linked rows; storage-file cleanup still needs its infrastructure worker.
- Use Gregory's ordinary demo seed list. The Feature 4 weather event is test-only.
- Use the deployed owner-scoped database contracts and authenticated NEA switch
  function for live Feature 4. Complete signed-in browser verification before
  release. Do not add a parallel Express CRUD implementation or use a privileged
  key in the browser.

The 17 October frontend review pass also fixed destructive-action retry/focus,
keyboard task moves, public feed placement, duplicate weather reads, new-offer
refresh, stale OneMap results, publication-time validation and reused-route state.
These were checked in isolated demo tests; they do not establish hosted behaviour
or complete accessibility.

## Live project and verification status

The supplied Supabase project URL is configured locally. The server-only secret
key was repaired after the merge. Two confirmed development accounts,
`test1@example.com` and `test2@example.com`, were created; browser sign-in and
profile reads were verified for both. Never put their passwords or privileged
keys in Git, documentation or client environment variables.

On 22 October, a read-only inventory found 36 published events, including ten
titles repeated three times. The old event-related rows were backed up locally,
then all 36 events and their six registrations were removed. Six distinct future
events were published, three owned by each test account. A readback using both
the administrative connection and public publishable-key access found exactly
six visible published events, three per owner, zero old registrations and one
organiser membership per new event. Accounts and the shared venue catalogue
were retained. This was a hosted data cleanup, not a repository change or proof
that the app's live creation flow works end to end.

The latest 22 October full regression passed the production build, seven Node
test files, five NEA rule cases and all 51 isolated Chromium tests. A live public
mobile-page check loaded events, the RSVP detail and its announcement section
before login with no page alerts or uncaught errors. Signed-in Feature 4 writes
remain unverified. See [verification](testing.md) for reproducible commands.

## Live Feature 4 verification

The hosted Feature 4 migrations, Edge Function and browser adapter implement the
owner-only contract, atomic task-board saves and task position changes,
separate budget limit, exact-cent mapping, manual announcement history, saved
forecast-area choice and NEA-confirmed one-way switching. Gregory's live event
creation has an atomic, idempotent RPC. The migrations and function are deployed;
signed-in owner and other-user browser checks remain. Verify:

1. Anonymous access to `everyone` announcements on published events. The narrow
   `supabase/migrations/20261022055852_public_announcements.sql` policy is
   deployed; a read-only hosted policy audit found its published/everyone scope.
2. The owner-only policy versus the initial SQL's broader staff/helper policies;
   settings and task RPC grants/RLS, money limits, edit history, concurrent writes
   and response-loss behavior with real development records.
3. `20261022055913_trusted_nea_venue_switch.sql` and the `venue-switch` Edge
   Function. The function checks a fresh NEA two-hour forecast against the
   persisted original venue coordinates; its server-only RPC rechecks owner,
   timing and one-way state, then saves the event/post/retry record atomically.
   The initial reversible RPC and direct `using_backup` writes remain blocked.
4. `20261022060014_atomic_event_creation.sql` and the browser create adapter.
   The new RPC saves venues, event, tags and questions together, with a stable
   request ID for response-loss retries. Verify owner permissions, denied/expired
   sessions, concurrent writes, deletion effects and registration/offer cutoffs
   with development records.
5. `20261022083028_private_availability_counts.sql` narrows public availability
   to published events and hides pending and offered counts from non-organisers.
   Hosted function definition, grants and anonymous read behavior were checked.

Coordinate discovery/details with Aishani, attendance/shared UI with Huxley,
venue/plan identity with Vivienne and event/RSVP policy with Gregory. Existing
source and test results should be reviewed by those owners before treating
the integration as a final release.

The [root README's disclosure](../README.md#ai-assistance-disclosure) records
AI-authored work and preserves original contribution attribution. Original course
PDFs and local private notes are intentionally outside the portable repository.
