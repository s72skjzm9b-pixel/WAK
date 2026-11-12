# WAK – before real children use it

Items here need a **human decision or review**. The code supports them, but it cannot decide them.

## 1. Legal and privacy (Denmark / EU) — needs a lawyer or DPO
- [ ] **Data controller**: which legal entity runs WAK (forening, ApS, …)? Fill in `/privatliv`.
- [ ] **Legal basis per purpose.** The app currently records guardian consent (GDPR art. 6(1)(a) + art. 8;
      databeskyttelsesloven § 6(2) sets the Danish age to 13). Confirm whether membership, image sharing,
      trips and the audit log should rest on consent or another basis (e.g. contract / legitimate interest),
      and that parental consent is appropriate for 13-year-olds too.
- [ ] **Verifying the guardian.** Today, "guardian" = whoever controls the email address the child typed.
      Decide if that is enough or if extra checks are needed (e.g. MitID, a call, a meeting at the first WAKT).
- [ ] **DPIA** (konsekvensanalyse): children's data + images is likely to require one.
- [ ] **Data processing agreements** with Supabase, Vercel and the email provider; confirm EU regions
      and transfer mechanisms.
- [ ] **Retention periods**: rejected applications, rejected/removed images (currently kept for
      safeguarding review – decide for how long), audit log, past trip registrations, consent records.
- [ ] **Final privacy text** in child-friendly Danish and a parent version (`src/app/privatliv/page.tsx` is a draft).
- [ ] Policy version string (`WAK_POLICY_VERSION`) updated whenever the text changes.
- [ ] Deletion: consent records are deleted together with the child. Confirm whether some proof of consent
      must be kept for a period after deletion (accountability) and adjust.

## 2. Safeguarding — needs WAK's leadership
- [ ] Written **moderation guidelines** (what is rejected: faces, names, school logos, uniforms, house numbers,
      licence plates, unsafe content…), and who may be an admin.
- [ ] **Vetting of admins/organisers** (børneattest for anyone who meets children on WAKT).
- [ ] What happens when moderation finds something worrying (escalation, contact to parents, authorities).
- [ ] Trip policies: adult-to-child ratio, emergency contacts, photo rules on trips, pickup rules.
- [ ] Art is shown **without prior approval** (decided Nov 2026). Agree who checks new art and reports, and
      how often (e.g. daily), since an unsuitable picture is visible until someone removes it or reports it.
- [ ] Response time targets for reports.

## 3. Operations / technical — needs configuration
- [ ] Supabase project in an EU region; migrations applied; **public sign-ups disabled**.
- [ ] Real SMTP for Supabase Auth (magic links) + Resend (or other) for app emails; verified sending domain;
      Danish email templates.
- [ ] **MFA for admin accounts** (Supabase supports TOTP – recommended before launch).
- [ ] Bot protection on `/bliv-medlem` (e.g. Cloudflare Turnstile). Today: honeypot field + max 3 open
      applications per parent email + Supabase's own auth rate limits.
- [ ] `pg_cron` job for `expire_stale_registrations()`.
- [ ] Backups / point-in-time recovery enabled; who can access production data.
- [ ] Replace raster logo crops with original vector files (see `design/README.md`).
- [ ] Penetration test or independent security review of RLS policies and server actions.

## 4. End-to-end acceptance test (the MVP "definition of done")
Run on a staging Supabase project, on a phone:
1. [ ] A child requests membership.
2. [ ] The parent receives the email and gives consent.
3. [ ] An admin approves the account.
4. [ ] The child logs in.
5. [ ] The child uploads artwork (try a photo with GPS – confirm it is gone in the stored file).
6. [ ] Another approved member sees it at once in the feed and can swipe between works.
7. [ ] The parent and an admin can each remove it; a report hides it for everyone.
8. [ ] Members react with emojis (add, change, remove; reload to confirm it persisted).
9. [ ] A child finds a WAKT and presses "Jeg vil med!".
10. [ ] The parent approves participation.
11. [ ] The child sees "Du er tilmeldt!".
12. [ ] An admin sees and manages the registration (cancel → waitlist moves up).
- [ ] Negative checks with the browser devtools / API: logged out, pending, suspended and rejected accounts
      get no art, no members, no registrations; signed image URLs stop working after 15 minutes.
