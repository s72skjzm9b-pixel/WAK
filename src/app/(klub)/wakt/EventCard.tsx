import Link from "next/link";
import { DateSticker } from "@/components/ui/DateSticker";
import { StatusPill } from "@/components/ui/StatusPill";
import { IconPin, IconPeople, IconArrow } from "@/components/ui/Icons";
import { fmtTime } from "@/lib/format";
import type { RegistrationStatus, WaktEvent } from "@/lib/types";

export function EventCard({ ev, cover, spacesLeft, myStatus, href }: {
  ev: WaktEvent; cover?: string; spacesLeft?: number; myStatus?: RegistrationStatus; href: string;
}) {
  const showStatus = myStatus && ["pending_guardian", "confirmed", "waitlisted"].includes(myStatus);
  return (
    <Link href={href} className="sticker flex gap-3 p-3 transition-transform hover:-translate-y-0.5">
      <div className="relative">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- private signed URL
          <img src={cover} alt="" className="size-24 rounded-2xl border-2 border-cobalt object-cover" />
        ) : (
          <div className="flex size-24 items-center justify-center rounded-2xl border-2 border-cobalt bg-lavender">
            {/* eslint-disable-next-line @next/next/no-img-element -- brand sticker */}
            <img src="/brand/mascot.png" alt="" className="h-16 w-auto" />
          </div>
        )}
        <DateSticker iso={ev.starts_at} className="absolute -left-2 -top-2 scale-75" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-xl leading-tight text-cobalt">{ev.title}</h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-ink-soft">
          <IconPin className="size-4 shrink-0" /> <span className="truncate">{ev.meeting_point} · {fmtTime(ev.starts_at)}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {ev.status === "cancelled" ? (
            <StatusPill status="cancelled" />
          ) : showStatus ? (
            <StatusPill status={myStatus === "pending_guardian" ? "pending_guardian" : myStatus} />
          ) : spacesLeft !== undefined ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-lavender px-3 py-1 text-sm font-semibold text-cobalt">
              <IconPeople className="size-4" /> {spacesLeft > 0 ? `${spacesLeft} pladser` : "Fuld – venteliste"}
            </span>
          ) : null}
        </div>
      </div>
      <IconArrow className="size-6 self-center text-orange" />
    </Link>
  );
}
