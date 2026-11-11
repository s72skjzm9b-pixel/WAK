"use client";
import { useActionState, useState, type ReactNode } from "react";
import { cancelRegistration, decideRegistration, requestDeletion, resetChildPassword, setConsent } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Input, Checkbox, Textarea } from "@/components/ui/Field";
import type { ActionResult } from "@/lib/types";

function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? <Notice tone="success">{state.message}</Notice> : <Notice tone="error">{state.error}</Notice>;
}

export function DecideRegistration({ registrationId }: { registrationId: string }) {
  const [state, action] = useActionState(decideRegistration, null);
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="registrationId" value={registrationId} />
      <Result state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="yes" variant="primary">Ja, må gerne</SubmitButton>
        <SubmitButton name="decision" value="no" variant="ghost">Nej tak</SubmitButton>
      </div>
    </form>
  );
}

export function CancelRegistration({ registrationId }: { registrationId: string }) {
  const [state, action] = useActionState(cancelRegistration, null);
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action}>
      <input type="hidden" name="registrationId" value={registrationId} />
      <Result state={state} />
      <SubmitButton variant="ghost" size="sm">Afmeld</SubmitButton>
    </form>
  );
}

export function ConsentToggle({ childId, type, granted, label, description }: { childId: string; type: "membership" | "image_sharing"; granted: boolean; label: string; description: ReactNode }) {
  const [state, action] = useActionState(setConsent, null);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-2xl border-2 border-cobalt/20 bg-paper p-4">
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="granted" value={String(!granted)} />
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-lg font-semibold text-cobalt">{label}</p>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${granted ? "bg-[#d4f2e0] text-success" : "bg-cream text-ink-soft"}`}>
          {granted ? "Givet" : "Ikke givet"}
        </span>
      </div>
      <p className="text-sm text-ink-soft">{description}</p>
      <Result state={state} />
      <SubmitButton variant={granted ? "danger" : "primary"} size="sm" className="self-start">
        {granted ? "Træk samtykke tilbage" : "Giv samtykke"}
      </SubmitButton>
    </form>
  );
}

export function ResetPassword({ childId }: { childId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(resetChildPassword, null);
  if (!open) return <Button variant="lavender" size="sm" onClick={() => setOpen(true)}>Nyt kodeord til barnet</Button>;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="childId" value={childId} />
      <Input name="password" type="text" minLength={8} required placeholder="Nyt kodeord (mindst 8 tegn)" autoComplete="off" />
      <Result state={state} />
      <SubmitButton size="sm" className="self-start">Gem kodeord</SubmitButton>
    </form>
  );
}

export function DeletionRequest({ kind, childId, label }: { kind: "child_account" | "guardian_account"; childId?: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(requestDeletion, null);
  if (state?.ok) return <Result state={state} />;
  if (!open) return <Button variant="danger" size="sm" onClick={() => setOpen(true)}>{label}</Button>;
  return (
    <form action={action} className="flex flex-col gap-2 rounded-2xl border-2 border-danger bg-paper p-4">
      <input type="hidden" name="kind" value={kind} />
      {childId && <input type="hidden" name="childId" value={childId} />}
      <p className="font-semibold">
        {kind === "child_account"
          ? "Kontoen sættes på pause med det samme. Derefter sletter WAK login, billeder, reaktioner og tilmeldinger."
          : "WAK sletter din forælderkonto. Har du børn i WAK, skal deres konti også slettes eller overdrages til en anden voksen."}
      </p>
      <Textarea name="note" maxLength={500} placeholder="Besked til WAK (frivilligt)" />
      <Checkbox name="confirm" label="Ja, jeg vil have det slettet." />
      <Result state={state} />
      <div className="flex gap-2">
        <SubmitButton variant="danger" size="sm">Send anmodning</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Fortryd</Button>
      </div>
    </form>
  );
}
