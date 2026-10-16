# Feature 4 review after two iterations

Subsequent disposition: Denzel authorised all reviewed P2/P3 frontend fixes,
including teammate-owned findings. See the [fix-pass notes](../review-fixes.md)
and [final review](2026-10-17-final-review.md) for implementation and verified
outcomes. R6 hosted integration remains deferred. The evidence below records
the original review snapshot, not a claim that those fixes are still open.

Reviewed 17 October 2026. Scope: Denzel's task board, announcements, budgets and
weather venue switching, with shared CSS/Bootstrap/Vue and teammate integration
boundaries. This original review changed documentation only; the later fix pass
is tracked separately. Existing working-tree changes were preserved.

## Result and priorities

The demo builds and all 23 Node / 34 Chromium tests pass. Additional browser
checks found three P2 interaction/accessibility defects absent from those tests.
No P0 or P1 demo regression was established. Live/backend acceptance remains a
P1 final-delivery dependency, separately from the functioning local demo.

Priority scale: P0 immediate critical failure; P1 blocks the relevant delivery;
P2 fix in the next development pass; P3 lower-impact improvement. Severity reflects
the observed trigger and scope, not a claim that every visitor is affected.

## Denzel and shared frontend findings

### R1 · P2: cancellation leaves a destructive retry executable

**Evidence:** [ManageEventView.vue](../../client/src/views/ManageEventView.vue),
`mutate` lines 47–57 stores an operation closure in `retries[tool]`. Cancelling
the task dialog at [TaskBoard.vue](../../client/src/components/event-operations/TaskBoard.vue)
line 101 only clears `deleting`. Announcement and budget cancellation use the
same pattern.

**Reproduce:** create a task; make `Storage.prototype.setItem` reject the demo
key with `QuotaExceededError`; confirm Delete; wait for the error; choose Cancel;
restore storage; click the outer **Retry save**. Chromium removed the task with
no dialog (record count 1 → 0; dialog count 0). This was an unresolved cancellation
question in the earlier review and is now reproduced against the current UI.

**Fix:** invalidate a cancelled destructive action and its retry, or make retry
reopen confirmation with the target named. Scope retries to an action/target ID
so an older closure cannot run against a later dialog. Keep ordinary failed
create/edit drafts retryable. Add cancelled-delete and changed-target regressions
for tasks, announcements and expenses. Browser proof here covers tasks; the other
two are source-confirmed instances of the shared retry/cancel pattern.

### R2 · P2: dialog cancellation loses the user's keyboard position

**Evidence:** [ConfirmationDialog.vue](../../client/src/components/event-operations/ConfirmationDialog.vue),
lines 2–6 and 10–17 call `showModal()` but has no close/return-focus lifecycle.
Callers remove it with `v-if` on Cancel/Escape.

**Reproduce:** focus a task's Delete button, open the dialog and choose Cancel.
Chromium reports `document.activeElement === document.body`, although the opener
still exists; an actual Enter/Escape keyboard check has the same result. The
shared dialog is also used for posts, expenses and switching.
Keyboard users must find their previous position again after a non-destructive exit.

**Fix:** close the native dialog before removal and retain/restore the invoking
element after Vue's update. If deletion removes the opener, focus the next item
or tool action instead. Verify Cancel, Escape, success and failure across callers.
This follows the [W3C dialog focus guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

### R3 · P2: cross-column task moves lose keyboard focus

**Evidence:** [TaskBoard.vue](../../client/src/components/event-operations/TaskBoard.vue),
`move` lines 39–44 and separate per-column keyed loops at lines 69–77. Moving a
task removes its focused select from one list and creates it in another; there
is no focus handoff after the saved board renders.

**Reproduce:** focus **Status for a task**, press ArrowDown to change To do → In progress,
then inspect focus after the card appears in its destination. Chromium reports
BODY; the task itself persisted correctly. Keyboard alternatives exist but lose
continuity during repeated task work.

**Fix:** after successful movement, use the stable task ID and `nextTick` to focus
and reveal the destination status control. Restore the original control on failure;
announce the destination once. Do not disturb pointer users unnecessarily. Add
a real keyboard move/failure/retry check. Vue supports this through
[template refs](https://vuejs.org/guide/essentials/template-refs.html).

### R4 · P3: public announcements follow the entire RSVP form

**Evidence:** [RsvpView.vue](../../client/src/views/RsvpView.vue), line 263 mounts
`AnnouncementFeed` after the full summary/form row. At 375px the empty feed starts
below the RSVP action, over a screen down even in the short demo; custom questions
push it farther. At desktop it likewise follows the taller column.

**Impact/fix:** a participant can submit without noticing operational updates.
With Gregory/Aishani, place current updates or a clear linked update indicator
near the event context, retaining independent loading and the coordinated
venue/feed refresh. This is a discoverability recommendation, not a requirement
for push notifications or a new agreed page layout. Check long posts/questions
and pre-/post-RSVP states before changing placement.

### R5 · P3: each weather refresh requests the same endpoint twice

**Evidence:** [ManageEventView.vue](../../client/src/views/ManageEventView.vue),
line 87 runs `getEventForecast` and `getForecastAreas`; both call
`fetchForecastData` in [api.js](../../client/src/utils/api.js), lines 600–623.
The explicit `Promise.allSettled` waits for both before revealing either result.

**Impact/fix:** duplicated HTTP work and a stalled optional area request can hold
back an already successful coordinate-based forecast until its 15-second timeout.
Derive forecast and areas from one refresh snapshot or expose independent loading
states. Keep confirmation's fresh eligibility read and explicit error handling.
This is established from source; no production latency/rate-limit incident is claimed.

## Final/live delivery dependency

**R6 · P1 for final live acceptance, deferred by design — Timothy + Denzel.**
`api.js` fixes identities to `org1`/`u1` and persists organiser data in localStorage;
the Express entrypoint implements health only. Feature 4 has no deployed auth or
database adapter. This is not a regression from either iteration, but the current
demo cannot establish the course's backend-data-store requirement (briefing p. 3).

**Fix:** complete the agreed user-scoped adapter and development acceptance with
Timothy. The [current guide](../feature4.md#live-integration-handoff) records the
specific source-schema gaps: public reads, private ownership, budget limit/range,
post immutability/edit times, board atomicity, saved area and one-way eligibility.
Test permitted/denied access and uncertain/concurrent writes before claiming
production delivery. The imported SQL was inspected directly; graphify lacks its
SQL parser. No hosted change or credential test was performed by this review.

## Teammate-owned findings still open

These were reported in iteration 2 and remain present in current source. They
were not re-reproduced in rendered Chromium in this pass; retain that evidence
distinction. Detailed acceptance belongs to the [handoff](../iteration2-teammate-handoff.md).

| Priority / owner | Finding and source | Suggested fix |
| --- | --- | --- |
| P2 / Gregory | My RSVPs updates its clock, not externally changed offer status — `MyRsvpsView.vue:39` | Define refresh/focus/poll/subscription behaviour; reconcile new/expired offers and acceptance actions. |
| P2 / Gregory | Older OneMap response overwrites a later query — `AddressSearch.vue:45` | Invalidate/cancel obsolete requests, including clear/unmount/error/finally paths. |
| P2 / Gregory | Basics validates time, but Publish does not revalidate — `CreateEventView.vue:129` | Validate the complete event at final submit and the authoritative write boundary; preserve drafts. |
| P2 / Gregory + Huxley | Yes/No group label targets a nonexistent control; validation lacks field associations — `RsvpView.vue:192` | Use fieldset/legend and required state; associate errors and focus invalid fields/summary. |
| P3 / Gregory | Manage RSVPs captures the first route ID — `ManageRsvpsView.vue:20` | Watch route ID, reload and guard stale results; verify direct navigation and back/forward. |
| P3 / page owners | Empty loading statuses, card heading jumps, RSVP filter/disclosure state and wizard focus remain | Apply semantic markup per page; shared Bootstrap styling cannot supply missing semantics. |

Discovery, attendance and map/floor-plan screens are teammate-owned integration
work, not Feature 4 regressions. Do not implement them incidentally.

## CSS, Bootstrap and Vue assessment

The shared system-sans typography, darker secondary text, Bootstrap grid,
mobile navigation, visible tool destinations and operational-first tools are
coherent after iteration 2. Keep these foundations. Forty captures at
375/575/768/1280px showed no page overflow in checked states. A 200-character
unbroken task title also passed all four widths; no overflow finding is warranted.
The board stacks below XL; this is an intentional responsive layout, not a defect.
Bootstrap's [documented breakpoints](https://getbootstrap.com/docs/5.3/layout/breakpoints/)
support targeted checks around 576/768/992/1200px in a future frontend pass.

Vue responsibilities are reasonably separated: parent request/saved state,
props down/actions up, computed display state and guarded route/weather reads.
Focus lifecycle and cancellable retry identity are the material gaps. No new
framework, TypeScript migration, store or styling library is needed to address them.

## Evidence and documentation maintenance

[Verification](../testing.md) records commands and fresh results: 23 unit tests,
34 Chromium tests, production build and 40 additional viewport captures.
Temporary browser evidence is under `/tmp/bookedz-review-2026-10-17/`; source
line references above describe the reviewed snapshot and may shift after edits.
The first three findings were verified in isolated Chromium with controlled data;
they are not additions to the committed regression suite.

Graphify's existing 568-node graph located Feature 4 and confirmed the shared
dialog's four callers. Source and browser checks substantiate the findings;
graph relationships alone do not establish runtime correctness. Changed Markdown
was not semantically re-extracted; no AST rebuild was needed for this docs-only pass.
Live Project Info refresh failed connector argument validation; the last successful
read remains 16 October. No newer deployment or team approval is inferred.

Documentation now has one current Feature 4 guide, one verification page, a
teammate handoff and short historical checkpoints. Detailed AI disclosure remains
in the public README. Original supplied handoff/PDFs and agent tooling remain local.
