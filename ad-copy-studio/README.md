# La Cabra Ad Copy Studio

A local web app for developing Google Ads copy visually, reviewing illustrative ad combinations, and
giving Anabelle exactly approved copy with clear replacement instructions.

- **The Google Sheet stays the canonical copy library** ("La Cabra — Google Ads | Master Copy & Campaign Review").
- **The studio's local database** keeps proposals, feedback, revision history, approvals, sync records and export batches.
- Nothing is published to Google Ads, and nothing is hosted: it runs on `http://localhost:3100` on your computer only.

## Start and stop

Requirements: Node.js 22.13 or newer (uses the built-in `node:sqlite`).

```bash
cd ad-copy-studio
npm install
npm run build
npm start
```

Open <http://localhost:3100>. Stop with `Ctrl+C` in that terminal. `./start.sh` does install → build → start in one go.
For development with live reload: `npm run dev`. The server only listens on 127.0.0.1 and refuses requests
addressed to any other host name. (To view it through a trusted remote preview, start it with
`STUDIO_ALLOWED_HOSTS='*' npm start`; writes still require same-origin requests carrying the app's header.)

Until Google is connected the studio opens in **Snapshot** mode: the real wording of the workbook as captured
on 16 Nov 2026 (`seed/workbook-snapshot.json`), read-only and labelled as a snapshot everywhere.

## Google connection setup

The studio needs its own server-side authorization. Pick one:

**Option A — sign in with your Google account (OAuth, recommended for one person)**
1. In Google Cloud Console create (or reuse) a project and enable the **Google Sheets API**.
2. *APIs & Services → OAuth consent screen*: internal (Workspace) or external with yourself as a test user.
3. *Credentials → Create credentials → OAuth client ID → Web application*.
   Authorized redirect URI: `http://localhost:3100/api/google/callback`.
4. `cp .env.example .env.local` and fill in `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.
5. Restart, open **Connection**, click **Sign in with Google**, and use an account that can edit the workbook.

**Option B — service account**
1. Create a service account and a JSON key; store the key **outside this folder**
   (e.g. `~/.la-cabra-ad-copy-studio/secrets/`).
2. Share the workbook with the service account's email as **Editor**. Never publish the Sheet or make it link-public.
3. In `.env.local`: `GOOGLE_AUTH_MODE=service_account` and `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/path/to/key.json`.

Scope requested: `https://www.googleapis.com/auth/spreadsheets` (needed to update wording). Set `GOOGLE_ACCESS=readonly`
to request `spreadsheets.readonly` instead; write-back is then disabled. Tokens and keys stay on the server side: the
refresh token is stored in `~/.la-cabra-ad-copy-studio/secrets/google-oauth-token.json` (mode 600), never sent to the
browser, never logged and never committed. Expired or revoked authorization, missing permission and failed writes are
shown on the Connection page and on the affected proposal.

## Local data location and backup

All local data lives in `~/.la-cabra-ad-copy-studio/` (override with `STUDIO_DATA_DIR`; do not point it inside this
folder while using `npm run dev`):

| File | Contents |
| --- | --- |
| `studio.db` | SQLite: proposals, events, approvals, write attempts, feedback, pins, acknowledgements, export batches, Sheet reads |
| `sandbox-workbook.json` | The practice copy used in Sandbox mode |
| `secrets/` | OAuth token (not backed up by the script) |

Back up with `npm run backup` (writes a consistent copy to `~/.la-cabra-ad-copy-studio/backups/<timestamp>/`) or
`npm run backup -- /path/to/folder`. To restore, stop the app and copy `studio.db` back.

## Using the studio

There are three screens: **Workspace** (where the work happens), **Changes** and **Settings**.

### Workspace
- **Collections** on the left group copy that is reviewed together: *Online Coffee, Subscriptions, New York Cafés,
  Danish Cafés, Café visits in brand Search, Brand stories, Not yet assigned, Christmas, Advent calendar*.
  They are built from the Sheet's existing campaign-tab mappings and are not Google campaigns. Local copy stays local
  (the New York-only line is never in Danish Cafés), brand stories keep each headline with its own descriptions, and the
  proposed “La Cabra” headline stays unassigned — it is not added or pinned anywhere automatically.
- A one-line **summary** shows intent, audience, languages/markets and destination (marked *unconfirmed* where the Sheet says so).
- **Headlines and descriptions are listed together**, with English, Danish and German side by side. Show or hide
  languages with the EN / DA / DE buttons. **Click into any wording and type** — it autosaves as a local *suggestion*
  (“Saving… / Saved / Could not save”). The Sheet is never changed from here. *Original* shows a comparison and a revert.
- Changing English keeps the translations and marks them **Needs translation review**; nothing is translated or overwritten automatically.
- **Add headline / Add description** creates new copy in the current collection with its own ID (`NEW-001`…) and
  empty translation fields. Identical copy that already exists is refused with a short notice.
- **Ad examples** on the right update as you type. Click a line to see only examples containing it. Choose language,
  format and desktop/mobile. Examples with suggested wording are labelled. **Works / Needs work / Comment** saves feedback
  against the exact text shown; if the wording later changes, the old feedback moves to “Earlier feedback on different wording”.
- **Search** is at the top; **Filter** holds customer intent, status (New, Edited, Needs translation review, Needs work, Returned) and type.
- On small screens use the **Copy / Preview** switch.

### Changes
- **Suggestions**: was → now, the collection and language, and whether translations will need review.
  **Accept** approves the exact wording and, when connected, writes it to the Sheet and checks it was saved.
  **Return for editing** (optional note) and **Discard** are also here. Lines that are too long cannot be accepted.
- **Accepted — waiting for the Sheet**: changes that couldn't be written yet (read-only mode, offline, or a conflict).
  If the Sheet changed after the suggestion was made, you see both versions and choose *Keep my wording* or *Discard mine*.
- **For Anabelle: accepted changes**: the old → new list, with **Copy list** and **Download CSV** (a review list, not a
  Google Ads import file). *Mark as applied* records her confirmation and clears the row from “Updates for Anabelle”
  in the Sheet; the studio cannot check Google Ads itself.

### Settings
Choose **Live Sheet**, **Snapshot** (read-only, dated) or **Practice copy** (local, safe to accept into), sign in to Google,
and set your name for the history. Technical details (column mapping checks, write log, typography notes) are tucked away there.
If the live Sheet can't be reached, the workspace keeps working from the last copy it could read and says so at the top.

## How accepting writes to the Sheet

- Approval covers the **exact wording** (and, for Danish/German, the English it translates). Any later edit cancels it.
- Accepting a translation that follows a *suggested* English change is refused until the English is accepted first.
- For an existing line the studio writes only the text cell (`Source copy` English, or `Translation review` Danish/German)
  and that row's `Change reference` approval cells (I/J). It re-reads the Sheet first, stops with a conflict if anyone
  changed the wording, never overwrites formulas, reads the cells back afterwards and confirms “Updates for Anabelle”
  shows the change. Retrying is safe. The saved reference (C/E) only moves when Anabelle marks a change as applied.
- **New copy is kept in the studio in this version.** The Updates for Anabelle formula only covers the existing
  Change reference rows (`A5:L148`), so an appended row would be invisible to her. To register accepted new copy by hand:
  add it to `Source copy` and `Translation review`, and **insert** its three `Change reference` rows *above the last G-row*
  (so the formula's range grows), copying the formulas from the row above.

## What was tested

Automated (`npm test`, 37 tests, run against a sandbox that reproduces the workbook's formulas — including the fixed FILTER bound):
drafts never write; approval writes only the 3 intended literal cells; Updates for Anabelle detects the change; further edits invalidate
approval; English edits flag translations and invalidate translation approvals; concurrent Sheet edits produce a conflict and keep the draft;
failed writes are retryable; retries after a lost response do not write twice; partial writes resume; formula cells are refused; rows outside
the FILTER range are refused; acknowledgement is separate from approval and from advancing the reference; data persists across restarts;
drafts, unapproved and test items are excluded from exports; feedback detects changed wording; Search pins are respected and PMax has none.

Against the **real workbook** (16 Nov 2026, through the Google Sheets connector used during implementation — not through the app's own
Google client, which needs your credentials): read-only discovery of all 22 tabs, headers, formulas and IDs; then a labelled `TEST01` item was
added (Change-reference rows inserted inside the FILTER range), the app's write plan for it (`Source copy!E53`, `Change reference!I146:J146`)
was applied, Updates for Anabelle showed it as "Approved — apply / acknowledge" with Danish/German flagged "Recheck translation"; an outside
edit dropped the Sheet's own approval; advancing the reference removed the English row from Updates; a real partial write occurred (session
restart between the two writes) and was resumed. The test item was then removed: formulas, the FILTER range (`A5:L148`) and
"No changes since the saved reference" were verified restored.

The simplified workspace (Nov 2026) was also checked in a browser against data created with the earlier version: old drafts,
a submitted change, a returned translation, an old “variation” with campaign targets and old feedback all reappeared in the right
collections; editing, translation flags, new copy with empty translations, duplicate refusal, live previews, feedback, accept →
Sheet → Anabelle's list → mark as applied, restart survival, snapshot mode and an unreachable live Sheet were exercised.

## Known limitations

- The app's own Google connection (`GoogleSheetsGateway`) has not been run against Google yet, because no credentials were available
  during implementation. Its first real run should be a **Refresh** in read-only fashion, then one write on a test item.
- Google's Help pages (`support.google.com`) and Google results pages were not reachable from the build environment. Character limits
  were taken from official-page excerpts in search results; Demand Gen limits are marked provisional; the PMax "short description"
  requirement (60 vs 30 characters) is flagged as unresolved. Preview typography (Arial/Arimo, Roboto, Google Sans Flex; sizes in
  `src/lib/typography.ts`) is an **approximation** and labelled as such — adjust that one file if you measure live pages.
- Previews are illustrative text only: no images, logos, sitelinks or landing URLs (shown as gaps), and not a prediction of what Google serves.
- The snapshot holds Anabelle's alternative proposals for US_SNO_Branded and DK_PMX_Local only; a live refresh reads all tabs.
- New variations are not written to the Sheet (see above). Retirement never deletes Sheet rows.
- There is no sign-in: anyone using this computer can edit and accept. This is fine for a local prototype only;
  real accounts and permissions are required before the app is shared or hosted.
- `values:batchUpdate` atomicity is not relied on: the app verifies by read-back and resumes partial writes.

## Requirements for later private hosting

The code keeps Google integration (`src/server/google`, `src/server/sheets`), storage (`src/server/store`) and business rules
(`src/server/domain`, `src/lib`) separate, so moving to private hosting means:

1. **Authentication and permissions**: add real sign-in (e.g. Google Workspace SSO restricted to the La Cabra domain) and
   decide who may accept changes; enforce it server-side in `src/server/http/handler.ts` (the actor is already recorded on every action).
2. **Shared database**: reimplement `src/server/store/repo.ts` on Postgres (the schema in `db.ts` is portable); keep the
   `revision_events` history append-only.
3. **Google credentials**: use a service account or a per-user OAuth flow with tokens in a secrets manager; register the hosted
   redirect URI; keep the minimal `spreadsheets` scope.
4. **Concurrency**: the in-process write lock becomes a database lock (e.g. `SELECT … FOR UPDATE` on the revision).
5. HTTPS, private network or identity-aware proxy, backups of the database, and audit-log retention.
6. Remove the localhost host check and replace it with proper origin/CSRF protection for the hosted domain.

## Project layout

```
src/server/workbook   header-driven parser, formula replicas (pure)
src/server/sheets     gateway interface + snapshot and sandbox implementations
src/server/google     OAuth / service-account auth and the Sheets REST gateway
src/server/store      SQLite schema and repository (all SQL)
src/server/domain     studio service, collections, suggestions, write planner, read models
src/lib               shared limits, combination generator, workspace helpers, preview typography
src/app               Next.js pages and API routes
seed/                 dated snapshot of the real workbook (scripts/build-snapshot.mjs)
tests/                behaviour tests
```
