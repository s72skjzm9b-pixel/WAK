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
  const [{ data: reports }, { data: recent }] = await Promise.all([
    supabase.from("content_reports").select("id, reason, details, created_at, artwork_id, artworks(id, title, image_path, thumb_path, status, owner_id)").eq("status", "open").order("created_at"),
    supabase.from("artworks").select(select).eq("status", "approved").order("approved_at", { ascending: false }).limit(48),
  ]);
  const rec = (recent ?? []) as unknown as Art[];
  const reps = (reports ?? []) as unknown as { id: string; reason: string; details: string | null; created_at: string; artwork_id: string; artworks: Art | null }[];
  const urls = await signPaths(supabase, "artwork", [
    ...reps.map((r) => r.artworks?.image_path ?? ""),
    ...rec.map((a) => a.image_path),
  ]);

  return (
    <div className="space-y-10">
      <Notice title="Kunst vises med det samme">
        Børnenes billeder kommer i galleriet, så snart de er delt. Kig de nyeste igennem jævnligt, og fjern billeder med genkendelige
        ansigter, navne, adresser, skolelogoer, nummerplader eller andet, der kan identificere nogen – og alt ubehageligt.
        Ét anmeldt billede skjules automatisk, indtil du har taget stilling.
      </Notice>

      <section id="anmeldelser">
        <h1 className="mb-4 text-4xl text-cobalt">Anmeldelser ({reps.length})</h1>
        {reps.length === 0 && <Notice>Ingen åbne anmeldelser.</Notice>}
        <ul className="space-y-3">
          {reps.map((r) => (
            <li key={r.id} className="sticker flex flex-wrap gap-4 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
              {r.artworks && urls[r.artworks.image_path] && <img src={urls[r.artworks.image_path]} alt="" className="max-h-72 w-full max-w-xs rounded-xl bg-lavender-soft object-contain" />}
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
        <h2 className="mb-4 text-3xl text-cobalt">Nyeste i galleriet</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rec.map((a) => (
            <li key={a.id} className="sticker space-y-2 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
              {urls[a.image_path] && <img src={urls[a.image_path]} alt="" loading="lazy" className="aspect-square w-full rounded-xl bg-lavender-soft object-contain" />}
              <p className="truncate text-sm">{a.title ?? "Uden titel"} · {a.profiles?.nickname}</p>
              <p className="text-xs text-ink-soft">{fmtShortDate(a.created_at)}</p>
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
