import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill } from "@/components/ui/StatusPill";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { ActionForm } from "../ActionForm";
import { decideMembership, reviewProfile, setMemberStatus } from "../actions";
import { fmtShortDate } from "@/lib/format";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Medlemmer · Admin" };

type Row = Profile & { created_at: string };

export default async function MembersPage() {
  const { supabase } = await requireAdmin();
  const { data: kids } = await supabase.from("profiles")
    .select("id, role, status, nickname, avatar, bio, pending_nickname, pending_bio, created_at")
    .eq("role", "child").order("created_at", { ascending: false });
  const children = (kids ?? []) as Row[];
  const ids = children.map((c) => c.id);
  const [{ data: privs }, { data: links }, { data: consents }] = await Promise.all([
    supabase.from("child_private").select("child_id, username, birth_year").in("child_id", ids),
    supabase.from("guardian_children").select("child_id, guardian_id").in("child_id", ids),
    supabase.from("consent_records").select("child_id, consent_type, granted, created_at").in("child_id", ids).is("event_id", null).order("created_at", { ascending: false }),
  ]);
  const gIds = [...new Set((links ?? []).map((l) => l.guardian_id))];
  const { data: guardians } = await supabase.from("guardian_private").select("guardian_id, full_name, email, phone").in("guardian_id", gIds);
  const priv = Object.fromEntries((privs ?? []).map((p) => [p.child_id, p]));
  const guardianOf = (id: string) => (links ?? []).filter((l) => l.child_id === id).map((l) => (guardians ?? []).find((g) => g.guardian_id === l.guardian_id)).filter(Boolean);
  const consent = (id: string, t: string) => (consents ?? []).find((c) => c.child_id === id && c.consent_type === t)?.granted ?? false;
  const year = new Date().getFullYear();

  const pendingAdmin = children.filter((c) => c.status === "pending_admin");
  const pendingGuardian = children.filter((c) => c.status === "pending_guardian");
  const profileChanges = children.filter((c) => c.pending_nickname || c.pending_bio);
  const members = children.filter((c) => c.status === "active" || c.status === "suspended");

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-4xl text-cobalt">Ansøgninger ({pendingAdmin.length})</h1>
        {pendingAdmin.length === 0 && <Notice>Ingen ansøgninger venter.</Notice>}
        <ul className="space-y-4">
          {pendingAdmin.map((c) => (
            <li key={c.id} className="sticker grid gap-4 p-4 md:grid-cols-[1fr_auto]">
              <div className="flex gap-4">
                <Avatar value={c.avatar} size="lg" />
                <div className="space-y-1">
                  <p className="font-display text-2xl text-cobalt">{c.nickname}</p>
                  <p>Brugernavn: <b>{priv[c.id]?.username}</b> · Født {priv[c.id]?.birth_year} (~{year - (priv[c.id]?.birth_year ?? year)} år) · Ansøgt {fmtShortDate(c.created_at)}</p>
                  {guardianOf(c.id).map((g) => <p key={g!.guardian_id}>Voksen: <b>{g!.full_name}</b> · {g!.email}{g!.phone ? ` · ${g!.phone}` : ""}</p>)}
                  <p className="text-sm">Samtykker: medlemskab {consent(c.id, "membership") ? "✓" : "✗"} · privatlivsinfo {consent(c.id, "privacy_notice") ? "✓" : "✗"} · billeddeling {consent(c.id, "image_sharing") ? "✓" : "✗"}</p>
                  <p className="text-sm text-ink-soft">Tjek: Er kunstnernavnet passende og uden rigtigt navn/kontaktinfo? Passer alderen (10–13)?</p>
                </div>
              </div>
              <ActionForm action={decideMembership} hidden={{ childId: c.id }} className="md:w-64">
                <input name="note" placeholder="Note (frivillig)" className="rounded-xl border-2 border-cobalt/30 bg-paper px-3 py-2" />
                <SubmitButton name="decision" value="approve">Godkend</SubmitButton>
                <SubmitButton name="decision" value="reject" variant="danger">Afvis</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
        {pendingGuardian.length > 0 && (
          <p className="mt-3 text-ink-soft">{pendingGuardian.length} ansøgning(er) venter stadig på forældresamtykke.</p>
        )}
      </section>

      <section id="profiler">
        <h2 className="mb-4 text-3xl text-cobalt">Profilændringer ({profileChanges.length})</h2>
        <ul className="space-y-3">
          {profileChanges.map((c) => (
            <li key={c.id} className="sticker flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                {c.pending_nickname && <p>Navn: <s className="text-ink-soft">{c.nickname}</s> → <b>{c.pending_nickname}</b></p>}
                {c.pending_bio !== null && <p>Tekst: <b>{c.pending_bio || "(tom)"}</b></p>}
              </div>
              <ActionForm action={reviewProfile} hidden={{ childId: c.id }} className="flex-row">
                <div className="flex gap-2">
                  <SubmitButton name="decision" value="approve" size="sm">Godkend</SubmitButton>
                  <SubmitButton name="decision" value="reject" variant="danger" size="sm">Afvis</SubmitButton>
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-3xl text-cobalt">Medlemmer ({members.length})</h2>
        <ul className="divide-y-2 divide-cobalt/10 rounded-3xl border-2 border-cobalt bg-paper">
          {members.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
              <Avatar value={c.avatar} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.nickname} <span className="font-normal text-ink-soft">@{priv[c.id]?.username}</span></p>
                <p className="text-sm text-ink-soft">{guardianOf(c.id).map((g) => `${g!.full_name} (${g!.email})`).join(", ")}</p>
              </div>
              <StatusPill status={c.status} />
              <ActionForm action={setMemberStatus} hidden={{ childId: c.id, status: c.status === "active" ? "suspended" : "active" }}>
                <SubmitButton size="sm" variant={c.status === "active" ? "danger" : "primary"}>
                  {c.status === "active" ? "Suspendér" : "Genaktivér"}
                </SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
