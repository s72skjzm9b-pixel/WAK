"use client";
import { useActionState } from "react";
import { guardianLogin, type LoginState } from "@/app/log-ind/actions";
import { Field, Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";

export function GuardianLoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(guardianLogin, {});
  if (state.sent) {
    return (
      <Notice tone="success" title="Tjek din mail">
        Hvis e-mailen hører til en forælderkonto i WAK, har vi sendt et login-link. Linket virker kort tid.
      </Notice>
    );
  }
  return (
    <form action={action} className="sticker flex flex-col gap-4 p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Din e-mail" htmlFor="email" hint="Den e-mail, som WAK-anmodningen blev sendt til.">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <SubmitButton size="lg" pendingLabel="Sender…">Send login-link</SubmitButton>
    </form>
  );
}
