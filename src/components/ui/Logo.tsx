import Image from "next/image";

type Variant = "badge" | "wordmark" | "wordmark-cream" | "letters" | "letters-cream";
const SRC: Record<Variant, { src: string; w: number; h: number }> = {
  badge: { src: "/brand/wak-badge.png", w: 1000, h: 1000 },
  wordmark: { src: "/brand/wak-wordmark.png", w: 410, h: 190 },
  "wordmark-cream": { src: "/brand/wak-wordmark-cream.png", w: 410, h: 190 },
  letters: { src: "/brand/wak-letters.png", w: 410, h: 120 },
  "letters-cream": { src: "/brand/wak-letters-cream.png", w: 410, h: 120 },
};

/** The supplied WAK logo assets (see design/README.md). */
export function Logo({ variant = "letters", className = "", priority = false }: { variant?: Variant; className?: string; priority?: boolean }) {
  const s = SRC[variant];
  return (
    <Image
      src={s.src}
      width={s.w}
      height={s.h}
      alt={variant === "badge" ? "W.A.K – Weird, Art, Klub" : "W.A.K"}
      className={className}
      priority={priority}
    />
  );
}

export function Sticker({ name, className = "", alt = "" }: { name: string; className?: string; alt?: string }) {
  return <Image src={`/brand/${name}.png`} width={220} height={180} alt={alt} aria-hidden={alt ? undefined : true} className={`h-auto ${className}`} />;
}
