import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveChild } from "@/lib/auth";
import { loadFeed, PAGE_SIZE } from "@/lib/gallery";
import { PageTitle, EmptyState } from "@/components/ui/PageTitle";
import { ButtonLink } from "@/components/ui/Button";
import { ArtCard } from "@/components/ArtCard";

export const metadata: Metadata = { title: "Kunst" };

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
          {items.map((item, i) => (
            <li key={item.id}>
              <ArtCard
                index={i}
                href={`/kunst/${item.id}`}
                src={urls[item.thumb_path]}
                title={item.title}
                nickname={item.owner_nickname}
                avatar={item.owner_avatar}
                width={item.width}
                height={item.height}
                counts={counts[item.id] ?? {}}
              />
            </li>
          ))}
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
