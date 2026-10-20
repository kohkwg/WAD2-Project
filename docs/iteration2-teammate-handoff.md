# Feature 4 teammate handoff

Current after two iterations and the authorised review-fix pass, 17 October 2026. This records observed
local behaviour and proposed integration acceptance, not approved teammate policy
or proof of deployment. [Feature 4](feature4.md) owns the full API/schema mapping;
[the original review](reviews/2026-10-17-feature4-review.md) records severity, and
[the final review](reviews/2026-10-17-final-review.md) records fix acceptance.

## Ownership and acceptance

| Owner | Observed boundary | Integration acceptance / decision |
| --- | --- | --- |
| Denzel | Event-specific tasks, public announcements, budgets and weather switch; demo-only persistence | Review cancellation/focus regressions and preserve the async UI contract in the live adapter. |
| Gregory | Event creation and RSVP flows; event fields include stable ID/owner, dates, questions, outdoor state and primary/backup venue | Confirm live response shape, authoritative publication/date/capacity rules, and primary versus effective venue. Feature 4 consumes counts without changing waitlist/scoring rules. |
| Aishani | `/events` is a placeholder linking to public RSVP; the feed is public before submission | Final discovery/details must expose announcements and current venue before RSVP without private task/budget data. Confirm final route and discoverable links. |
| Huxley | Shared Bootstrap shell/components; iteration 2 refined presentation with temporary user authorisation | Review reuse of theme/focus/navigation; coordinate remaining page semantics. Attendance/tickets/check-in are separate feature work. |
| Timothy | Imported client/schema; fixed demo identities; health-only Express | Supply approved development project, deployed migration version and real test sessions. Complete the current guide's access/atomicity/settings/money/switch gaps before activation. |
| Vivienne | Effective venue name/address and backup badge exist; map and floor-plan renderers do not | Agree stable venue/plan IDs. A map targets the active venue; only show a matching plan. Missing backup plan must be an explicit empty state. |

Current venue objects have name/address/postal and numeric coordinates or missing
coordinates. Invalid/range-invalid/string coordinates use explicit forecast-area
selection. `event.venue` is the displayed effective venue; retain primary identity
separately in production via venue IDs and `using_backup`.

## Gregory review fixes and retained acceptance

The user explicitly authorised these frontend corrections in the follow-up pass.
Feature ownership stays with Gregory; the original triggers and resulting acceptance
are retained here for integration review. Final check results are in verification.

| ID / priority | Trigger | Acceptance |
| --- | --- | --- |
| F3 / P2 — `MyRsvpsView.vue:39` | Leave the page open while another action promotes a waitlisted RSVP; the countdown clock ticks but the offer/action does not appear | Choose explicit refresh/focus/poll/subscription behaviour; discover new offers and reconcile expired ones with persistence. |
| F4 / P2 — `AddressSearch.vue:45` | Resolve SMU search after a later Tampines search; results revert despite the new input. Clearing also permits late results | Request identity now guards results/error/loading after query changes, clear, selection and unmount. Keep typed-address fallback for current failures. |
| F5 / P2 — `CreateEventView.vue:129` | Pass Basics with a future start, wait past it, then Publish | Publish now revalidates the frontend draft and focuses its invalid step without discarding fields. Authoritative validation remains a live write-boundary contract. |
| P3 — `ManageRsvpsView.vue:20` | Direct client navigation e1 → e2 reuses a component that captured e1 | Route-ID changes now clear state and guard older reads/actions with a route version. Preserve direct navigation/back-forward correctness after merges. |

The authorised pass also improves Yes/No fieldset/legend names, associated
validation, contextual loading, selected RSVP filter/disclosure state, wizard
focus and list heading/progress semantics. Gregory/Huxley retain ownership of
these pages. This is targeted accessibility work, not a full conformance claim.
The waitlist Vitest source remains unconfigured.

## Public refresh contract

Explicit **Refresh announcements** reads current posts and event details before
applying either; RSVP drafts survive. Failure retains the previous pair and
exposes retry. This is coordinated rendering, not a database snapshot, background
polling, push notification or app-wide update guarantee. My RSVPs' offer/status refresh now follows its separate cadence/focus/manual
contract; this does not make all pages live. Public feed placement was corrected
near event context in this authorised pass; coordinate later details/navigation
changes with Gregory/Aishani.

## Decisions still needed

- Gregory/Timothy: registration/offer cutoffs, late-cancellation window/history,
  and production delivery of the now-defined My RSVPs refresh behaviour.
- Gregory/Vivienne/Timothy: primary/backup/active venue IDs and map/plan matching.
- Aishani/Huxley: final details/attendance navigation and shared UI adoption.
- Timothy/Denzel: development readiness and live Feature 4 contract acceptance,
  including database money limits versus the larger demo range.

The live gaps are consolidated in [the guide](feature4.md#live-integration-handoff).
Do not rewrite the copied initial migration or activate hosted services as part
of a frontend review. Future teammate feature work still requires its owner’s scope; this handoff
records only the explicitly authorised review fixes.
