# LENEX Entries

A local-first web app for preparing swimming and finswimming meet entries. Import an organizer's LENEX invitation, reuse athletes and times from previous entry/results files, select starts, and download a club entry file.

The interface is in Polish. The project is a work in progress; review the compatibility notes below before using generated files for a real meet.

## Features

- Import `.lef` files and ZIP-based `.lxf` files.
- Read previous entries and valid results as athlete/time history.
- Suggest event times and allow coach-friendly manual time input.
- Add relay teams and optionally assign selected athletes to relay positions.
- Export a LENEX 2.0 / Windows-1250 `.lxf` file.
- Autosave the current draft in browser IndexedDB, download a versioned JSON backup, and restore a validated backup.
- Optionally ask the browser to protect local storage from automatic eviction.

## Privacy and data safety

Files are parsed in the browser. The app has no backend, accounts, analytics, or code that sends athlete data to a service. Drafts are stored in the browser on the current device and browser profile; they are not synchronized to other devices.

Browser storage may still be cleared or evicted. Download JSON backups regularly and keep them somewhere secure. A backup contains the imported meet and history data, roster additions, contact details, and draft selections. Do not share it publicly.

Only use files that you are authorized to process. Real meet files contain personal information and must not be added to this public repository. Use the synthetic fixtures for development and tests.

## Run locally

Requirements: Node.js with Corepack enabled.

From the repository root:

```powershell
corepack pnpm install
corepack pnpm --filter @lenex-entries/web dev
```

Open the local URL printed by Vite (by default `http://localhost:5173`).

## Development checks

```powershell
corepack pnpm -r run lint
corepack pnpm -r run typecheck
corepack pnpm -r run test
corepack pnpm -r run build
```

The workspace contains `apps/web` (React + Vite) and `packages/core` (strict TypeScript parsing, domain rules, and LENEX generation). Core code is kept independent of browser APIs.

## Compatibility notes

- The default export format is LENEX 2.0 encoded as Windows-1250, matching the Splash-produced entry examples currently used by the project.
- Always test a generated submission with the organizer's version of Splash Meet Manager before relying on it for a meet.
- In particular, acceptance of exports containing optional relay-member positions (`RELAYPOSITIONS`) has not yet been confirmed in Splash.
- Offline/PWA installation and a permanent shared roster are not implemented yet. Browser autosave is for the current draft; JSON backup is the portable copy.

See [HANDOFF.md](HANDOFF.md) for verified LENEX facts, project decisions, current milestones, and open compatibility questions.
