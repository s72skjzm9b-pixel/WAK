import type { ReactNode } from "react";

const tones = {
  info: "bg-lavender-soft border-cobalt text-ink",
  success: "bg-[#e3f5ea] border-success text-ink",
  error: "bg-[#fde8e5] border-danger text-ink",
  warn: "bg-[#fff0e3] border-orange text-ink",
};

export function Notice({ tone = "info", title, children }: { tone?: keyof typeof tones; title?: ReactNode; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-2xl border-2 px-4 py-3 ${tones[tone]}`}>
      {title && <p className="font-display text-lg font-semibold">{title}</p>}
      {children && <div className="text-base">{children}</div>}
    </div>
  );
}
