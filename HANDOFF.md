# Project handoff: `lenex-entries` (LENEX entry builder)

Audience: the developer and GitHub Copilot (agent mode / coding agent).
Read this file fully before writing code. Keep it updated when decisions change.
Code, comments, commits and docs are in **English**. The **UI is in Polish** (strings in one i18n file).

---

## 1. Problem and goal

Swimming and finswimming clubs submit meet entries with **Splash Entry Editor**, an old desktop program.
The coach opens the organizer's invitation (`.lxf`), then types every athlete, picks events and types an entry time for each one.
For 80 athletes this is hours of repetitive work, repeated for every meet.

Goal: a **browser-based, local-first tool** that:

1. keeps the club's roster and each athlete's times between meets,
2. pre-fills a new submission from previous entries and results,
3. exports a file that the organizer's Splash Meet Manager imports exactly like a Splash Entry Editor file.

Users: club coaches (non-technical, mostly Windows, sometimes a tablet at the pool).
Start with Polish finswimming (Klubowy Puchar Polski), but nothing in the core may be finswimming-specific. Classic swimming uses the same format.

### Non-goals (for now)

- No backend, no accounts, no central database, no analytics.
- No organizer-side features (meet management, start lists).
- No relay member assignment (the golden file does not contain relay positions).

---

## 2. Decisions (locked unless changed here)

| Area | Decision | Why |
|---|---|---|
| Delivery | Static web app, PWA, offline-capable | Link instead of installer, no code signing, works on any device |
| Data location | Browser only (IndexedDB) plus user-owned JSON backup | Athletes are mostly minors. No server means no controller duties for us |
| Language | TypeScript, `strict`, no `any` | Structured domain, many refactors |
| UI | React (current stable) + Vite + Tailwind CSS | Familiar to the author. No component library at first |
| Core | Separate package with **no DOM dependency** | Testable in Node, reusable in CLI or Tauri later |
| Monorepo | pnpm workspaces: `packages/core`, `apps/web` | Core `tsconfig` has no `DOM` lib, so DOM use fails to compile |
| ZIP | `fflate` | Small, works in browser and Node |
| XML | `fast-xml-parser` (`preserveOrder: true`) | Works without DOM. Keeps unknown attributes of the invitation |
| Storage | Dexie (IndexedDB) | Typed, migrations |
| Validation of JSON | `zod` | Backup/import files |
| Tests | Vitest (+ Testing Library), Playwright later | |
| Hosting | GitHub Pages or Cloudflare Pages | Free, static |
| Desktop later | Tauri wrapper around the same web build, only if needed | |

---

## 3. Verified facts about the files

Derived from three real files of one meet (IV Runda KPP, Olecko, Oct 2026). Counts below are asserted by tests against **synthetic** fixtures that preserve this structure (see section 10).

### 3.1 Container

`.lxf` is a ZIP with exactly one `.lef` file. The inner file name is arbitrary (one invitation had a typo in it). `.lef` is XML in the LENEX format.

### 3.2 Invitation (from the organizer)

- LENEX **3.0**, UTF-8, CRLF, produced by Splash Meet Manager 11. No `CLUBS` element.
- `MEET` attributes that matter: `course="SCM"`, `deadline`, `maxentriesathlete="4"`, `reservecount`, `AGEDATE type="YEAR" value="2026-10-25"`.
- 2 `SESSION`, 39 `EVENT` (36 individual + 3 relay), 99 `AGEGROUP`.
- `EVENT`: `eventid` (**unique per meet only, never stable across meets**), `gender` (`F`, `M`, `X` for mixed relays), `number`, `order`, one `SWIMSTYLE`, `AGEGROUPS`.
- `SWIMSTYLE`: `distance`, `relaycount`, `swimstyleid`, `name`, `code`, `stroke="UNKNOWN"` (always, so **never use `stroke`**).
- 12 distinct disciplines: `25m AP`, `50m AP`, `50m BF`, `100m BF`, `200m BF`, `400m BF`, `50m SF`, `100m SF`, `200m SF`, `400m SF`, `4x50m SF`, `4x50m BF`.
  (Presumably AP = apnoea, BF = bi-fins, SF = surface/monofin. Used only as opaque labels.)
- Quirks:
  - `100m SF` has `distance="50"` (swimstyleid 539). **Never trust `distance`.**
  - For individual events `code == name`. For relays they differ (`name="4x50m SF"`, `code="4x50m pp"`).
  - Relay events have an age group with `agemin=-1 agemax=-1` ("Senior") that overlaps the junior groups.
  - An event can contain several age groups (e.g. one event covers categories D, C, B, A). An age group with `agemax=-1` means "no upper limit".

### 3.3 Entry file (what Splash Entry Editor produces; the golden file)

- Declares LENEX **2.0**, `encoding="Windows-1250"`, constructor `Splash ENTRY EDITOR 08.00.1343`. The `created` attribute is copied from the invitation. Indent 1 space, CRLF.
- Structure: the **complete `MEET` of the invitation** plus
  `CLUBS > CLUB(name) > CONTACT(name, phone, email), ATHLETES, RELAYS`. `CONSTRUCTOR` comes after `MEETS`.
- `ATHLETE`: `lastname`, `firstname`, `birthdate`, `gender`, `athleteid`.
  - `birthdate` is `YYYY-01-01`, so **only the year is meaningful**.
  - `athleteid` is a local counter starting at 1. There is no licence number, no nation.
  - Children: `ENTRIES > ENTRY(eventid, entrytime)`. There is no `entrycourse`.
- `RELAY`: `gender`, `number`, `name`, optional `agemin`/`agemax`, `relayid`, `ENTRIES > ENTRY(eventid, entrytime)`. No `RELAYPOSITIONS`.
- Entry time format: `hh:mm:ss.cc`, for example `00:04:23.33`.
- Many times end in `.00` (hand-typed estimates). So a time needs a **source**.

### 3.4 Results (published by the organizer)

- LENEX 3.0, UTF-8, `MEET status="OFFICIAL"`. 9 clubs, 165 athletes, about 650 `RESULT` (including relays).
- `ATHLETE`: `firstname`, `lastname`, `birthdate`, `gender`, `nation`, `athleteid`, optional `swrid` (45 of 165).
  - `athleteid` is the organizer database id and is **not portable**.
  - `birthdate`: 70 of 165 are year-only placeholders (`-01-01`), the rest are full dates. **Use the birth year only.**
  - No licence numbers.
- `RESULT` (under `ATHLETE > RESULTS`): `eventid`, `resultid`, `heatid`, `lane`, `swimtime`, `points`, `status`, optional `entrytime`, `comment`, `late`; children `SPLITS`, `RELAYPOSITIONS`.
  - `status` is absent for a valid result, otherwise `DNS`, `DSQ` or `DNF`. Only valid results become time observations.
  - `entrytime` echoes the submitted entry time.
  - The course comes from `MEET@course`.

### 3.5 Verified joins and rules (asserted in tests)

- **Athlete identity**: key = (`lastname`, `firstname`, birth year, `gender`) after `NFC` normalization, trim, case-fold. All 35 athletes of the entry file matched in the results. There were 0 duplicate keys and 0 same-name-different-year pairs in the results.
- **Entry time consistency**: of 137 individual entries, 136 were found in the results, all with identical `entrytime`. One had no result record, so code must tolerate missing results.
- **Age rule**: `age = year(AGEDATE) - birthYear` when `AGEDATE@type == "YEAR"`. All 137 entries are consistent. The alternative `age - 1` fails for 7 of them.
- **Event resolution**: `resolveEvent(meet, gender, disciplineKey, age)` returns exactly one event for every one of the 137 entries and equals the `eventid` chosen in the golden file.

---

## 4. Domain rules

- `disciplineKey` = normalized `SWIMSTYLE@name` (trim, collapse spaces, case-insensitive compare). `swimstyleid` is secondary. If the same `name` has different ids across files, warn but proceed.
- Individual events are chosen by `(gender, disciplineKey, age)`. The user picks only the discipline. The event is derived and shown for transparency.
- Relays are not resolved by age. The user chooses the relay event, category name and time.
- If `AGEDATE@type` is not `YEAR`, throw `UnsupportedAgeDateType` (implement per the LENEX spec later).
- Time is an **integer number of centiseconds** (`number`). "No time" is `null` internally. `00:00:00.00` is the LENEX "NT" convention, so verify it before relying on it.
- Only `status`-less results become observations. Times from a previous entry file are observations with lower trust (`source.kind = "entry"`).
- Default time policy: best valid result at the same `course` within the last 12 months. Fallback: the most recent entry time. Policy is a setting and the choice is always editable per cell.

### Validation (blocking = cannot export, warning = can export)

- blocking: athlete has more than `maxentriesathlete` individual entries (whether relays count is an open question, see section 11),
- blocking: no event matches the athlete's gender and age for the chosen discipline,
- blocking: duplicate discipline for one athlete, invalid time format,
- warning: missing time, deadline passed, athlete without any entry, roster athlete born outside any age group.

---

## 5. Architecture and repo layout

```
/
├─ .github/
│  ├─ copilot-instructions.md      # short rules, points here
│  └─ workflows/ci.yml, pages.yml
├─ packages/core/                  # pure TS, tsconfig WITHOUT "DOM" lib
│  ├─ src/
│  │  ├─ container/  readLxf.ts writeLxf.ts
│  │  ├─ codec/      windows1250.ts
│  │  ├─ lenex/      parseInvitation.ts parseEntries.ts parseResults.ts buildEntryFile.ts
│  │  ├─ domain/     types.ts time.ts age.ts resolveEvent.ts policy.ts validate.ts identity.ts
│  │  └─ index.ts
│  └─ test/
├─ apps/web/                       # React + Vite + Tailwind
│  └─ src/ { db/ (Dexie) · features/ · components/ · i18n/pl.ts }
├─ fixtures/
│  ├─ public/        # organizer invitation only (no personal data)
│  └─ synthetic/     # generated, anonymized entry + results
├─ private/          # GITIGNORED, real files for local checks only
├─ scripts/anonymize.ts
├─ HANDOFF.md
└─ LICENSE
```

Rules: `apps/web` may import `core`, never the reverse. All parsing, generation, rules and validation live in `core` as pure functions. React components contain no domain logic.

---

## 6. Domain model (sketch, refine in code)

```ts
type Gender = 'F' | 'M';
type EventGender = Gender | 'X';
type Centis = number;                       // 1/100 s
type Course = 'SCM' | 'LCM';

interface Athlete {
  id: string;                               // uuid, local
  lastName: string; firstName: string;
  birthYear: number; gender: Gender;
}

type TimeSource =
  | { kind: 'result'; meetName: string; meetDate?: string }
  | { kind: 'entry';  meetName: string }
  | { kind: 'manual' };

interface TimeObservation {                 // append-only
  id: string; athleteId: string;
  disciplineKey: string; course: Course;
  timeCs: Centis; source: TimeSource;
}

interface MeetEvent {
  eventId: string; number: number; sessionNumber: number;
  gender: EventGender; disciplineKey: string; relayCount: number;
  ageGroups: { name: string; min: number; max: number | null }[]; // max null = open
}
interface Meet {
  key: string; name: string; course: Course; deadline?: string;
  maxEntriesPerAthlete?: number; ageDate: { type: string; value: string };
  events: MeetEvent[]; rawXml: string;      // kept for generating the entry file
}

interface DraftEntry { disciplineKey: string; timeCs: Centis | null;
                       timeOrigin: 'policy' | 'previous-entry' | 'manual' }
interface DraftRelay { name: string; gender: EventGender; eventId: string; timeCs: Centis | null }
interface Draft { meetKey: string; clubName: string; contact: { name: string; phone: string; email: string };
                  entries: Record<string /*athleteId*/, DraftEntry[]>; relays: DraftRelay[] }
```

---

## 7. Core API (pure functions)

```ts
readLxf(bytes: Uint8Array): { fileName: string; xml: string }       // decode UTF-8 or the declared encoding
writeLxf(fileName: string, xml: Uint8Array): Uint8Array
encodeWindows1250(s: string): Uint8Array   // unmappable chars -> &#N; (only inside serialized XML)
parseTime(s: string): Centis | null;  formatTime(c: Centis): string
parseInvitation(xml: string): Meet
parseEntryFile(xml: string): { meet: Meet; clubs: ParsedClub[] }
parseResults(xml: string): ParsedResults   // athletes + valid results as observations
ageAt(meet: Meet, birthYear: number): number
resolveEvent(meet: Meet, gender: Gender, disciplineKey: string, age: number): MeetEvent | undefined
pickTime(observations: TimeObservation[], opts: Policy, ctx: { course: Course; today: string }): Centis | null
identityKey(a: { lastName; firstName; birthYear; gender }): string
matchAthletes(roster: Athlete[], incoming: IncomingAthlete[]): MatchReport   // exact / new / ambiguous
validateDraft(meet: Meet, roster: Athlete[], draft: Draft): Issue[]
buildEntryFile(meet: Meet, draft: Draft, roster: Athlete[]): Uint8Array      // complete .lxf
```

### Generating the entry file

1. Parse the invitation XML (`preserveOrder`), find `MEETS > MEET`.
2. Append `CLUBS > CLUB(name)` with `CONTACT`, `ATHLETES` (`athleteid` = 1..n, `birthdate` = `${year}-01-01`) and `RELAYS`.
3. Set `LENEX@version="2.0"`. Replace `CONSTRUCTOR` with the project's own (never impersonate Splash). Move it after `MEETS`.
4. Serialize with 1-space indent and CRLF. Use ` />` for empty tags.
5. Escape `& < > "` in values. Replace characters not present in Windows-1250 with `&#N;`.
6. Encode as Windows-1250 (reverse map built once from `new TextDecoder('windows-1250')` over bytes `0x80..0xFF`, skipping bytes that decode to U+FFFD or C1 controls). Wrap in a ZIP (`.lxf`).
7. Optional setting later: write LENEX 3.0 / UTF-8. Default stays 2.0 / cp1250 until an organizer confirms the alternative.

Golden test = **semantic** equality (canonical XML: sorted attributes, trimmed whitespace, ignoring `created` and `CONSTRUCTOR`), not byte equality.

---

## 8. UI spec (labels in Polish)

1. **Zawodnicy**: roster table (add/edit/delete, birth year, gender). Import from CSV or paste from Excel. Search.
2. **Import**: one drop zone for `.lxf`/`.lef`/`.json`. Auto-detect by content: has `CLUBS` with `ENTRY` = previous entry; has `RESULT` = results; neither = invitation. Show a preview: matched / new / ambiguous athletes with a confirm step. Nothing is written before confirmation.
3. **Zgłoszenie**: pick a meet. **Matrix**: rows = athletes, columns = disciplines grouped by session. Cell = toggle + time (editable, with a badge for the origin: wynik / poprzednie zgłoszenie / ręcznie). Row counter `x/4`. Cells the athlete is not eligible for are disabled with a reason. Action: "Skopiuj wybór z poprzedniego zgłoszenia".
4. **Sztafety**: list of relays (name, gender, event, time).
5. **Eksport**: club contact fields, validation panel (blocking vs warnings), download `.lxf`.
6. **Ustawienia**: time policy, backup export/import, "persist storage" request.

UX principles: keyboard-first matrix (arrows, space to toggle, type to edit time), no modal chains, undo for destructive actions, everything works offline.

---

## 9. Milestones (each = one PR, acceptance criteria are tests)

- **M0 Scaffold**: pnpm workspace, `core` + `web`, strict TS, ESLint + Prettier, Vitest, CI (lint, typecheck, test, build), Pages deploy, `.gitignore` (see section 10), LICENSE, `anonymize.ts` stub.
  *AC*: CI green. Using `document` inside `packages/core` fails typecheck.
- **M1 Containers and codecs**: `readLxf`, `writeLxf`, `windows1250`, time utils.
  *AC*: `ąćęłńóśźżĄĆĘŁŃÓŚŹŻ` round-trips. An unmappable char becomes `&#N;`. `parseTime('00:04:23.33') === 26333` and `formatTime(26333) === '00:04:23.33'`. Malformed times are rejected.
- **M2 Anonymizer + parsers**: `scripts/anonymize.ts` turns real entry/results into synthetic fixtures preserving structure and counts. Then `parseInvitation`, `parseEntryFile`, `parseResults`.
  *AC*: invitation = 39 events / 12 disciplines / 99 age groups. Entry = 35 athletes / 137 individual entries / 11 relays. Results = 165 athletes.
- **M3 Rules**: `ageAt`, `resolveEvent`, `identityKey`, `matchAthletes`, `pickTime`, `validateDraft`.
  *AC*: `resolveEvent` reproduces 137/137 eventids of the entry fixture. A test documents that `age - 1` fails for at least one entry. Unknown `AGEDATE` type throws. Matching entry fixture against results fixture gives 35/35 with 0 ambiguous.
- **M4 Generator**: `buildEntryFile`.
  *AC*: output declares `version="2.0"` and `Windows-1250`. Bytes decode with `TextDecoder('windows-1250')`. Parsing the output gives a model semantically equal to the entry fixture.
- **M5 Storage + roster UI**: Dexie schema with versioned migrations, roster CRUD, CSV/paste import, JSON backup with zod.
  *AC*: reload keeps data. Backup export then import is lossless.
- **M6 Import UI**: drop zone, detection, match preview, confirmation.
  *AC*: importing entry fixture then results fixture gives 35 athletes, 0 duplicates, observations with `source.kind = 'result'`.
- **M7 Entry matrix + export + relays**: full flow from invitation to download.
  *AC*: Playwright smoke test builds a submission from fixtures. Blocking errors disable export. Warnings do not.
- **M8 PWA and resilience**: offline, `navigator.storage.persist()`, backup reminder.
  *AC*: app loads offline after the first visit.

---

## 10. Privacy and repo hygiene (the repo is public)

- The entry and results files contain names and birth years of minors and a coach's phone and email. **Real files never enter git, not even in one commit** (history keeps them).
- `.gitignore` from the very first commit: `private/`, `*.lxf`, `*.lef`, with exceptions `!fixtures/public/**` and `!fixtures/synthetic/**`.
- `fixtures/public/` holds only the organizer's invitation (no personal data).
- `fixtures/synthetic/` is produced by `scripts/anonymize.ts`: fake names, shifted years, jittered times, the same counts and event structure.
- A Vitest guard fails if any `.lxf`/`.lef` exists outside the two allowed fixture folders.
- No network calls with user data, no third-party analytics, no remote fonts or scripts. The data never leaves the browser.
- Show a short privacy note in the app.

---

## 11. Open questions and risks

1. Does the organizer's Splash Meet Manager accept UTF-8 / LENEX 3.0 and `&#N;` references? Until confirmed, emit 2.0 / cp1250.
2. Do relay entries count toward `maxentriesathlete`? The golden file never has more than 4 individual entries per athlete.
3. Are `swimstyleid` values stable across organizers? We key on `name`, but check another organizer's invitation.
4. Exact NT representation in entries (`00:00:00.00`?). Check the LENEX spec.
5. The one entry without a result record (see 3.5) suggests a withdrawal or DNS. Confirm how results represent it.
6. Safari may evict storage of rarely used sites. Backup and `persist()` are mandatory, not optional.
7. Licence: MIT recommended (simplest). AGPL-3.0 if closed hosted forks are a concern.
8. Prior art (only GitHub/npm metadata was checked, the code was not reviewed):
   - `Tiim/js-lenex` (npm `js-lenex`): LENEX 3.0 only, last release 2021, **no licence listed**, so do not copy code or depend on it.
   - `hakostra/lenex-tools`: TypeScript, MIT, active. Worth reading for ideas on legacy formats before implementing M2/M4.
   - Our approach (inject `CLUBS` into the invitation, keep unknown attributes, write 2.0 / cp1250) is small enough to keep in-house.
9. GitHub Pages serves a project site under `/<repo-name>/`. Set Vite `base` from an env variable (`/` for a custom domain). Avoid client-side routes that need server fallback: use hash routing or a single view with state.

---

## 12. Working with Copilot

- Turn each milestone item into a GitHub Issue. Give Copilot one issue per PR.
- Write tests first for everything in `core`. The acceptance criteria above are the tests.
- Review diffs for: `any`, DOM usage in `core`, domain logic inside React components, real personal data in fixtures.
- When behaviour is unclear, check section 3 (facts) before guessing, and update this file if reality differs.
