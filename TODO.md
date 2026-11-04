# Product TODO

## High priority: explain and improve unresolved result-discipline mapping

- [x] Replace the vague message with a concise explanation of missing `SWIMSTYLE@name` labels and keep the unresolved valid-result count.
- [x] Replace manual event-by-event mapping with a simple path: import the invitation from the same meet as the results. Only exact event IDs within matching meet identity are used; never map IDs across meets.
- [x] Reproduced the reported Olecko-results + Władysławowo-invitation case with metadata-only checks: all 28 result event styles are unnamed, and only 11 signatures overlap the 40-event Władysławowo invitation. The remaining 17 cannot be safely inferred from this schedule signature; no athlete data was recorded.
- [x] Test same-meet invitation mapping, cross-meet/course rejection, partial-match safety, duplicate signatures, and unresolved count.

## High priority: submission-to-next-submission regression flow

- [x] Add a synthetic core regression test that generates a submission, imports it as history, and builds the next submission with different meet-local event IDs.
- [x] Add a browser smoke test for the two-meet flow: import, select/edit, export, import the generated entry under a new invitation, and export again. Run with `corepack pnpm --filter @lenex-entries/web run test:e2e` (requires Playwright Chromium).

## Deferred domain checks and documentation

- [ ] Verify the official time-validity rule in the current KPP regulations. The app uses a 12-month default heuristic; it is not confirmed as the organizer's rule.
- [ ] Finish issue #5 for classic swimming: the sample invitation has 6 events, no `SWIMSTYLE@name`, `@code`, or non-empty `@swimstyleid`; it uses `@stroke` and `@distance`. The available results file is a different meet, so it cannot validate an event join. Confirm canonical discipline-label policy before implementation; do not infer labels from `stroke`/`distance` without an explicit decision.
- [x] Write a short Polish coach's guide covering required invitation, optional history/results/reference invitation, athlete and event selection, time editing/reset, warnings, export, and local backups/privacy.

## UI: athlete list and club search

- [x] Replace age with source club, truncate long labels, and keep birth year visible to distinguish same-name athletes.
- [x] Extend athlete search to clubs with whitespace/case normalization and tests.
- [x] Show multiple imported club spellings compactly rather than silently choosing one.

## UI: make time entry clearer

- [x] Redesign individual and relay time entry to show `minutes : seconds . centiseconds`; export remains integer centiseconds/LENEX `hh:mm:ss.cc`.
- [x] Keep rounding actions alongside the input and test empty, malformed, boundary, and long-duration inputs.
- [x] Preserve long durations without truncation and reject values beyond the current LENEX parser's 99:59:59.99 representable range.

## UI polish: print/PDF action

- [x] Restyle the print action to match the app's button treatment and mobile layout; print still focuses on the summary.

## Backlog order

1. Confirm the results-time period in the official KPP regulations.
2. Resolve the classic-swimming discipline-label policy before implementing issue #5.
