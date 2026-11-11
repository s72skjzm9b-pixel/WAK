"use client";
import Image from "next/image";
import { AVATAR_COLORS, AVATAR_STICKERS, parseAvatar } from "@/lib/avatars";

/** Pick an illustrated avatar: a sticker + a background colour. */
export function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { sticker, color } = parseAvatar(value);
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Figur" className="grid grid-cols-6 gap-2">
        {AVATAR_STICKERS.map((s) => {
          const on = s.id === sticker.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={s.label}
              onClick={() => onChange(`${s.id}:${color.id}`)}
              className={`flex aspect-square items-center justify-center rounded-2xl border-[2.5px] p-1 transition-transform ${
                on ? `border-cobalt ${color.className} scale-105 shadow-sticker-sm` : "border-cobalt/25 bg-paper"
              }`}
            >
              <Image src={s.src} alt="" width={80} height={80} className="h-full w-full object-contain" />
            </button>
          );
        })}
      </div>
      <div role="radiogroup" aria-label="Farve" className="flex gap-3">
        {AVATAR_COLORS.map((c) => {
          const on = c.id === color.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.label}
              onClick={() => onChange(`${sticker.id}:${c.id}`)}
              className={`size-11 rounded-full border-[2.5px] border-cobalt ${c.className} ${on ? "ring-4 ring-orange ring-offset-2 ring-offset-cream" : ""}`}
            />
          );
        })}
      </div>
    </div>
  );
}
