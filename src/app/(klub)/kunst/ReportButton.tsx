"use client";
import { useActionState, useState } from "react";
import { reportArtwork } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { IconFlag } from "@/components/ui/Icons";
import type { ActionResult } from "@/lib/types";

const REASONS = [
  { id: "personal_info", label: "Der er navn, adresse, skole eller lignende på" },
  { id: "identifiable_person", label: "Man kan genkende en person" },
  { id: "unsafe", label: "Det er ubehageligt eller farligt" },
  { id: "mean", label: "Det er ondt eller drillende" },
  { id: "other", label: "Noget andet" },
];

export function ReportButton({ artworkId }: { artworkId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult | null, FormData>(reportArtwork, null);

  if (state?.ok) return <Notice tone="success">{state.message}</Notice>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 text-base font-semibold text-ink-soft underline">
        <IconFlag className="size-5" /> Sig det til en voksen fra WAK
      </button>
    );
  }
  return (
    <form action={action} className="sticker flex flex-col gap-3 p-4">
      <p className="font-display text-xl text-cobalt">Hvad er der galt?</p>
      <input type="hidden" name="artworkId" value={artworkId} />
      {REASONS.map((r) => (
        <label key={r.id} className="flex min-h-11 items-center gap-3 text-base">
          <input type="radio" name="reason" value={r.id} required className="size-5 accent-cobalt" />
          {r.label}
        </label>
      ))}
      <textarea name="details" maxLength={300} placeholder="Vil du fortælle mere? (frivilligt)" className="rounded-2xl border-2 border-cobalt/30 bg-paper p-3" />
      {state && !state.ok && <Notice tone="error">{state.error}</Notice>}
      <div className="flex gap-2">
        <SubmitButton variant="primary" size="sm">Send til WAK</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Fortryd</Button>
      </div>
    </form>
  );
}
