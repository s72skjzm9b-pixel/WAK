import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { signPaths } from "@/lib/storage";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { StatusPill } from "@/components/ui/StatusPill";
import { ActionForm } from "../ActionForm";
import { moderateArtwork, resolveReport } from "../actions";
import { fmtShortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Kunst · Admin" };

const REASONS: Record<string, string> = {
  personal_info: "Personlige oplysninger",
  identifiable_person: "Genkendelig person",
  unsafe: "Ubehageligt/farligt",
  mean: "Ondt/drillende",
  other: "Andet",
};

type Art = { id: string; title: string | null; description: string | null; image_path: string; thumb_path: string; status: string; created_at: string; owner_id: string; profiles: { nickname: string } | null };

export default async function ArtModerationPage() {
  const { supabase } = await requireAdmin();
  const select = "id, title, description, image_path, thumb_path, status, created_at, owner_id, profiles!artworks_owner_id_fkey(nickname)";
  const [{ data: pending }, { data: reports }, { data: recent }] = await Promise.all([
    supabase.from("artworks").select(select).eq("status", "pending").order("created_at"),
    supabase.from("content_reports").select("id, reason, details, created_at, artwork_id, artworks(id, title, image_path, thumb_path, status, owner_id)").eq("status", "open").order("created_at"),
    supabase.from("artworks").select(select).eq("status", "approved").order("approved_at", { ascending: false }).limit(24),
  ]);
  const pend = (pending ?? []) as unknown as Art[];
  const rec = (recent ?? []) as unknown as Art[];
  const reps = (reports ?? []) as unknown as { id: string; reason: string; details: string | null; created_at: string; artwork_id: string; artworks: Art | null }[];
  const urls = await signPaths(supabase, "artwork", [
    ...pend.map((a) => a.image_path),
    ...reps.map((r) => r.artworks?.thumb_path ?? ""),
    ...rec.map((a) => a.thumb_path),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-2 text-4xl text-cobalt">Venter på godkendelse ({pend.length})</h1>
        <p className="mb-4 text-ink-soft">
          Afvis billeder med genkendelige ansigter, navne, adresser, skolelogoer, nummerplader eller andet, der kan identificere nogen – og alt ubehageligt.
        </p>
        {pend.length === 0 && <Notice>Alt er kigget igennem. 🎉</Notice>}
        <ul className="grid gap-5 md:grid-cols-2">
          {pend.map((a) => (
            <li key={a.id} className="sticker space-y-3 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
              {urls[a.image_path] && <img src={urls[a.image_path]} alt="" className="max-h-96 w-full rounded-xl bg-lavender-soft object-contain" />}
              <div>
                <p className="font-display text-xl text-cobalt">{a.title ?? "Uden titel"}</p>
                <p className="text-sm text-ink-soft">af {a.profiles?.nickname} · {fmtShortDate(a.created_at)}</p>
                {a.description && <p className="mt-1">{a.description}</p>}
              </div>
              <ActionForm action={moderateArtwork} hidden={{ artworkId: a.id }}>
                <input name="note" placeholder="Besked til barnet ved afvisning (venlig og kort)" className="rounded-xl border-2 border-cobalt/30 bg-paper px-3 py-2" />
                <div className="flex gap-2">
                  <SubmitButton name="status" value="approved">Godkend</SubmitButton>
                  <SubmitButton name="status" value="rejected" variant="danger">Afvis</SubmitButton>
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>

      <section id="anmeldelser">
        <h2 className="mb-4 text-3xl text-cobalt">Anmeldelser ({reps.length})</h2>
        {reps.length === 0 && <Notice>Ingen åbne anmeldelser.</Notice>}
        <ul className="space-y-3">
          {reps.map((r) => (
            <li key={r.id} className="sticker flex flex-wrap gap-4 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
              {r.artworks && urls[r.artworks.thumb_path] && <img src={urls[r.artworks.thumb_path]} alt="" className="size-28 rounded-xl object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{REASONS[r.reason]}</p>
                {r.details && <p>“{r.details}”</p>}
                <p className="text-sm text-ink-soft">{fmtShortDate(r.created_at)} · værk: {r.artworks?.title ?? "uden titel"} {r.artworks && <StatusPill status={r.artworks.status} />}</p>
              </div>
              <ActionForm action={resolveReport} hidden={{ reportId: r.id }}>
                <SubmitButton name="remove" value="yes" variant="danger" size="sm">Fjern værket</SubmitButton>
                <SubmitButton name="remove" value="no" variant="ghost" size="sm">Intet problem</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-3xl text-cobalt">Senest godkendt</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {rec.map((a) => (
            <li key={a.id} className="sticker space-y-2 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
              {urls[a.thumb_path] && <img src={urls[a.thumb_path]} alt="" className="aspect-square w-full rounded-xl object-cover" />}
              <p className="truncate text-sm">{a.title ?? "Uden titel"} · {a.profiles?.nickname}</p>
              <ActionForm action={moderateArtwork} hidden={{ artworkId: a.id, status: "removed", note: "Fjernet af WAK" }}>
                <SubmitButton variant="danger" size="sm">Fjern</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
