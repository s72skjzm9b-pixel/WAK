import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";

/**
 * One artwork in the feed: who made it, the picture, the title and – below –
 * the emoji reactions it has received. One post per row, like a photo feed.
 */
export function ArtPost({ href, src, title, nickname, avatar, width, height, priority = false, children }: {
  href: string; src?: string; title: string | null; nickname: string; avatar: string; width: number; height: number;
  priority?: boolean; children?: ReactNode;
}) {
  return (
    <article className="sticker overflow-hidden">
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar value={avatar} size="sm" />
        <p className="min-w-0 truncate font-display font-semibold text-cobalt">{nickname}</p>
      </header>
      <Link href={href} className="block bg-lavender-soft" aria-label={`Se ${title ?? "værket"} af ${nickname}`}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL; must not go through a shared image cache
          <img
            src={src}
            alt={title ?? `Kunst af ${nickname}`}
            width={width}
            height={height}
            loading={priority ? "eager" : "lazy"}
            className="max-h-[75dvh] w-full object-contain"
          />
        ) : (
          <div className="aspect-square" />
        )}
      </Link>
      <div className="space-y-2 px-3 pb-3 pt-2.5">
        {title && <p className="font-display text-lg font-semibold leading-tight text-cobalt">{title}</p>}
        {children}
      </div>
    </article>
  );
}
