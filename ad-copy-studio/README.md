# La Cabra Ad Copy Studio

A local web app for developing Google Ads copy visually, reviewing illustrative ad combinations, and
giving Anabelle exactly approved copy with clear replacement instructions.

- **The Google Sheet stays the canonical copy library** ("La Cabra — Google Ads | Master Copy & Campaign Review").
- **The studio's local database** keeps proposals, feedback, revision history, approvals, sync records and export batches.
- Nothing is published to Google Ads, and nothing is hosted: it runs on `http://localhost:3100` on your computer only.

## Start, update and stop

**Easiest:** double-click `Open La Cabra Studio.command` (copy it wherever you like; it expects the studio in
`~/Documents/Codex/WAK/ad-copy-studio` and data in `~/Documents/Codex/La-Cabra-Studio-Data` — edit the two lines at the top if not).
It runs `scripts/update-and-open.sh`, which:

1. fetches the branch `claude/ecstatic-cannon-4z1ek3` (if offline it simply opens the version you have and says so);
2. backs up the database first;
3. updates only by a safe fast-forward — local changes are never discarded or overwritten;
4. rebuilds whenever the source changed, so an old build is never served;
5. restarts only the studio server it started itself (tracked in `studio-server.pid` in the data folder) and never stops other programs;
6. explains clearly if port 3100 is taken by something else;
7. opens the browser only when the new version answers, and prints which version opened.

Stop the studio by quitting the server it started: `kill $(cat ~/Documents/Codex/La-Cabra-Studio-Data/studio-server.pid)`
(or restart the computer). Manual alternative: `npm install && npm run build && npm start`.

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

Three screens: **Workspace**, **Changes**, **Settings**.

### The life of a change
**Draft** (autosaved while typing) → **Ready for review** (a deliberate click) → **Approved locally** → **Written to Sheet**
(only from a live connection with writes enabled, verified by reading back) → **To apply in Google Ads** → **Applied / registered** (history).
Drafts can never be approved directly. Editing something that is ready or approved returns it to draft.

### Workspace
- **Collections** organise copy that is reviewed together (Coffee, Subscriptions, New York Cafés, Danish Cafés, Café visits in brand Search,
  Brand stories, Ideas and unassigned, Christmas, Advent calendar, plus any you create with **+ New collection**). A collection is *not* a campaign:
  its **home** collection only says where a line is organised. **Intended uses** (studio intent, editable) and **mapped uses** (facts from the
  Sheet, read-only) are kept separate. New copy without an intended use appears in previews only when you choose *Try in preview*
  (labelled *Candidate preview*).
- **Collection details** (collapsible): name, description, image direction, intended formats, languages, final URL, display paths and call to
  action. Renaming changes only the label — never IDs, mappings or campaign references.
- Type directly into any wording. The save indicator says **Draft saved locally**; unsent edits are kept in the browser even through a reload or
  a failed request (**Recovered draft**, **Could not save · Retry**). *Original* shows a comparison and a revert.
- **Add headline / Add long headline / Add description**. Short introductions (G43–G47) live under *Ideas and unassigned*; **Use in collection…**
  turns an idea into a real field (independent copy, or deliberately linked). Business name, call to action and URLs are settings, not copy.
- **Shared wording** shows *Shared · N*. Selecting a line shows where it is used (*Edit use*). Before the first change you choose
  *Update shared wording everywhere* or *Make a separate version here* (a new line with empty translations).
- **Languages**: EN / DA / DE plus **+ Language** (starts empty, local only — the Sheet has no column for it). Other language versions are behind
  a toggle; phones show one language at a time.
- **Ad examples** beside the copy: format chips say *Currently mapped*, *Intended*, *Preview only* and *Approximate* (Demand Gen). A compact
  **readiness** list shows missing fields, over-limit wording, translation approvals and Sheet notes (e.g. missing long headlines). Choosing a
  preview never creates a campaign or changes a mapping. *Next examples* pages through a small representative set.
- **Feedback** per example: *Works* / *Needs work* (click again to clear; choose “What needs work?” — the whole combination by default, or specific
  lines) and comments you can edit, delete or resolve. Feedback belongs to the exact wording and language; earlier feedback moves to history.

### Changes
Ready-for-review items grouped by collection and language, with a mode-accurate button (*Approve locally* in Snapshot, *Accept into practice copy*
in Practice, *Approve and update Sheet* only when live writes are enabled), the real impact (“Affects 6 ad groups across 3 markets”) and where the
proposal came from (“Based on the snapshot read …”). Conflicts show both versions. **To apply in Google Ads** is Anabelle's list: what to replace,
add or remove and exactly where — with *Mark as applied* / *Mark as registered*, *Copy list* and *Download CSV* (not a Google Ads import file).
Done items leave the list immediately; nothing disappears because of age. **History** keeps applied and discarded items.

### Settings
Snapshot, Practice copy or Live Sheet. **Live Sheet stays disabled until the in-app checklist passes** (connection details, Google sign-in, a
successful read). Real Sheet writes stay switched off (`STUDIO_LIVE_WRITES` is not enabled) until a fresh live read, a conflict check and an
explicitly authorised, labelled test have been done. Your name, the business name, and what the workbook itself reports (7 Performance Max tabs
without a long headline, 43 lines awaiting translation approval) are also here.

## What was tested

Automated: `npm test` (54 domain tests) and `npm run test:browser` (9 browser tests on a copy of reproduced user data). Earlier releases: run against a sandbox that reproduces the workbook's formulas — including the fixed FILTER bound):
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

### November 2026 update (safety and clarity pass)
Verified on a reproduction of the current data (including “Seasonal Coffee from Mexico”, its Danish translation, English and Danish feedback and
comments, and a legacy line with no collection): the migration backs up first, keeps every draft, translation, comment, ID and history entry, and the
earlier build can still open the migrated database. Tests cover autosave failure/reload/overlap, Ready-for-review gating, mode labels, live-mode
gating, home vs intended use, candidate previews, long headlines and format limits, the seven long-headline gaps and 43 translation flags,
translation approval order, stable pairings (including the write plan updating the Sheet's pairing cells), new and renamed collections, local
languages, sharing impact and separate versions, reversible feedback and comments, combination-vs-line feedback, language-specific feedback,
the handoff lifecycle, hidden IDs, phone navigation and single-language view, visible keyboard focus and field-error associations, and the
launcher's stale-build detection.

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

### Still local only in this version
New lines (and their translations), extra languages, collection briefs, intended uses, feedback and comments live in the studio's database.
New lines are registered in the Sheet by hand (see “How accepting writes to the Sheet”). Real Sheet writes are switched off until the
authorised live test; the app's own Google connection still needs your sign-in to be tried for the first time.
