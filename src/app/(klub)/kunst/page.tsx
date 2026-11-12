import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveChild } from "@/lib/auth";
import { loadFeed, PAGE_SIZE } from "@/lib/gallery";
import { PageTitle, EmptyState } from "@/components/ui/PageTitle";
import { ButtonLink } from "@/components/ui/Button";
import { IconCamera } from "@/components/ui/Icons";
import { ArtPost } from "@/components/ArtPost";
import { ReactionBar } from "./ReactionBar";

export const metadata: Metadata = { title: "Kunst" };

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ foer?: string }> }) {
  const { supabase } = await requireActiveChild();
  const { foer } = await searchParams;
  const before = foer && !Number.isNaN(Date.parse(foer)) ? foer : null;
  const { items, urls, counts, mine } = await loadFeed(supabase, before);

  return (
    <div className="mx-auto max-w-lg">
      <PageTitle
        kicker="nyeste fra klubben"
        action={
          <ButtonLink href="/upload" variant="orange" size="sm">
            <IconCamera className="size-5" /> Del kunst
          </ButtonLink>
        }
      >
        KUNST
      </PageTitle>

      {items.length === 0 ? (
        <EmptyState title={before ? "Ikke mere kunst" : "Galleriet er tomt… endnu!"}>
          {before ? <Link href="/kunst" className="underline">Tilbage til det nyeste</Link> : "Vær den første til at vise os noget weird."}
        </EmptyState>
      ) : (
        <ul className="space-y-6">
          {items.map((item, i) => (
            <li key={item.id}>
              <ArtPost
                href={`/kunst/${item.id}`}
                src={urls[item.image_path]}
                title={item.title}
                nickname={item.owner_nickname}
                avatar={item.owner_avatar}
                width={item.width}
                height={item.height}
                priority={i < 2}
              >
                <ReactionBar
                  artworkId={item.id}
                  initialCounts={counts[item.id] ?? {}}
                  initialMine={mine[item.id] ?? null}
                  readOnly={item.is_mine}
                  compact
                />
              </ArtPost>
            </li>
          ))}
        </ul>
      )}

      {items.length === PAGE_SIZE && (
        <div className="mt-6 flex justify-center">
          <ButtonLink href={`/kunst?foer=${encodeURIComponent(items[items.length - 1].approved_at)}`} variant="lavender">
            Vis ældre kunst
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
