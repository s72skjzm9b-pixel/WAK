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

## The three views

### Write (copywriter)
- Browse by customer intent, market (campaign tab membership), language, copy family and asset type. Location alone never
  decides intent; Christmas and Advent show as gaps because no approved seasonal source exists in the workbook.
- **Replace wording** proposes new text for one exact line and language. **Add variation** creates an extra line with a new
  ID and replaces nothing; you choose the groups it is meant for. **Propose retirement** asks for a line to stop being used.
- Original and proposed wording side by side, word-level diff, character counts against every format the line is used in,
  translations beside the English, and live illustrative previews with compatible headlines/descriptions from the same group.
  The editor uses the font of the selected preview placement.
- Typing autosaves a **local draft only**. The Sheet is never written from this view.
- Approvers can also **Approve as is** — approve the current Sheet wording exactly as it stands (no Sheet change).

### Review (team)
- **Copy approvals**: queue of submitted proposals → approval screen.
- **Combinations**: illustrative Search (desktop/mobile) and Performance Max text previews per campaign group, sampled six at
  a time with "Show more combinations". Search previews respect a configured **pinning proposal** (none by default; "La Cabra"
  is not pinned first). PMax offers no pinning. Explicit headline–description pairs are preserved.
- Feedback per combination: **Works / Needs changes / Comment only**, with reasons (repetition, unclear meaning, wrong context,
  tone, translation, factual concern…). Feedback is stored with the exact text versions; the app shows when wording has changed
  since. Combination feedback is separate from copy approval, and marking a preview "Needs changes" does not stop Google from
  serving it — resolve by changing or removing an asset, or separating incompatible assets into different groups.

### Handover (Anabelle)
- Filters by market, language and campaign (eligible group).
- **Replacements** with exact previous and replacement text and where they are used; **approved new variations**; approved
  retirements; **approved copy by group**; **unresolved dependencies** (translations needing re-review, missing long headlines,
  landing URLs to confirm, seasonal gaps, failed or pending writes, combinations marked "needs changes").
- **Copy to clipboard**, and **Create dated export batch (CSV)**. Each batch records the text fingerprints, approval IDs and the
  Sheet read it came from. The CSV is a *review/handover CSV* — it has **not** been validated as a Google Ads Editor import.
- Only wording with a currently valid approval of its exact text is included. Drafts, proposals in review, invalidated approvals
  and test items are never included; they are counted as excluded.
- Anabelle does not need to inventory every combination Google serves.

## Approval and write-back

Four states are kept distinct everywhere: **current Sheet wording → proposed revision → approved revision → written to the Sheet**.
Nothing is ever labelled "live in Google Ads".

- An approval covers **exact wording** (and, for Danish/German, the English it translates). Any edit invalidates it and returns
  the proposal to draft. When English changes, open translation proposals are sent back and as-is translation approvals stop counting.
- **Approve and update Sheet** (approval screen) is the only action that changes canonical wording. Before writing, the app
  re-reads the Sheet, locates rows by source ID (never by remembered row numbers), and stops with a **conflict** if the wording is no
  longer what the proposal was based on, if a target cell now holds a formula, or if the change would fall outside the
  *Updates for Anabelle* FILTER range. The approval screen lists the exact cells, current and new values, and the predicted
  effect on Updates for Anabelle.
- For an existing line it writes only:
  1. the text cell — `Source copy` English column (E) or `Translation review` Danish (D) / German (F) column, and
  2. that row's `Change reference` **approved replacement (I)** and **approved English (J)** — the workbook's documented exact-text approval.
  Values are written RAW (never interpreted as formulas); formatting and every other cell are untouched.
- After writing, it reads the cells back and checks that *Updates for Anabelle* now lists the change. A failed write keeps the approved
  draft and shows "Sheet write failed"; **retry** is safe: it detects work that already landed, resumes a partial write, and never writes twice.
- The saved reference (`Change reference` C/E) is **not** advanced on approval, so Anabelle's pending replacement stays visible.
- After Anabelle applies a change she clicks **I applied this in Google Ads** (an acknowledgement, not verification of Google Ads),
  and then, as a separate action, **Advance saved reference**, which copies current D/F into C/E for that one row.
- **New variations are kept local in this release.** The Updates for Anabelle formula filters a fixed range
  (`'Change reference'!A5:L148`), so an appended row would be invisible to her. To register an approved variation by hand:
  add it to `Source copy` (next free row inside A5:A100) and `Translation review`, and **insert** its three `Change reference`
  rows *above the last G-row* (e.g. right-click row 146 → Insert 3 rows above) so the FILTER range expands; copy the formulas from
  the row above. Then assign it to campaign tabs deliberately.

## What was tested

Automated (`npm test`, 28 tests, run against a sandbox that reproduces the workbook's formulas — including the fixed FILTER bound):
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
- Role switching is a convenience for demonstrating the workflow — not authentication or access control.
- `values:batchUpdate` atomicity is not relied on: the app verifies by read-back and resumes partial writes.

## Requirements for later private hosting

The code keeps Google integration (`src/server/google`, `src/server/sheets`), storage (`src/server/store`) and business rules
(`src/server/domain`, `src/lib`) separate, so moving to private hosting means:

1. **Authentication**: replace the role switcher with real sign-in (e.g. Google Workspace SSO restricted to the La Cabra domain) and
   enforce roles server-side in `src/server/http/handler.ts` (the actor is already recorded on every action).
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
src/server/domain     studio service, write planner, handover, read models
src/lib               shared limits, combination generator, preview typography
src/app               Next.js pages and API routes
seed/                 dated snapshot of the real workbook (scripts/build-snapshot.mjs)
tests/                behaviour tests
```
