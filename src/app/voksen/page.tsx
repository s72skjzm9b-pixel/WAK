import type { Metadata } from "next";
import { requireGuardian } from "@/lib/auth";
import { signPaths } from "@/lib/storage";
import { EVENT_FIELDS } from "@/lib/events";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { fmtDateTime, fmtTime, nowMs } from "@/lib/format";
import { CancelRegistration, ConsentToggle, DecideRegistration, DeletionRequest, ResetPassword } from "./Forms";
import type { Artwork, Profile, Registration, WaktEvent } from "@/lib/types";

export const metadata: Metadata = { title: "Forældreside" };

type Consent = { child_id: string; consent_type: string; granted: boolean; created_at: string; event_id: string | null };

export default async function GuardianPage() {
  const { supabase, profile } = await requireGuardian();
  const { data: links } = await supabase.from("guardian_children").select("child_id").eq("guardian_id", profile.id);
  const childIds = (links ?? []).map((l) => l.child_id as string);

  const [kids, privs, consents, regs, arts, me, deletions] = await Promise.all([
    supabase.from("profiles").select("id, role, status, nickname, avatar, bio, pending_nickname, pending_bio").in("id", childIds),
    supabase.from("child_private").select("child_id, username").in("child_id", childIds),
    supabase.from("consent_records").select("child_id, consent_type, granted, created_at, event_id").in("child_id", childIds).is("event_id", null).order("created_at", { ascending: false }),
    supabase.from("event_registrations").select(`id, event_id, child_id, status, requested_at, expires_at, confirmed_at, events(${EVENT_FIELDS})`).in("child_id", childIds).order("requested_at", { ascending: false }),
    supabase.from("artworks").select("id, owner_id, title, thumb_path, status, created_at").in("owner_id", childIds).order("created_at", { ascending: false }).limit(60),
    supabase.from("guardian_private").select("full_name, email, phone").eq("guardian_id", profile.id).single(),
    supabase.from("deletion_requests").select("id, kind, child_id, status, created_at").eq("guardian_id", profile.id).eq("status", "open"),
  ]);

  const children = (kids.data ?? []) as Profile[];
  const usernames = Object.fromEntries((privs.data ?? []).map((p) => [p.child_id, p.username]));
  const consentNow = (child: string, type: string) =>
    ((consents.data ?? []) as Consent[]).find((c) => c.child_id === child && c.consent_type === type)?.granted ?? false;
  const registrations = ((regs.data ?? []) as unknown as (Registration & { events: WaktEvent | null })[]).filter((r): r is Registration & { events: WaktEvent } => Boolean(r.events));
  const artworks = (arts.data ?? []) as Pick<Artwork, "id" | "owner_id" | "title" | "thumb_path" | "status">[];
  const thumbs = await signPaths(supabase, "artwork", artworks.map((a) => a.thumb_path));
  const openDeletions = deletions.data ?? [];
  const now = nowMs();

  return (
    <div className="min-h-dvh bg-cream">
      <header className="bg-cobalt text-cream">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo variant="letters-cream" className="w-20" />
            <span className="rounded-full bg-lavender px-3 py-1 text-sm font-semibold text-cobalt">Forældreside</span>
          </div>
          <form action="/log-ud" method="post"><Button variant="cream" size="sm" type="submit">Log ud</Button></form>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
        <div>
          <h1 className="text-4xl text-cobalt">Hej {me.data?.full_name?.split(" ")[0] ?? ""}</h1>
          <p className="text-lg text-ink-soft">Her styrer du dit barns medlemskab, samtykker og ture.</p>
        </div>

        {children.length === 0 && <Notice>Der er ingen børn knyttet til din konto.</Notice>}

        {children.map((child) => {
          const pending = registrations.filter((r) => r.child_id === child.id && r.status === "pending_guardian" && new Date(r.expires_at).getTime() > now);
          const upcoming = registrations.filter((r) => r.child_id === child.id && ["confirmed", "waitlisted"].includes(r.status) && new Date(r.events.ends_at).getTime() > now);
          const childArt = artworks.filter((a) => a.owner_id === child.id);
          const deletionOpen = openDeletions.some((d) => d.child_id === child.id);
          return (
            <section key={child.id} className="sticker space-y-6 p-5">
              <div className="flex items-center gap-4">
                <Avatar value={child.avatar} size="lg" />
                <div>
                  <h2 className="text-3xl text-cobalt">{child.nickname}</h2>
                  <p className="text-ink-soft">Brugernavn: <span className="font-semibold text-ink">{usernames[child.id]}</span></p>
                  <StatusPill status={child.status} className="mt-1" />
                </div>
              </div>
              {deletionOpen && <Notice tone="warn">Du har bedt om sletning. WAK behandler den hurtigst muligt.</Notice>}

              {pending.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-2xl text-cobalt">Vil gerne med på tur</h3>
                  {pending.map((r) => (
                    <div key={r.id} className="rounded-2xl border-[3px] border-orange bg-paper p-4">
                      <p className="font-display text-xl font-semibold">{r.events.title}</p>
                      <p>{fmtDateTime(r.events.starts_at)}–{fmtTime(r.events.ends_at)} · {r.events.meeting_point}{r.events.address ? `, ${r.events.address}` : ""}</p>
                      {r.events.description && <p className="mt-2 whitespace-pre-line text-ink-soft">{r.events.description}</p>}
                      {r.events.practical_info && <p className="mt-2 whitespace-pre-line"><b>Praktisk:</b> {r.events.practical_info}</p>}
                      <p className="mt-2 text-sm text-ink-soft">Arrangør: {r.events.organizer_name}{r.events.organizer_phone ? ` · ${r.events.organizer_phone}` : ""}{r.events.organizer_email ? ` · ${r.events.organizer_email}` : ""}</p>
                      <p className="mb-3 text-sm text-ink-soft">Svar senest {fmtDateTime(r.expires_at)}</p>
                      <DecideRegistration registrationId={r.id} />
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-2xl text-cobalt">Kommende ture</h3>
                {upcoming.length === 0 && <p className="text-ink-soft">Ingen kommende ture.</p>}
                {upcoming.map((r) => (
                  <div key={r.id} className="rounded-2xl border-2 border-cobalt/20 bg-paper p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-display text-xl font-semibold">{r.events.title}</p>
                      <StatusPill status={r.status} context="registration-guardian" />
                    </div>
                    <p>{fmtDateTime(r.events.starts_at)}–{fmtTime(r.events.ends_at)}</p>
                    <p>Mødested: {r.events.meeting_point}{r.events.address ? `, ${r.events.address}` : ""}</p>
                    <p className="text-sm text-ink-soft">
                      Kontakt arrangør: {r.events.organizer_name}
                      {r.events.organizer_phone && <> · <a className="underline" href={`tel:${r.events.organizer_phone}`}>{r.events.organizer_phone}</a></>}
                      {r.events.organizer_email && <> · <a className="underline" href={`mailto:${r.events.organizer_email}`}>{r.events.organizer_email}</a></>}
                    </p>
                    {r.events.status === "cancelled" ? <Notice tone="warn">Turen er aflyst.</Notice> : <div className="mt-2"><CancelRegistration registrationId={r.id} /></div>}
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="text-2xl text-cobalt">Samtykker</h3>
                <ConsentToggle childId={child.id} type="image_sharing" granted={consentNow(child.id, "image_sharing")} label="Billeddeling i galleriet"
                  description="Barnet må dele billeder af kunst i det lukkede galleri. Slår du det fra, bliver barnets billeder skjult med det samme." />
                <ConsentToggle childId={child.id} type="membership" granted={consentNow(child.id, "membership")} label="Medlemskab"
                  description="Trækker du det tilbage, bliver kontoen sat på pause med det samme, og alle tilmeldinger aflyses." />
              </div>

              <div className="space-y-3">
                <h3 className="text-2xl text-cobalt">{child.nickname}s kunst</h3>
                {childArt.length === 0 ? <p className="text-ink-soft">Ingen billeder endnu.</p> : (
                  <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {childArt.map((a) => (
                      <li key={a.id} className="space-y-1">
                        {thumbs[a.thumb_path] ? (
                          // eslint-disable-next-line @next/next/no-img-element -- private signed URL
                          <img src={thumbs[a.thumb_path]} alt={a.title ?? ""} className="aspect-square w-full rounded-xl border-2 border-cobalt object-cover" />
                        ) : <div className="aspect-square rounded-xl bg-lavender-soft" />}
                        <StatusPill status={a.status} className="text-xs" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap gap-3 border-t-2 border-cobalt/10 pt-4">
                <ResetPassword childId={child.id} />
                {!deletionOpen && <DeletionRequest kind="child_account" childId={child.id} label="Slet barnets konto og data" />}
              </div>
            </section>
          );
        })}

        <section className="space-y-2 rounded-[2rem] bg-lavender-soft p-5">
          <h2 className="text-2xl text-cobalt">Dine oplysninger</h2>
          <p>{me.data?.full_name} · {me.data?.email}{me.data?.phone ? ` · ${me.data.phone}` : ""}</p>
          <p className="text-sm text-ink-soft">Kun WAK&apos;s administratorer kan se dine kontaktoplysninger. Andre forældre og børn kan aldrig se dem.</p>
          {!openDeletions.some((d) => d.kind === "guardian_account") && <DeletionRequest kind="guardian_account" label="Slet min forælderkonto" />}
        </section>
      </main>
    </div>
  );
}
