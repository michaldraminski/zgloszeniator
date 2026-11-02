# Copilot instructions (place at `.github/copilot-instructions.md`)

Project: local-first web tool that prepares LENEX swimming/finswimming meet entry files.
**Read `/HANDOFF.md` first.** It is the source of truth for scope, decisions, file-format facts and milestones.

## Stack
TypeScript (strict, no `any`), pnpm workspaces, React + Vite + Tailwind in `apps/web`, pure TypeScript in `packages/core`, Vitest, Dexie (IndexedDB), `fflate`, `fast-xml-parser`, `zod`.

## Hard rules
- `packages/core` must not use the DOM, `window`, `document`, `localStorage` or `fetch`. It exports pure functions only.
- `apps/web` imports from core. Core never imports from web. No domain logic in React components.
- Time is an integer number of centiseconds. Never use floats or `Date` for swim times.
- Identify athletes by (lastName, firstName, birthYear, gender) normalized with NFC and case-folding. Never use `athleteid`, `eventid` or exact `birthdate` across files.
- Never use `SWIMSTYLE@stroke` or `@distance`. Key disciplines on normalized `SWIMSTYLE@name`.
- The output entry file is LENEX 2.0, Windows-1250, built by injecting `CLUBS` into the invitation XML. Do not rewrite the invitation from scratch.
- No network calls with user data, no analytics, no remote scripts or fonts.
- **Never add real personal data** (names, birth years, phone, email) to code, tests, fixtures or docs. Use `fixtures/synthetic/` only.
- UI strings live in `apps/web/src/i18n/pl.ts` (Polish). Code, comments, commits and docs are English.

## Workflow
- Write or update tests first for anything in `core`.
- Keep PRs small, one milestone item each. Run `pnpm lint && pnpm typecheck && pnpm test` before finishing.
- Prefer small pure functions and explicit types. Handle malformed input with typed errors, not exceptions of unknown shape.
- If a file-format assumption is not in `HANDOFF.md` section 3, do not guess. Add it to section 11 as an open question.
