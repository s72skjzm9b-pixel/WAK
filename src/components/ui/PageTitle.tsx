import type { ReactNode } from "react";
import { Burst } from "./Burst";

export function PageTitle({ kicker, children, action }: { kicker?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div>
        {kicker && <p className="font-hand text-xl text-orange -rotate-1">{kicker}</p>}
        <h1 className="flex items-center gap-1 text-4xl text-cobalt sm:text-5xl">
          <Burst className="size-7 shrink-0 text-orange" />
          <span>{children}</span>
        </h1>
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ title, children, sticker = "sticker-eyes" }: { title: string; children?: ReactNode; sticker?: string }) {
  return (
    <div className="sticker flex flex-col items-center gap-3 px-6 py-10 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static brand sticker */}
      <img src={`/brand/${sticker}.png`} alt="" className="h-20 w-auto animate-float" />
      <p className="font-display text-2xl text-cobalt">{title}</p>
      {children && <div className="max-w-sm text-ink-soft">{children}</div>}
    </div>
  );
}
