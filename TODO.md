# Product TODO

## High priority: explain and improve unresolved result-discipline mapping

- [ ] Replace the vague “some results could not be assigned to disciplines” message with a short explanation of what is missing, what was successfully matched, and why some results remain unresolved. Keep the unresolved count and explain that importing a previous entry from the same meet is one way to provide the missing event labels, not the only possible recovery path.
- [ ] Add a diagnostic preview for results whose `SWIMSTYLE@name` is missing: show event/session metadata, possible invitation matches, and confidence. Never map `eventid` values across meets; they are meet-local. Only auto-map when an explicitly defined, tested rule makes the match safe; leave ambiguous events unresolved and offer a deliberate manual mapping workflow if feasible.
- [ ] Reproduce the reported Olecko-results + Władysławowo-invitation case with privacy-safe checks. The local-file comparison found 28 result events with unnamed styles and only 11 exact `(session number, event number, gender, relay count)` signature overlaps against the 40-event Władysławowo invitation. These partial overlaps are not sufficient to infer the remaining mappings safely. Re-check the comparison when implementing this item, using no real athlete data in tests or committed artifacts.
- [ ] Add tests for complete schedule matches, partial matches, unmatched events, duplicate/ambiguous signatures, and a clear unresolved count. Verify that safe partial matches never turn unrelated result events into guessed disciplines.

## High priority: submission-to-next-submission regression flow

- [ ] Add a synthetic integration/regression test that builds a submission from invitation A, parses/imports that generated entry as history, then prepares a new submission from invitation B. Verify athlete identity, discipline/time suggestions, selected events, and regenerated output, including different meet-local event IDs. Use only synthetic names and data.
- [ ] Where the test setup permits, add a browser smoke test for the same two-meet flow so import, draft selection, export, and re-import are exercised together.

## UI: athlete list and club search

- [ ] In the athlete-selection list, replace the redundant age display with the athlete's source club name (truncate visually to the available width). Keep birth year available to distinguish athletes with the same name, for example in the selected-entry card/details.
- [ ] Extend athlete search to match club names as well as athlete name and birth year. Add tests for normalization and matching, including club-name variants.
- [ ] When an athlete appears under several club spellings in imported files, display a compact set of source club names or a clear “multiple clubs” indicator rather than silently choosing one.

## UI: make time entry clearer

- [ ] Redesign individual and relay time entry so units are obvious and coaches do not have to understand a leading hours field. Prefer a clear `minutes : seconds . centiseconds` UI (or equivalent segmented controls) with visible unit labels and examples; continue converting to integer centiseconds in core and LENEX `hh:mm:ss.cc` on export.
- [ ] Keep existing rounding/±1-second actions, but make their placement and labels consistent with the new time control. Cover empty, malformed, boundary, and multi-minute times with tests.
- [ ] Confirm the accepted input range and behavior for long events before removing hours from the user-facing control; do not silently truncate valid durations.

## UI polish: print/PDF action

- [ ] Restyle the “Drukuj / zapisz PDF” action to match the app's buttons, spacing, focus states, and mobile layout. Preserve browser print-to-PDF behavior and keep print-only output focused on the submission summary.

## Backlog order

1. Resolve and clearly explain result mapping before changing automatic matching behavior.
2. Add the generated-entry-to-next-entry regression flow.
3. Improve athlete/club search and the displayed athlete metadata.
4. Redesign time entry and polish the print action.
