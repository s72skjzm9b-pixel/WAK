"use client";
import { useActionState } from "react";
import { adminLogin, type LoginState } from "@/app/log-ind/actions";
import { Field, Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";

export function AdminLoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(adminLogin, {});
  return (
    <form action={action} className="sticker flex flex-col gap-4 p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" required autoComplete="username" /></Field>
      <Field label="Kodeord" htmlFor="password"><Input id="password" name="password" type="password" required autoComplete="current-password" /></Field>
      <SubmitButton size="lg">Log ind</SubmitButton>
    </form>
  );
}
