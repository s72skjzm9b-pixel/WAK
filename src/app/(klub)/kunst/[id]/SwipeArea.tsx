"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrow } from "@/components/ui/Icons";

const THRESHOLD = 70; // px the finger must travel sideways to change picture

/**
 * Swipe left for the next (older) work, right for the previous (newer) one.
 * Vertical scrolling stays native (touch-action: pan-y). Arrow buttons and the
 * keyboard's ← → keys do the same for people who don't swipe.
 */
export function SwipeArea({ newerHref, olderHref, className = "", children }: { newerHref: string | null; olderHref: string | null; className?: string; children: ReactNode }) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);

  useEffect(() => {
    if (newerHref) router.prefetch(newerHref);
    if (olderHref) router.prefetch(olderHref);
  }, [router, newerHref, olderHref]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.key === "ArrowLeft" && newerHref) router.push(newerHref);
      if (e.key === "ArrowRight" && olderHref) router.push(olderHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, newerHref, olderHref]);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, horizontal: null };
  }
  function onTouchMove(e: React.TouchEvent) {
    const s = start.current;
    if (!s) return;
    const mx = e.touches[0].clientX - s.x;
    const my = e.touches[0].clientY - s.y;
    if (s.horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) s.horizontal = Math.abs(mx) > Math.abs(my);
    if (!s.horizontal) return;
    setDragging(true);
    // resist at the ends of the gallery
    const blocked = (mx < 0 && !olderHref) || (mx > 0 && !newerHref);
    setDx(blocked ? mx / 4 : mx);
  }
  function onTouchEnd() {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s?.horizontal) return setDx(0);
    if (dx <= -THRESHOLD && olderHref) {
      setLeaving("left");
      router.push(olderHref);
    } else if (dx >= THRESHOLD && newerHref) {
      setLeaving("right");
      router.push(newerHref);
    } else {
      setDx(0);
    }
  }

  const offset = leaving === "left" ? "-110%" : leaving === "right" ? "110%" : `${dx}px`;
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ touchAction: "pan-y" }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div
        style={{ transform: `translateX(${offset})`, transition: dragging ? "none" : "transform 0.25s ease-out" }}
      >
        {children}
      </div>
      {newerHref && (
        <Link href={newerHref} className="absolute left-2 top-[27dvh] z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-cream/90 text-cobalt shadow-sticker-sm" aria-label="Forrige værk">
          <IconArrow className="size-6 rotate-180" />
        </Link>
      )}
      {olderHref && (
        <Link href={olderHref} className="absolute right-2 top-[27dvh] z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-cream/90 text-cobalt shadow-sticker-sm" aria-label="Næste værk">
          <IconArrow className="size-6" />
        </Link>
      )}
    </div>
  );
}
