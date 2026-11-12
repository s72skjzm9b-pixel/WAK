import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveChild } from "@/lib/auth";
import { loadFeed, loadNeighbors } from "@/lib/gallery";
import { Avatar } from "@/components/ui/Avatar";
import { IconBack } from "@/components/ui/Icons";
import { ReactionBar } from "../ReactionBar";
import { ReportButton } from "../ReportButton";
import { fmtShortDate } from "@/lib/format";
import { SwipeArea } from "./SwipeArea";

export const metadata: Metadata = { title: "Kunst" };

export default async function ArtworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireActiveChild();
  const [{ items, urls, counts, mine }, { newer, older }] = await Promise.all([loadFeed(supabase, null, id), loadNeighbors(supabase, id)]);
  const item = items[0];
  if (!item) notFound();

  return (
    <SwipeArea key={item.id} className="-mx-4 -mt-5" newerHref={newer && `/kunst/${newer}`} olderHref={older && `/kunst/${older}`}>
    <article>
      {/* Full-screen-ish viewing area */}
      <div className="relative flex min-h-[55dvh] items-center justify-center bg-cobalt px-2 py-4">
        <Link href="/kunst" className="absolute left-3 top-3 z-10 flex size-12 items-center justify-center rounded-full bg-cream text-cobalt shadow-sticker-sm" aria-label="Tilbage til galleriet">
          <IconBack className="size-6" />
        </Link>
        {urls[item.image_path] && (
          // eslint-disable-next-line @next/next/no-img-element -- private signed URL
          <img
            src={urls[item.image_path]}
            alt={item.title ?? `Kunst af ${item.owner_nickname}`}
            width={item.width}
            height={item.height}
            draggable={false}
            className="art-protect max-h-[78dvh] w-auto max-w-full rounded-2xl border-4 border-cream object-contain"
          />
        )}
      </div>
      <div className="space-y-5 px-4 pt-5">
        <div className="flex items-center gap-3">
          <Avatar value={item.owner_avatar} size="md" />
          <div>
            <h1 className="text-3xl text-cobalt">{item.title ?? "Uden titel"}</h1>
            <p className="text-ink-soft">
              af <span className="font-semibold text-ink">{item.owner_nickname}</span> · {fmtShortDate(item.approved_at)}
            </p>
          </div>
        </div>
        {item.description && <p className="whitespace-pre-line text-lg">{item.description}</p>}
        <ReactionBar artworkId={item.id} initialCounts={counts[item.id] ?? {}} initialMine={mine[item.id] ?? null} readOnly={item.is_mine} />
        {item.is_mine ? <p className="text-sm text-ink-soft">Det er dit værk – de andre kan reagere på det.</p> : <ReportButton artworkId={item.id} />}
        {(newer || older) && <p className="text-center font-hand text-lg text-ink-soft">← swipe for at se mere kunst →</p>}
      </div>
    </article>
    </SwipeArea>
  );
}
