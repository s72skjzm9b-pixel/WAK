"use client";
import { useActionState } from "react";
import { childLogin, type LoginState } from "./actions";
import { Field, Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";

export function ChildLoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(childLogin, {});
  return (
    <form action={action} className="sticker flex flex-col gap-4 p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Brugernavn" htmlFor="username">
        <Input id="username" name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false} />
      </Field>
      <Field label="Kodeord" htmlFor="password">
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </Field>
      <SubmitButton size="lg" pendingLabel="Logger ind…">Log ind</SubmitButton>
    </form>
  );
}
