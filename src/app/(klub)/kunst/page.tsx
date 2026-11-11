import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveChild } from "@/lib/auth";
import { loadFeed, PAGE_SIZE } from "@/lib/gallery";
import { PageTitle, EmptyState } from "@/components/ui/PageTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { EMOJIS } from "@/lib/avatars";

export const metadata: Metadata = { title: "Kunst" };

const TILT = ["-rotate-1", "rotate-1", "rotate-0", "-rotate-[0.5deg]", "rotate-[1.5deg]"];

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ foer?: string }> }) {
  const { supabase } = await requireActiveChild();
  const { foer } = await searchParams;
  const before = foer && !Number.isNaN(Date.parse(foer)) ? foer : null;
  const { items, urls, counts } = await loadFeed(supabase, before);

  return (
    <>
      <PageTitle kicker="nyeste fra klubben" action={<ButtonLink href="/upload" variant="orange" size="sm">+ Del kunst</ButtonLink>}>
        KUNST
      </PageTitle>

      {items.length === 0 ? (
        <EmptyState title={before ? "Ikke mere kunst" : "Galleriet er tomt… endnu!"}>
          {before ? <Link href="/kunst" className="underline">Tilbage til det nyeste</Link> : "Vær den første til at vise os noget weird."}
        </EmptyState>
      ) : (
        <ul className="columns-2 gap-4 sm:columns-3">
          {items.map((item, i) => {
            const c = counts[item.id] ?? {};
            const top = EMOJIS.filter((e) => c[e]).slice(0, 3);
            return (
              <li key={item.id} className={`mb-5 break-inside-avoid ${TILT[i % TILT.length]}`}>
                <Link href={`/kunst/${item.id}`} className="sticker block overflow-hidden p-2 transition-transform hover:-translate-y-0.5">
                  {urls[item.thumb_path] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL; must not go through a shared image cache
                    <img
                      src={urls[item.thumb_path]}
                      alt={item.title ?? `Kunst af ${item.owner_nickname}`}
                      width={item.width}
                      height={item.height}
                      loading="lazy"
                      className="w-full rounded-xl bg-lavender-soft"
                    />
                  ) : (
                    <div className="aspect-square rounded-xl bg-lavender-soft" />
                  )}
                  <div className="flex items-center gap-2 px-1 pb-1 pt-2">
                    <Avatar value={item.owner_avatar} size="sm" />
                    <div className="min-w-0 flex-1">
                      {item.title && <p className="truncate font-display font-semibold leading-tight text-cobalt">{item.title}</p>}
                      <p className="truncate text-sm text-ink-soft">{item.owner_nickname}</p>
                    </div>
                    {top.length > 0 && <span className="text-sm" aria-label="reaktioner">{top.join("")}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {items.length === PAGE_SIZE && (
        <div className="mt-4 flex justify-center">
          <ButtonLink href={`/kunst?foer=${encodeURIComponent(items[items.length - 1].approved_at)}`} variant="lavender">
            Vis ældre kunst
          </ButtonLink>
        </div>
      )}
    </>
  );
}
