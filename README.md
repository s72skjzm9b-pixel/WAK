# WAK – Weird Art Klub

A private, mobile-first creative club for children aged 10–13.
**Del din kunst. Opdag noget weird. Tag med på tur.**

> **Status: MVP in development. This app is NOT production-ready.** The database security
> has automated tests, but the full app has not yet run against a real Supabase project, and
> the legal, privacy and safeguarding items in [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md)
> need human review before real children use it.

---

## What's in the app

| Who | Where | What they can do |
| --- | --- | --- |
| Child (10–13) | `/kunst` `/upload` `/wakt` `/min-wak` | Browse the private gallery, react with emojis, upload art (moderated), ask to join trips, edit their nickname/avatar |
| Parent / guardian | `/voksen` | Give or withdraw consent, approve or decline trips, see their child's account and art, reset the child's password, request deletion |
| WAK admin | `/admin` | Approve memberships, moderate art and reports, create trips, manage registrations, process deletions, read the audit log |
| Anyone | `/` `/bliv-medlem` `/log-ind` `/privatliv` | Landing page, membership request, login, privacy information |

### The membership flow
1. The child fills in `/bliv-medlem`: nickname, avatar, username, password, birth year, and a parent's email.
2. The parent gets an email with a one-time link (valid 7 days) to `/voksen/samtykke/…`, reads what WAK
   stores, and gives consent. Image sharing is a **separate, optional** consent. If the parent says no,
   everything the child entered is deleted.
3. A WAK admin approves the application in `/admin/medlemmer`.
4. Only then can the child see anything in the club.

### The trip (WAKT) flow
1. The child presses **"Jeg vil med!"** → the parent gets an email.
2. The parent approves on `/voksen`. If there is space, the child is **confirmed**; otherwise **waitlisted**.
3. If someone cancels or the admin adds places, the first person on the waitlist moves up automatically
   and their parent is emailed.
4. Unanswered requests expire after 72 hours (or at the registration deadline).

---

## How children's data is protected (in plain language)

- **The database itself enforces the rules** (PostgreSQL Row Level Security), not just the screens.
  Even someone calling the API directly with a pending or suspended account gets nothing.
- **Images live in private storage.** There are no public image links. The app creates links that
  expire after 15 minutes, and only for people who are allowed to see that picture.
- **Photos are cleaned on upload.** Every image is re-encoded on the server, which removes GPS location,
  camera details and other hidden metadata (verified).
- **Every upload is moderated** before other children can see it. Two reports from members hide a work
  until an admin has looked at it.
- **Other children only ever see** a nickname, a drawn avatar (never a photo), a short bio and approved art.
  Ages, real names, schools and parents' contact details are stored in separate tables only the child's
  own parent and admins can read.
- **Participant lists are never shown to children.** Reactions are anonymous counts.
- **No ads, no trackers, no analytics, no likes/followers/leaderboards, no messages, no comments,
  no endless scroll.** The gallery uses a "show older art" button instead.
- **Search engines are blocked** (`noindex` headers + `robots.txt`).
- **Nickname and bio changes are reviewed** by an admin before they appear.
- **Important actions are logged** in an audit log (who approved what, when).
- **The server-only "service key"** is used only for the few steps where nobody is logged in yet
  (membership request, parent consent link) and for deleting logins. It is never sent to the browser.

---

## Technical overview

- **Next.js 16** (App Router, Server Actions), **TypeScript**, **Tailwind CSS 4**
- **Supabase**: Auth, PostgreSQL with Row Level Security, private Storage
- Installable as an app (PWA manifest). There is deliberately **no offline cache**, so private
  images are never stored on a shared device.

```
supabase/migrations/   Database: tables, security policies, private storage, business logic
tests/db/              Automated security tests for the database (run on a local PostgreSQL)
src/app/(klub)/        Children's app: kunst, upload, wakt, min-wak
src/app/voksen/        Parent portal (+ consent page)
src/app/admin/         Admin dashboard
src/components/ui/     WAK design system components
src/lib/               Supabase clients, auth guards, email, image processing
design/                Brand references and notes about logo files
docs/                  Launch checklist (legal / safeguarding / operations)
```

Children log in with a **username + password** (no email needed). Internally Supabase needs an
email-shaped login, so `kid_name` becomes `kid_name@konto.wak.invalid` – an address that can never
receive mail. Parents log in with a **one-time email link** (no password). Admins use email + password.

---

## Setting it up (what you need to do)

### 1. Create a Supabase project
1. Create a project at [supabase.com](https://supabase.com) – choose an **EU region** (e.g. Frankfurt).
2. Run the four SQL files in `supabase/migrations/` **in order** (SQL Editor → paste → Run),
   or with the Supabase CLI: `supabase link` then `supabase db push`.
3. **Authentication → Sign In / Providers → Email**:
   - Turn **off** "Allow new users to sign up" (accounts are only created by the app's server).
   - Keep the Email provider enabled (used for parents' login links and children's usernames).
4. **Authentication → URL Configuration**: set *Site URL* to your app address and add
   `https://YOUR-DOMAIN/auth/callback` to *Redirect URLs*.
5. **Authentication → SMTP**: connect a real email sender (the built-in one is only for testing and
   heavily rate-limited). Translate the *Magic Link* email template to Danish.
6. Recommended: enable the `pg_cron` extension and schedule
   `select public.expire_stale_registrations()` every 15 minutes (see the end of migration 04).

### 2. Configure environment variables
Copy `.env.example` to `.env.local` and fill it in. On Vercel, add the same variables under
*Project → Settings → Environment Variables*. **Never** give `SUPABASE_SERVICE_ROLE_KEY` a
`NEXT_PUBLIC_` prefix.

Emails (parent consent, trip permission) are sent with [Resend](https://resend.com) by default
(`RESEND_API_KEY`, `EMAIL_FROM` with a verified domain). Any provider can be swapped in
`src/lib/email.ts`.

### 3. Create the first admin
```bash
npm install
npm run admin:create -- admin@your-domain.dk "a long unique password"
```

### 4. Run locally / deploy
```bash
npm run dev        # http://localhost:3000
npm run build      # production build
```
Deploy by importing the GitHub repository in Vercel.

In development, emails are printed in the terminal instead of being sent (or written to a file if
`WAK_DEV_OUTBOX` is set), so you can click the parent consent link while testing.

---

## Testing

| Check | Command | Status |
| --- | --- | --- |
| Database security (36 tests: anonymous / pending / suspended / rejected access, privacy between members, moderation, reactions, reports, consent withdrawal, **no overbooking under concurrent approvals**, waitlist, expiry, deletion cascade, audit log) | `npm run test:db` (needs PostgreSQL 15+ installed locally) | ✅ passing |
| Type check / lint / production build | `npm run typecheck` · `npm run lint` · `npm run build` | ✅ passing |
| Image metadata removal (EXIF/GPS) | manual check against `src/lib/images.ts` | ✅ verified |
| Full flows in a browser against a real Supabase project | – | ❌ **not yet done** (see below) |

The database tests run the real migrations on a throw-away PostgreSQL with a small stand-in for
Supabase's `auth` and `storage` schemas (`tests/db/supabase-shim.sql`). They were also checked the
other way round: deliberately weakening a policy makes them fail.

**Not yet tested end-to-end:** the screens together with real Supabase Auth, Storage and email.
This needs a Supabase project (step 1 above). The first thing to do once one exists is to walk through
the 12 "definition of done" steps in `docs/LAUNCH-CHECKLIST.md`.

A design-system reference page with sample content is available in development at `/stilguide`.
