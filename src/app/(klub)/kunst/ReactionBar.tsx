"use client";
import { useState, useTransition } from "react";
import { setReaction } from "./actions";
import { EMOJIS } from "@/lib/avatars";

type Counts = Record<string, number>;

/** Emoji reactions instead of likes. One reaction per member; tap again to remove. */
export function ReactionBar({ artworkId, initialCounts, initialMine, readOnly = false, compact = false }: {
  artworkId: string; initialCounts: Counts; initialMine: string | null; readOnly?: boolean; compact?: boolean;
}) {
  const [counts, setCounts] = useState<Counts>(initialCounts);
  const [mine, setMine] = useState<string | null>(initialMine);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function choose(emoji: string) {
    if (readOnly) return;
    const prev = { counts, mine };
    const next = mine === emoji ? null : emoji;
    const c = { ...counts };
    if (mine) c[mine] = Math.max(0, (c[mine] ?? 1) - 1);
    if (next) c[next] = (c[next] ?? 0) + 1;
    setCounts(c);
    setMine(next);
    setError(null);
    startTransition(async () => {
      const res = await setReaction(artworkId, next);
      if (!res.ok) {
        setCounts(prev.counts);
        setMine(prev.mine);
        setError(res.error);
      }
    });
  }

  return (
    <div>
      <div role="group" aria-label="Reager med en emoji" className={compact ? "grid grid-cols-7 gap-1" : "flex flex-wrap gap-2"}>
        {EMOJIS.map((e) => {
          const on = mine === e;
          const n = counts[e] ?? 0;
          return (
            <button
              key={e}
              type="button"
              disabled={readOnly}
              onClick={() => choose(e)}
              aria-pressed={on}
              aria-label={`${e} ${n}`}
              className={`border-2 font-display font-semibold transition-transform active:scale-90 ${
                compact
                  ? "flex min-h-12 flex-col items-center justify-center rounded-2xl py-1 text-xl leading-none"
                  : "inline-flex min-h-12 items-center gap-1 rounded-full px-3.5 text-xl"
              } ${on ? "border-cobalt bg-lavender shadow-sticker-sm motion-safe:animate-pop" : n > 0 || !compact ? "border-cobalt/20 bg-paper" : "border-transparent bg-transparent opacity-60"} ${readOnly ? "cursor-default" : ""}`}
            >
              <span aria-hidden="true">{e}</span>
              {compact ? (
                <span className="mt-0.5 h-4 text-sm leading-4 text-cobalt">{n > 0 ? n : ""}</span>
              ) : (
                n > 0 && <span className="text-base text-cobalt">{n}</span>
              )}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-danger" role="alert">{error}</p>}
    </div>
  );
}
