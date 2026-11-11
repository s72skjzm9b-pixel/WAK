import Link from "next/link";
import { DateSticker } from "@/components/ui/DateSticker";
import { StatusPill } from "@/components/ui/StatusPill";
import { Blob } from "@/components/ui/Blob";
import { IconPin, IconClock } from "@/components/ui/Icons";
import { fmtDate, fmtTime } from "@/lib/format";
import type { RegistrationStatus, WaktEvent } from "@/lib/types";

export function NextWaktHero({ ev, cover, myStatus }: { ev: WaktEvent; cover?: string; myStatus?: RegistrationStatus }) {
  const active = myStatus && ["pending_guardian", "confirmed", "waitlisted"].includes(myStatus);
  return (
    <Link href={`/wakt/${ev.id}`} className="relative mb-8 block overflow-hidden rounded-[2rem] border-[3px] border-cobalt bg-cobalt p-5 text-cream shadow-[4px_5px_0_0_var(--color-orange)]">
      <Blob className="absolute -bottom-24 -right-24 size-52" fill="fill-cobalt-deep" lobes={8} />
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element -- private signed URL
        <img src={cover} alt="" className="relative mb-4 aspect-[16/9] w-full rounded-2xl border-[3px] border-cream object-cover" />
      )}
      <div className="relative flex items-start gap-4">
        <DateSticker iso={ev.starts_at} />
        <div>
          <p className="font-hand text-xl text-orange">Næste WAKT</p>
          <h2 className="text-3xl leading-tight">{ev.title}</h2>
          <p className="mt-2 flex items-center gap-1.5"><IconClock className="size-5" /> {fmtDate(ev.starts_at)} kl. {fmtTime(ev.starts_at)}</p>
          <p className="flex items-center gap-1.5"><IconPin className="size-5" /> {ev.meeting_point}</p>
          <div className="mt-3">
            {active ? (
              <StatusPill status={myStatus} />
            ) : (
              <span className="inline-flex rounded-full bg-orange px-4 py-2 font-display text-lg font-semibold text-cobalt-deep">Skal du med? →</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
