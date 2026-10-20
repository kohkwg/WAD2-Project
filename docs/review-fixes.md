# Review fixes and integration notes

Follow-up to the 17 October review. Denzel authorised all reviewed P2/P3 frontend
findings, including teammate-owned fixes. GPT-6 Luna agents at Medium effort
implemented the changes under Codex orchestration. Feature ownership is unchanged.

## Changes to verify together

| Finding | Resulting behaviour |
| --- | --- |
| Cancelled destructive retries | Cancel/Escape invalidates the failed action and its outer retry. Tasks, manual posts, expenses and venue confirmation retain explicit intent. |
| Dialog focus | Native dialogs close before removal; focus returns to the opener or a logical action inside the original tool. Removed/navigated-away context is not reused. |
| Keyboard task movement | Stable task IDs restore the destination status control after success, original control after failure, and destination after retry. Pointer dragging keeps its existing behaviour. |
| Public update placement | One feed lives in public event context, before RSVP actions in DOM/mobile order, and remains available if private RSVP loading fails. |
| Weather duplication | `getEventWeather(eventId)` returns forecast and areas from one guarded HTTP response; confirmation still makes a fresh eligibility read. |
| Offer refresh | My RSVPs reconciles statuses with explicit refresh/focus and its existing cadence; scoring/expiry rules remain unchanged. |
| Stale address results | Only the current query may update results/error/loading; clearing, choosing, Escape and leaving the step invalidate older responses. |
| Publication validation | Publish freshly validates the complete frontend draft, returns to the invalid step, focuses the missing/invalid field and preserves entered data. Live authoritative validation remains a backend integration contract. |
| Reused management route | Event-ID changes clear old state and guard stale reads/actions, including navigation back to a previously viewed ID. |
| Page semantics | Required question legends/controls, associated errors/focus, contextual loading, semantic headings, selected filters, disclosures and occupancy/progress semantics are improved. |

New regressions live in `feature4-interactions.spec.js`,
`feature4-public-weather.spec.js`, `legacy-review-fixes.spec.js` and
`feature4WeatherSnapshot.test.js`. [Verification](testing.md) records the final
combined run; the [final review](reviews/2026-10-17-final-review.md) records its verdict.

## Boundaries retained

The asynchronous localStorage interface, existing RSVP/scoring rules, integer-cent
money handling, one-way demo switch and public/private separation are preserved.
No dependency, initial migration, env value, branch or hosted service change is
needed for these fixes. Registration/offer cutoff and late-cancellation policy
remain team decisions. Hosted auth/persistence and production concurrency remain
the P1 final-delivery integration dependency.

## Sharing and merge preparation

The root `AGENTS.md`, docs index, current technical guide, assumptions, verification
and review/fix history are portable and eligible for a later commit. Private host
notes/plans, originals/PDFs, env files, graphs and installed tooling remain ignored.
The [branch handoff](handoff.md) identifies affected shared files and their owners.
Nothing is staged, committed, pushed or merged by preparing this documentation.
