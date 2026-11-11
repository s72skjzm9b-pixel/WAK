import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveChild } from "@/lib/auth";
import { availability, coverUrls, EVENT_FIELDS, myRegistrations } from "@/lib/events";
import { DateSticker } from "@/components/ui/DateSticker";
import { Notice } from "@/components/ui/Notice";
import { IconBack, IconClock, IconPin, IconPeople } from "@/components/ui/Icons";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { JoinControls } from "../JoinControls";
import type { WaktEvent } from "@/lib/types";

export const metadata: Metadata = { title: "WAKT" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, profile } = await requireActiveChild();
  const { data: ev } = await supabase.from("events").select(EVENT_FIELDS).eq("id", id).maybeSingle<WaktEvent>();
  if (!ev) notFound();
  const [spaces, covers, mine] = await Promise.all([availability(supabase, [id]), coverUrls(supabase, [ev]), myRegistrations(supabase, profile.id)]);
  const reg = mine[id];
  const left = spaces[id]?.spaces_left ?? 0;
  const open = ev.status === "published" && new Date(ev.registration_deadline) > new Date();

  return (
    <article className="space-y-5">
      <Link href="/wakt" className="inline-flex min-h-11 items-center gap-2 font-display font-semibold text-cobalt">
        <IconBack className="size-5" /> Alle ture
      </Link>
      {covers[ev.cover_path ?? ""] && (
        // eslint-disable-next-line @next/next/no-img-element -- private signed URL
        <img src={covers[ev.cover_path ?? ""]} alt="" className="aspect-[16/9] w-full rounded-[2rem] border-[3px] border-cobalt object-cover shadow-sticker" />
      )}
      <header className="flex items-start gap-4">
        <DateSticker iso={ev.starts_at} />
        <div>
          <p className="font-hand text-xl text-orange">WAKT</p>
          <h1 className="text-4xl text-cobalt">{ev.title}</h1>
        </div>
      </header>
      {ev.status === "cancelled" && <Notice tone="warn" title="Turen er aflyst">Øv! Vi håber at se dig på en anden tur.</Notice>}

      <ul className="sticker space-y-2 p-4 text-lg">
        <li className="flex gap-2"><IconClock className="mt-0.5 size-6 shrink-0 text-orange" /> {fmtDate(ev.starts_at)}, kl. {fmtTime(ev.starts_at)}–{fmtTime(ev.ends_at)}</li>
        <li className="flex gap-2"><IconPin className="mt-0.5 size-6 shrink-0 text-orange" /> <span>{ev.meeting_point}{ev.address && <span className="block text-base text-ink-soft">{ev.address}</span>}</span></li>
        <li className="flex gap-2"><IconPeople className="mt-0.5 size-6 shrink-0 text-orange" /> {left > 0 ? `${left} ledige pladser ud af ${ev.capacity}` : `Fuld (${ev.capacity} pladser) – der er venteliste`}</li>
      </ul>

      {ev.status !== "cancelled" && (
        <JoinControls eventId={ev.id} registrationId={reg?.id} status={reg?.status} open={open} full={left <= 0} />
      )}

      {ev.description && <p className="whitespace-pre-line text-lg">{ev.description}</p>}
      {ev.practical_info && (
        <section className="rounded-[2rem] bg-lavender-soft p-5">
          <h2 className="mb-1 text-2xl text-cobalt">Godt at vide</h2>
          <p className="whitespace-pre-line">{ev.practical_info}</p>
        </section>
      )}
      <p className="text-ink-soft">Arrangør: {ev.organizer_name} · Tilmelding senest {fmtDateTime(ev.registration_deadline)}</p>
    </article>
  );
}
