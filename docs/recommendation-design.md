# Recommendation V1 design

Accepted scope, 27 October 2026: deterministic event evidence → preferences →
compatibility → diverse selection. Keep Vue, Express/CommonJS and Supabase.
This is a source-schema review, not verification of the hosted schema. No new
migration or database table has been applied. Core preference/scoring/ranking
functions and their pure pipeline are now implemented locally following Aishani's
staged approvals. Hosted integration remains pending.

## Isolated database verification

The full eleven repository migrations and recommendation SQL draft were executed
in a fresh in-memory PostgreSQL engine (PGlite) outside shared Supabase. All 17
checks in [recommendation-db.check.mjs](../server/checks/recommendation-db.check.mjs)
pass: anonymous/missing-identity denial, own-row isolation and write restrictions,
atomic explicit-interest profile saving/rollback, first save/confirmation dates,
confirmation/approval/cancellation, waitlist offer acceptance, event creation,
existing waitlist scoring, authoritative attendance/undo/fraud flags, 91-day
reactivation and transactional removal-order verification. No application or draft
SQL corrections were required by these checks.

This is genuine SQL execution with actual application functions, policies and
triggers, but Supabase auth identity, storage and cron use local platform
substitutes; default grants model Supabase's documented project configuration.
It does not validate hosted JWT sign-in, PostgREST/schema cache, hosted grants,
Realtime, storage services or multi-connection concurrency. No shared database
connection, migration or application deployment occurred. Shared deployment and
real signed-in test data still need explicit approval; humans sign in themselves.

## MVP application wiring (prepared locally)

The existing recommendation route now loads V1 inputs directly with the caller-JWT
Supabase utility; no additional data-loader service was introduced. It paginates
user-scoped interests, preferences, registrations, check-ins and memberships, then
loads historical tag mappings in batches independently of upcoming candidates.
Only confirmed registrations earn evidence, using `first_confirmed_at`; missing
confirmation metadata fails explicitly. Rejected registrations and own-team events
are removed before the unchanged pipeline. GET preserves `{ events: [...] }` and
flat event fields, adds compatibility/ranking/source and supported reasons, and
keeps legacy `score` as compatibility divided by 100.

POST `/api/recommendations/:eventId/preferences` accepts save/unsave/dismiss/undo
through the existing evidence store. The legacy `/interactions` endpoint now
verifies authoritative facts without permanently increasing weights. The old
attendance trigger is untouched; its legacy weights are not inputs to V1.

Profile now reads `profile_interests` and saves details plus explicit links using
the draft's new `update_recommendation_profile` security-invoker RPC. That operation
is transactional and leaves `interest_weights` unchanged. Existing users may need
to reselect their interests; no automatic inference/backfill from mixed weights.

For You cards show match scores, supported explanations and general-discovery
labels, preserve pipeline order, and provide save/dismiss/undo with refresh,
pending/error states and identity guards. Authenticated recommendation errors show
retry rather than substituting unfiltered public picks. Directory/RSVP/check-in
flows remain existing application behaviour.

**Deployment dependencies:** `user_event_preferences`, its confirmation capture and
backfill, the evidence read/write RPCs and `update_recommendation_profile` are still
review-only SQL. GET/actions fail with HTTP 503 and
`RECOMMENDATION_SETUP_REQUIRED` when required schema/RPCs are absent. Profile save
also depends on the new profile RPC and reports failures without losing drafts.
No SQL against shared Supabase, hosted mutation or deployment occurred. Do not publish this application
wiring before reviewing/applying its database dependencies with the backend owner.

Verification: 53 targeted Node cases (9 route/action, 26 evidence/persistence/pipeline,
18 profile/card/composable) and two mocked Chromium journeys pass on Node 24.12.0.
The browser journeys cover light/dark and 375/575/768/1280px, keyboard/focus,
profile retry and recommendation save/dismiss/undo/retry. No real Supabase calls
were used; hosted SQL/RLS/concurrency and signed-in journeys remain unverified.

## Standalone pipeline

[recommendationPipeline.js](../server/services/recommendationPipeline.js) exports
`buildRecommendationPipeline({ selectedInterests, evidenceSnapshots,
eventInterestsById, candidateEvents, registrations, now, limit = 8,
diversityPenalty = 0.3 })`. It returns `{ preferences, recommendations, diagnostics }`.
`now` is required: a valid Date, finite epoch-millisecond value or ISO timestamp
with an explicit timezone. There are no database calls or wall-clock reads.

All inputs belong to one user and must represent the same supplied instant.
Historical canonical snapshots include saves, current RSVP state, verified
attendance and dismissal. Their event IDs need not appear in upcoming candidates.
The separate `eventInterestsById` object maps both historical and candidate IDs to
canonical slug arrays. Missing mappings yield empty interests and diagnostics;
malformed slug arrays throw. Interests remain flat. The pipeline delegates all
action precedence, dismissal evidence and ageing to `calculateEventEvidence()`.
Conflicting duplicate snapshots throw; identical records count once. Candidate
and registration duplicates follow the same rule (using `id` and `event_id`).

Candidates retain database names: `id`, `status`, `starts_at`,
`registration_closes_at`, `capacity`, `spots_left`. Only published events starting
strictly after `now`, with no deadline or a deadline strictly after `now`, qualify.
Unlimited capacity is explicitly `null`; limited capacity needs a positive integer
capacity and known integer remaining places between 1 and capacity. Invalid dates,
capacity or unknown availability exclude the candidate and produce diagnostics.
The timestamp boundary is intentionally conservative, not a change to existing RPCs.

Dismissed events are excluded from both feeds. Complete current registrations must
be supplied separately: confirmed, pending and waitlisted block candidates. An
offered registration blocks only while the actual schema field `offer_expires_at`
is after `now`. Equality means expired, matching existing registration expiry logic.
Missing/invalid expiry or an unknown status means uncertain eligibility: exclude
that candidate with a diagnostic. Snapshot RSVP flags must already be canonical
for `now`; the pipeline does not reconstruct them from raw registration history.

Eligible candidates are ordered by start time, then ordinal event ID, before
compatibility scoring results enter greedy selection. Personalised copies have
`source: 'personalised'` and their selection-time ranking scores. Remaining slots
use eligible, unselected events in chronological/ID order, with
`source: 'general_discovery'`, actual compatibility and `rankingScore: null`.
Fallback is not a claim of personalised relevance. No eligible events means an
empty list, not invented recommendations. All eligibility gates apply to fallback.

Sixteen local mock-data end-to-end cases pass, including drift, offer boundaries,
duplicate conflicts, dismissal/undo, fallback, deterministic ordering and input
preservation. This does not establish hosted RLS, adapter integration, current data
availability or transactional consistency. Backend ownership/access restrictions
such as organiser/helper registration permissions must also be enforced by the
future data adapter; this pure function has no account or team-role inputs.

## Persistence adapter checkpoint

[eventEvidenceStore.js](../server/services/eventEvidenceStore.js) uses the existing
caller-JWT Supabase factory. Instantiate after `requireAuth` verifies the token.
`getSnapshot(eventId)` reads canonical evidence; `setPreference(eventId, action)`
accepts only `save`, `unsave`, `dismiss`, `undo_dismiss`. No user-ID override,
timestamp, registration mutation or attendance submission is accepted.

The required RPCs/table/first-confirmation trigger are prepared as a
[SQL review draft](sql/recommendation-evidence-draft.sql), outside the automatic
migrations directory. It uses unique user/event rows, own-row read RLS, no direct
write grants, auth-scoped RPCs and server-side timestamps. It retains the first
save/confirmation dates through deactivation and reactivation. Writes change only the
requested preference fields. The proposed attendance policy accepts only existing
check-ins without a fraud flag; marking a flagged record reviewed is insufficient.
This conservative policy needs backend-owner review before integration.

The JavaScript contract fixtures cover the complete action sequence and independent
RSVP cancellation. They simulate persistence; they do not execute the SQL. Actual
PostgreSQL concurrency, RLS, trigger and grant verification are pending. There is
no connected Supabase inspection tool or installed PostgreSQL CLI in this session.
The locally prepared preference route uses this adapter; it is not deployed.

All recommendation test files now use explicit condition checks and thrown errors,
without importing Node's assertion library. Other feature tests are unchanged.

## Existing source schema and function mapping

`buildUserPreferences(selectedInterests, eventEvidence)` is now implemented locally
in [userPreferences.js](../server/services/userPreferences.js). Selected slug strings
receive 10 explicit points each. Each canonical evidence record additionally supplies
`interests`, an array of event interest slugs. Its existing `contribution` is split
equally across unique slugs and accumulated without reapplying ageing or a cap.
Empty-interest and zero-contribution events add no points. The return value contains
`explicitPreferences`, `learnedPreferences` and `combinedPreferences` as independent
objects. Duplicate event IDs count once, assuming identical evidence; conflicting
versions and invalid inputs must be resolved upstream before integration. No parent
propagation is implemented because the existing interests are flat.

The explicit-selection source is `profile_interests` joined to `interests.slug`.
Never reconstruct explicit selections from `profiles.interest_weights`: those
legacy values mix selections and behavioural boosts. Profile's local wiring now
persists this separate contract through the review-only profile RPC.

| Function | Reuse | Gaps / integration work |
| --- | --- | --- |
| `calculateEventEvidence()` | `registrations`: unique `(event_id,user_id)`, status and `created_at`; `check_ins`: unique `registration_id`, user/event and `checked_in_at` | No saved-event or dismissal records. Normalize authoritative records into one snapshot per user/event. |
| `buildUserPreferences()` | `profiles`, `profile_interests(profile_id,interest_id)`, `interests(id,slug,name)`, `event_interests(event_id,interest_id)` | Interests are flat; no parent links. Keep explicit choices separate from reconstructed behaviour. Decide point baselines, caps and parent propagation before implementation. |
| `calculateCompatibility()` | `events`, `event_interests`, `events_with_counts` | No structured topic relevance weights or dedicated format field. Current `rankEvents` score includes context and is not the proposed topic-only match percentage. |
| `selectDiverseEvents()` | Existing greedy Jaccard selection in `server/services/rankEvents.js` | Reuse its approach; connect to the new compatibility only after profile/scoring contracts are settled. Preserve the flat card API until frontend and route can change together. |

`calculateCompatibility(combinedPreferences, eventInterests)` is implemented locally
in [eventCompatibility.js](../server/services/eventCompatibility.js). For each
unique event slug, use `points / (points + 10)`, assigning zero to unmatched tags.
Average across all unique tags and multiply by 100. A single-tag explicit interest
starts at 50/100; this is a defined topic-fit scale, not attendance probability.
Return the unrounded score. Empty/missing tags or empty preference objects yield
zero; integration must distinguish missing information from an actual mismatch.
Assume finite nonnegative point values and canonical slug strings. Candidate events
and unrelated preference entries do not affect the score. No context, eligibility,
format or hierarchy is included. Eleven focused compatibility checks pass locally.

`selectDiverseEvents(scoredEvents, limit, diversityPenalty = 0.3)` is implemented
locally in [diverseEvents.js](../server/services/diverseEvents.js), alongside
`calculateInterestSimilarity(a, b)`. Eligible input records contain `eventId`,
`interests` and `compatibilityScore` (finite 0–100). Unique positive-score events
enter the pool. At each step, choose the largest
`compatibilityScore * (1 - diversityPenalty * maximumSimilarity)` using Jaccard
tag similarity against selected events. Strict greater-than comparisons preserve
input order on ties. Selected copies retain compatibility and add `rankingScore`
at selection time. Penalties always start from original compatibility; they do not
compound. Missing tags mean zero similarity. Validate a nonnegative integer limit
and finite penalty in [0,1]. Duplicate IDs must agree; eligibility and general
discovery fallback stay outside this selector. Zero matches are not dislikes.
Eleven focused diversity checks cover these rules. This simple nested-loop version
costs O(N K² m) for N candidates, K selections and at most m tags per event.

RSVPs are already called `registrations`; do not add an `rsvps` table. Check-ins
are attendance records; do not duplicate them in a client-writable interaction
table. `events.category` is free text, not a validated category hierarchy.

## Evidence contract and rules

Implemented locally in [eventEvidence.js](../server/services/eventEvidence.js).
The function accepts a canonical snapshot, NOT an unordered action history:

```js
{
  eventId: 'event-id',
  save: { active: true, timestamp: '2026-10-01T12:00:00Z' },
  rsvp: { active: true, timestamp: '2026-10-02T12:00:00Z' },
  attendance: { verified: true, timestamp: '2026-10-03T12:00:00Z' },
  dismissed: false
}
```

Omit absent stages. The server-side adapter must scope all records to the
authenticated user and event; `verified: true` must never come from a browser
assertion. Invalid/future selected timestamps throw; timezone-free strings are
rejected. Inject `now` for tests. The function does not mutate or persist records.

1. Dismissed: return `not_interested`, zero contribution and null effective
   timestamp. Dismissal persists until explicitly undone; positive evidence ageing
   does not expire it. Save/registration/attendance records remain separate.
2. Otherwise choose verified attendance (15), currently confirmed RSVP (10),
   active save (5), or none. In snapshots, `rsvp.active` means confirmed-only.
3. Age the selected action using its original timestamp: elapsed UTC duration
   ≤30 days → full; >30 and ≤90 → half; >90 → zero.
4. Return one record: event ID, effective action/time, base points, multiplier,
   contribution. Never fall back to a weaker stage just because attendance is old.

Cancellation makes RSVP inactive, preserving any active save and its original
date. Unsaving makes save inactive. Undo dismissal restores the strongest current
valid positive stage using its original date. A new positive action does not
implicitly undo dismissal. No category-level negative points in V1. Removing a
dismissed event's positive evidence can still lower its category's derived score.

Two events can contribute 30 attendance points combined; the 15-point cap applies
per event. Repeated calculation is deterministic but is NOT database-level
deduplication: write-side idempotency must preserve original stage dates too.

## Persistence design to prepare with Timothy

Propose one additional `user_event_preferences` table, keyed by
`(user_id,event_id)`, with foreign keys to `profiles` and `events`:

| Field | Purpose |
| --- | --- |
| `saved_at timestamptz`, `save_active boolean` | Original save-stage date and current state |
| `dismissed_at timestamptz`, `dismissed boolean` | Current explicit suppression and transition date |
| `first_confirmed_at timestamptz` | First confirmed-stage evidence date, captured by a trusted registration trigger |

These are proposed fields, not a deployed contract. Store only first-stage
timestamps for MVP evidence; toggles change current state without refreshing
positive evidence dates. This table is a current-state snapshot, not a full audit
log. An append-only transition log can be added later if audit replay is needed.

Use server/database time and atomic, idempotent transitions. Own-row reads and
save/dismiss changes need RLS; ordinary users must not set `first_confirmed_at` or
forge attendance. Use column grants or narrow RPCs as well as row policies.
Only `confirmed` earns the 10-point RSVP stage. Pending, waitlisted and active
offered registrations block recommendations but do not earn that evidence.
Expired offers no longer block; use the actual `offer_expires_at` and supplied time.
Verified attendance remains separate and stronger than a confirmed RSVP.

The review-only trigger captures database statement time for both direct confirmed
inserts and transitions to confirmed. Its atomic upsert fills `first_confirmed_at`
only if absent, preserving it across cancellation/reconfirmation and repeated
confirmed updates. Save writes likewise fill `saved_at` only if absent; unsave/resave
changes state without refreshing evidence. A reactivated save or confirmation older
than 90 days therefore contributes zero. This does not change registration lifecycle
dates, statuses, offer expiry or check-in logic.

Important source limitations:

- `register_for_event()` resets `registrations.created_at` on re-registration.
  The existing before-update trigger overwrites `decided_at` on status changes,
  including reconfirmation. Neither reliably identifies first-ever confirmation.
  The draft backfills ONLY currently confirmed records using the best-known
  `coalesce(decided_at, created_at)`. Earlier overwritten dates are unrecoverable;
  nonconfirmed rows are not backfilled from unrelated decision timestamps. A
  previously cancelled record without recoverable confirmation history acquires
  its first known confirmation date when it is next confirmed.
- `check_ins` contains fraud flags and supports authorised undo. The adapter must
  honour authoritative removal and an agreed fraud-review policy. That policy is
  not inferred from the evidence function's input flag.
- The deployed-design attendance trigger increments `profiles.interest_weights`;
  the interaction route also permanently increments weights. Reconstructed V1
  preferences must not use those accumulated weights as an explicit prior.
  Replace these update paths in one coordinated integration step; do not stack
  the new evidence on top of old boosts. Existing live behaviour is unchanged.
- Historical events are needed to map evidence to topics. The published-upcoming
  candidate query is insufficient for profile reconstruction. Event deletion
  currently cascades related records; deleted history cannot be reconstructed.

Before promoting the draft to a migration, inspect the actual hosted migration
history and schema with the backend owner. This source review does not establish
hosted RLS or grants. Ten simulated persistence cases now cover confirmed-only
states, first dates, reactivation/ageing and flagged attendance; they do not execute
or validate the SQL trigger, backfill, grants or concurrent transactions.

## Implementation order and acceptance

1. **Evidence foundation (implemented locally):** pure calculation and targeted fixtures.
   Test stage precedence, separate events, cancellation fallback, dismissal undo,
   exact ageing boundaries, timezone offsets and bad timestamps. Persistence
   deduplication and authentication are not established by these unit tests.
2. **Persistence adapter (JavaScript and SQL draft prepared):** review the draft
   with Timothy after hosted inspection, test it on PostgreSQL, then promote the
   reviewed SQL to a migration. Test duplicate writes, concurrent transitions,
   user isolation, forged attendance rejection and stable first timestamps.
3. **Preferences (implemented locally):** 10-point explicit priors plus equally
   split evidence per unique event; no additional cap or hierarchy. Seven targeted
   tests cover accumulation, divergent profiles, duplicate handling, fractional
   shares, no-history defaults and unchanged inputs. Backend tag hydration and
   authoritative conflict resolution remain integration tasks.
4. **Compatibility (implemented locally):** average per-tag rational fit on a
   0–100 scale with missing-tag fallback. Eleven focused checks cover the agreed
   examples, duplicates, cold start, bounds, fractional scores and candidate
   independence. Practical eligibility remains a separate integration task.
5. **Diversity (implemented locally):** approved maximum Jaccard penalty of 0.3,
   input-order ties, separate compatibility/ranking scores and zero-match exclusion.
   Eleven focused checks pass. Frontend, eligibility, cold-start general discovery,
   baseline evaluation remain integration tasks. The pure pipeline is now assembled
   and tested locally; hosted data adaptation and frontend integration are pending.

The local core pipeline and application wiring are complete. No cache, hosted
migration or deployed backend/frontend is delivered by this work.
