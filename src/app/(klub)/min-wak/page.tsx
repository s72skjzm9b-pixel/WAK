import type { Metadata } from "next";
import { requireActiveChild } from "@/lib/auth";
import { signPaths } from "@/lib/storage";
import Link from "next/link";
import { coverUrls, EVENT_FIELDS } from "@/lib/events";
import { nowMs } from "@/lib/format";
import { PageTitle, EmptyState } from "@/components/ui/PageTitle";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { EventCard } from "../wakt/EventCard";
import { ProfileEditor } from "./ProfileEditor";
import { deleteMyArtwork } from "./actions";
import type { Artwork, Registration, WaktEvent } from "@/lib/types";

export const metadata: Metadata = { title: "Min WAK" };

export default async function MyWakPage() {
  const { supabase, profile } = await requireActiveChild();
  const [{ data: arts }, { data: regs }] = await Promise.all([
    supabase.from("artworks").select("id, owner_id, title, description, image_path, thumb_path, width, height, status, moderation_note, created_at")
      .eq("owner_id", profile.id).order("created_at", { ascending: false }),
    supabase.from("event_registrations").select(`id, event_id, child_id, status, requested_at, expires_at, confirmed_at, events(${EVENT_FIELDS})`)
      .eq("child_id", profile.id).order("requested_at", { ascending: false }),
  ]);
  const artworks = (arts ?? []) as Artwork[];
  const thumbs = await signPaths(supabase, "artwork", artworks.map((a) => a.thumb_path));
  const registrations = ((regs ?? []) as unknown as (Registration & { events: WaktEvent | null })[]).filter((r): r is Registration & { events: WaktEvent } => Boolean(r.events));
  const now = nowMs();
  const seen = new Set<string>();
  const latest = registrations.filter((r) => (seen.has(r.event_id) ? false : (seen.add(r.event_id), true)));
  const upcoming = latest.filter((r) => new Date(r.events.ends_at).getTime() >= now && ["pending_guardian", "confirmed", "waitlisted"].includes(r.status));
  const previous = latest.filter((r) => new Date(r.events.ends_at).getTime() < now && r.status === "confirmed");
  const covers = await coverUrls(supabase, latest.map((r) => r.events));

  return (
    <>
      <PageTitle kicker="det er dig!">MIN WAK</PageTitle>

      <section className="sticker relative mb-8 flex flex-col items-center gap-3 overflow-hidden bg-lavender p-6 text-center">
        <Avatar value={profile.avatar} size="xl" className="bg-cream" />
        <h2 className="text-4xl text-cobalt">{profile.nickname}</h2>
        {profile.bio && <p className="max-w-sm text-lg">{profile.bio}</p>}
        {(profile.pending_nickname || profile.pending_bio) && (
          <p className="rounded-full bg-cream px-3 py-1 text-sm">WAK kigger på dine ændringer</p>
        )}
        <ProfileEditor avatar={profile.avatar} nickname={profile.pending_nickname ?? profile.nickname ?? ""} bio={profile.pending_bio ?? profile.bio ?? ""} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-3xl text-cobalt">Mine værker</h2>
        {artworks.length === 0 ? (
          <EmptyState title="Ingen værker endnu" sticker="sticker-can">
            <ButtonLink href="/upload" variant="orange" size="sm" className="mt-2">Del din første</ButtonLink>
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {artworks.map((a) => (
              <li key={a.id} className="sticker flex flex-col gap-2 p-2">
                {thumbs[a.thumb_path] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private signed URL
                  <img src={thumbs[a.thumb_path]} alt={a.title ?? "Mit værk"} className="aspect-square w-full rounded-xl object-cover" />
                ) : (
                  <div className="aspect-square rounded-xl bg-lavender-soft" />
                )}
                <p className="truncate px-1 font-display font-semibold text-cobalt">{a.title ?? "Uden titel"}</p>
                <StatusPill status={a.status} className="self-start" />
                {a.status === "rejected" && a.moderation_note && <p className="px-1 text-sm text-ink-soft">{a.moderation_note}</p>}
                <form action={deleteMyArtwork} className="px-1">
                  <input type="hidden" name="artworkId" value={a.id} />
                  <button type="submit" className="min-h-10 text-sm font-semibold text-danger underline">Slet</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-3xl text-cobalt">Mine ture</h2>
        {upcoming.length === 0 ? (
          <Notice>Du er ikke tilmeldt nogen ture. <Link href="/wakt" className="font-semibold underline">Se WAKT</Link></Notice>
        ) : (
          <ul className="space-y-4">
            {upcoming.map((r) => (
              <li key={r.id}><EventCard ev={r.events} href={`/wakt/${r.event_id}`} cover={covers[r.events.cover_path ?? ""]} myStatus={r.status} /></li>
            ))}
          </ul>
        )}
        {previous.length > 0 && (
          <>
            <h3 className="mb-2 mt-6 font-hand text-2xl text-cobalt">Tidligere ture</h3>
            <ul className="space-y-3 opacity-80">
              {previous.map((r) => (
                <li key={r.id}><EventCard ev={r.events} href={`/wakt/${r.event_id}`} cover={covers[r.events.cover_path ?? ""]} /></li>
              ))}
            </ul>
          </>
        )}
      </section>

      <form action="/log-ud" method="post" className="mb-6 flex justify-center">
        <Button type="submit" variant="ghost">Log ud</Button>
      </form>
    </>
  );
}
