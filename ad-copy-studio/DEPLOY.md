# Putting La Cabra Ad Copy Studio online (Supabase + Vercel)

**Supabase** holds the data (drafts, feedback, history) and handles Google sign-in.
**Vercel** runs the app. Only Google accounts on the domains you allow (e.g. `lacabra.com`) can open it.
Your Mac version keeps working as before; you move its data up once (step 5).

Plan about an hour, once. You need: the Supabase account, a Vercel account, and access to Google Cloud Console
with your La Cabra Google account.

> **Costs (check current prices):** Supabase's free plan pauses a project after about a week without use; the
> Pro plan (about $25/month) does not. Vercel's free Hobby plan is for non-commercial use; a business should use
> Pro (about $20/month per member). The studio itself needs very little capacity.

---

## 1. Create a separate Supabase project
Use a **new project** for the studio — not the WAK project (WAK holds children's data; keep them apart).

1. supabase.com → **New project** → name `la-cabra-ad-copy-studio`, region **Frankfurt (eu-central-1)**.
   Save the **database password** somewhere safe.
2. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key**.
3. **Connect** (top of the dashboard) → **Session pooler** → copy the connection string (port **5432**) and put your
   database password into it. This is `DATABASE_URL`.

The studio creates its own tables (in a schema called `ad_studio`) the first time it starts, and locks them so
Supabase's public API cannot read them — only the app can.

## 2. Turn on Google sign-in
1. console.cloud.google.com (signed in as La Cabra) → choose or create a project →
   **APIs & Services → OAuth consent screen**: *Internal* (only La Cabra accounts) → app name “La Cabra Ad Copy Studio”.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorised redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback` (shown in Supabase under
   Authentication → Providers → Google). Copy the client ID and secret.
3. Supabase → **Authentication → Providers → Google**: turn on, paste the client ID and secret, save.

## 3. Deploy on Vercel
1. vercel.com → **Add New → Project** → import the GitHub repository **WAK**.
2. **Root Directory**: `ad-copy-studio`. Framework: Next.js (detected).
3. **Environment Variables** (Production):

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the Session pooler string from step 1.3 |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 1.2 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key from step 1.2 |
| `STUDIO_ALLOWED_EMAIL_DOMAINS` | `lacabra.com` |
| `STUDIO_ALLOWED_EMAILS` | optional: extra people, comma-separated (e.g. a freelancer's Gmail) |
| `NEXT_PUBLIC_STUDIO_SIGNIN_DOMAIN` | `lacabra.com` (pre-selects La Cabra accounts on Google's screen) |
| `SHEET_MODE` | `snapshot` (start from the dated snapshot; see step 6 for the live Sheet) |

4. **Settings → Git → Production Branch**: `claude/ecstatic-cannon-4z1ek3` (or merge it into `main` first).
5. **Deploy**. Note the address, e.g. `https://la-cabra-ad-copy-studio.vercel.app`.

## 4. Tell Supabase the studio's address
Supabase → **Authentication → URL Configuration**:
- **Site URL**: your Vercel address.
- **Redirect URLs**: add `https://<your-vercel-address>/auth/callback`.

Open the Vercel address → **Sign in with Google** → you should see the workspace. Someone outside the allowed
domains sees “That Google account doesn't have access”.

## 5. Move your Mac data up (once)
On the Mac, in Terminal:

```bash
cd ~/Documents/Codex/WAK/ad-copy-studio && git pull && npm install
```

```bash
DATABASE_URL="<the Session pooler string>" npm run import:supabase -- ~/Documents/Codex/La-Cabra-Studio-Data/studio.db
```

It copies every draft, translation, feedback item, comment, collection detail and history entry in one step and
checks the counts. It refuses to run into a database that already has work in it (add `--replace` only if you
really mean to overwrite). Your Mac file is not changed. After the move, use the online studio as the main one so
work doesn't split between two places.

## 6. Optional: read the live Sheet online
Online, the Sheet is read with a Google **service account** (personal Google tokens can't be kept on Vercel):
1. Google Cloud Console → enable **Google Sheets API** → **IAM & Admin → Service accounts → Create** (no roles) →
   **Keys → Add key → JSON**.
2. Vercel → Environment Variables: `GOOGLE_SERVICE_ACCOUNT_JSON` = the whole contents of that JSON file. Redeploy.
3. Share the workbook with the service account's email as **Viewer**. Never make the Sheet public.
4. In the studio: **Settings → Connect the live Sheet** shows a checklist; when it's all ticked, choose **Live Sheet**.

Writing to the Sheet stays switched off until a fresh live read, a conflict check and an explicitly authorised,
labelled test have been done (`STUDIO_LIVE_WRITES=enabled` is deliberately not set).

## What changes online
- Everyone signs in with Google; names in history come from the account (no name prompt).
- Data lives in Supabase (its backups apply); the Mac's `npm run backup` is for the Mac copy only.
- **Practice copy** is shared by everyone online.
- Accepted new lines still have to be added to the Sheet by hand (as on the Mac).

## Checked before release
`npm test` (domain rules on SQLite), the same suite on PostgreSQL 16 (`STUDIO_TEST_PG=… npm test`), the data import
and table lock-down on PostgreSQL, the local browser suite, and an online end-to-end run (`npm run test:hosted`)
with Postgres and a stand-in for Supabase sign-in: signed-out visitors and non-La Cabra accounts are refused,
La Cabra accounts can edit and give feedback under their own name, and cross-site writes are blocked.
Not yet done: a run against your real Supabase and Vercel projects — that happens when you follow steps 1–4.
