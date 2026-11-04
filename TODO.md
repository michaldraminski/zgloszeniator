# Product TODO

## High priority: explain and improve unresolved result-discipline mapping

- [x] Replace the vague message with a concise explanation of missing `SWIMSTYLE@name` labels and keep the unresolved valid-result count.
- [x] Replace manual event-by-event mapping with a simple path: import the invitation from the same meet as the results. Only exact event IDs within matching meet identity are used; never map IDs across meets.
- [x] Reproduced the reported Olecko-results + Władysławowo-invitation case with metadata-only checks: all 28 result event styles are unnamed, and only 11 signatures overlap the 40-event Władysławowo invitation. The remaining 17 cannot be safely inferred from this schedule signature; no athlete data was recorded.
- [x] Test complete schedule mapping, partial-match safety, explicit mapping, and unresolved count. Further cases for duplicate/ambiguous signatures remain useful follow-up coverage.

## High priority: submission-to-next-submission regression flow

- [x] Add a synthetic core regression test that generates a submission, imports it as history, and builds the next submission with different meet-local event IDs.
- [ ] Add a browser smoke test for the same two-meet flow so import, draft selection, export, and re-import are exercised together.

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

1. Add browser smoke coverage for the submission-to-next-submission flow.
2. Expand ambiguous/duplicate event-signature test cases and matching-invitation behavior review.
