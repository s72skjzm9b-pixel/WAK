import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveChild } from "@/lib/auth";
import { availability, coverUrls, EVENT_FIELDS, myRegistrations } from "@/lib/events";
import { PageTitle, EmptyState } from "@/components/ui/PageTitle";
import { DateSticker } from "@/components/ui/DateSticker";
import { StatusPill } from "@/components/ui/StatusPill";
import { Blob } from "@/components/ui/Blob";
import { IconPin, IconClock } from "@/components/ui/Icons";
import { fmtDate, fmtMonth, fmtTime } from "@/lib/format";
import { EventCard } from "./EventCard";
import type { WaktEvent } from "@/lib/types";

export const metadata: Metadata = { title: "WAKT" };

export default async function WaktPage() {
  const { supabase, profile } = await requireActiveChild();
  const { data } = await supabase
    .from("events")
    .select(EVENT_FIELDS)
    .in("status", ["published", "cancelled"])
    .gte("ends_at", new Date().toISOString())
    .order("starts_at");
  const events = (data ?? []) as WaktEvent[];
  const [spaces, covers, mine] = await Promise.all([
    availability(supabase, events.map((e) => e.id)),
    coverUrls(supabase, events),
    myRegistrations(supabase, profile.id),
  ]);

  const next = events.find((e) => e.status === "published");
  const rest = events.filter((e) => e.id !== next?.id);
  const months = new Map<string, WaktEvent[]>();
  for (const e of rest) {
    const m = fmtMonth(e.starts_at);
    months.set(m, [...(months.get(m) ?? []), e]);
  }

  return (
    <>
      <PageTitle kicker="weird art klub tur">WAKT</PageTitle>

      {!next && rest.length === 0 && (
        <EmptyState title="Ingen ture lige nu" sticker="mascot">Der kommer snart nye eventyr. Kig forbi igen!</EmptyState>
      )}

      {next && (
        <Link href={`/wakt/${next.id}`} className="relative mb-8 block overflow-hidden rounded-[2rem] border-[3px] border-cobalt bg-cobalt p-5 text-cream shadow-[4px_5px_0_0_var(--color-orange)]">
          <Blob className="absolute -right-16 -top-16 size-56 opacity-90" fill="fill-lavender" lobes={8} />
          {covers[next.cover_path ?? ""] && (
            // eslint-disable-next-line @next/next/no-img-element -- private signed URL
            <img src={covers[next.cover_path ?? ""]} alt="" className="relative mb-4 aspect-[16/9] w-full rounded-2xl border-[3px] border-cream object-cover" />
          )}
          <div className="relative flex items-start gap-4">
            <DateSticker iso={next.starts_at} />
            <div>
              <p className="font-hand text-xl text-orange">Næste WAKT</p>
              <h2 className="text-3xl leading-tight">{next.title}</h2>
              <p className="mt-2 flex items-center gap-1.5"><IconClock className="size-5" /> {fmtDate(next.starts_at)} kl. {fmtTime(next.starts_at)}</p>
              <p className="flex items-center gap-1.5"><IconPin className="size-5" /> {next.meeting_point}</p>
              <div className="mt-3">
                {mine[next.id] && ["pending_guardian", "confirmed", "waitlisted"].includes(mine[next.id].status) ? (
                  <StatusPill status={mine[next.id].status} />
                ) : (
                  <span className="inline-flex rounded-full bg-orange px-4 py-2 font-display text-lg font-semibold text-cobalt-deep">
                    Skal du med? →
                  </span>
                )}
              </div>
            </div>
          </div>
        </Link>
      )}

      {[...months.entries()].map(([month, list]) => (
        <section key={month} className="mb-6">
          <h2 className="mb-3 font-hand text-2xl capitalize text-cobalt">{month}</h2>
          <ul className="space-y-4">
            {list.map((e) => (
              <li key={e.id}>
                <EventCard ev={e} href={`/wakt/${e.id}`} cover={covers[e.cover_path ?? ""]} spacesLeft={spaces[e.id]?.spaces_left} myStatus={mine[e.id]?.status} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
