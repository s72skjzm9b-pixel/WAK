import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { EMOJIS } from "@/lib/avatars";

const TILT = ["-rotate-1", "rotate-1", "rotate-0", "-rotate-[0.5deg]", "rotate-[1.5deg]"];

export function ArtCard({ href, src, title, nickname, avatar, width, height, counts, index = 0 }: {
  href: string; src?: string; title: string | null; nickname: string; avatar: string; width: number; height: number;
  counts: Record<string, number>; index?: number;
}) {
  const top = EMOJIS.filter((e) => counts[e]).slice(0, 3);
  return (
    <div className={`mb-5 break-inside-avoid ${TILT[index % TILT.length]}`}>
      <Link href={href} className="sticker block overflow-hidden p-2 transition-transform hover:-translate-y-0.5">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL; must not go through a shared image cache
          <img src={src} alt={title ?? `Kunst af ${nickname}`} width={width} height={height} loading="lazy" className="h-auto w-full rounded-xl bg-lavender-soft" />
        ) : (
          <div className="aspect-square rounded-xl bg-lavender-soft" />
        )}
        <div className="flex items-center gap-2 px-1 pb-1 pt-2">
          <Avatar value={avatar} size="sm" />
          <div className="min-w-0 flex-1">
            {title && <p className="truncate font-display font-semibold leading-tight text-cobalt">{title}</p>}
            <p className="truncate text-sm text-ink-soft">{nickname}</p>
          </div>
          {top.length > 0 && <span className="text-sm" aria-label="reaktioner">{top.join("")}</span>}
        </div>
      </Link>
    </div>
  );
}
