import { dayNumber, monthShort } from "@/lib/format";

export function DateSticker({ iso, className = "", tone = "orange" }: { iso: string; className?: string; tone?: "orange" | "lavender" | "cobalt" }) {
  const tones = {
    orange: "bg-orange text-cobalt-deep",
    lavender: "bg-lavender text-cobalt",
    cobalt: "bg-cobalt text-cream",
  };
  return (
    <span className={`inline-flex w-16 shrink-0 -rotate-3 flex-col items-center rounded-2xl border-2 border-cobalt py-1.5 shadow-sticker-sm ${tones[tone]} ${className}`}>
      <span className="font-display text-2xl font-bold leading-none">{dayNumber(iso)}</span>
      <span className="text-sm font-semibold uppercase leading-tight">{monthShort(iso)}</span>
    </span>
  );
}
