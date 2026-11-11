import type { Metadata } from "next";
import { requireActiveChild } from "@/lib/auth";
import { availability, coverUrls, EVENT_FIELDS, myRegistrations } from "@/lib/events";
import { PageTitle, EmptyState } from "@/components/ui/PageTitle";
import { fmtMonth } from "@/lib/format";
import { EventCard } from "./EventCard";
import { NextWaktHero } from "./NextWaktHero";
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
        <NextWaktHero ev={next} cover={covers[next.cover_path ?? ""]} myStatus={mine[next.id]?.status} />
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
