"use client";
import { useActionState, useState } from "react";
import { requestMembership, type JoinState } from "./actions";
import { Field, Input, Checkbox } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { AvatarPicker } from "@/components/AvatarPicker";
import { Sticker } from "@/components/ui/Logo";

export function JoinForm() {
  const [state, action] = useActionState<JoinState, FormData>(requestMembership, { ok: false });
  const [avatar, setAvatar] = useState("can:lavender");
  const fe = state.fieldErrors ?? {};

  if (state.ok) {
    return (
      <div className="sticker flex flex-col items-center gap-3 p-8 text-center">
        <Sticker name="sticker-peace" className="h-24 w-auto motion-safe:animate-wiggle" />
        <h2 className="text-3xl text-cobalt">Sendt til din voksen!</h2>
        <p className="text-lg">Bed din voksen kigge i sin mail og sige ja. Derefter tjekker WAK din ansøgning.</p>
        <p className="text-ink-soft">Du kan logge ind og se, hvor langt den er nået.</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error && <Notice tone="error" title="Ups!">{state.error}</Notice>}

      <Field label="Dit kunstnernavn" htmlFor="nickname" hint="Det kan de andre se. Brug ikke dit rigtige navn." error={fe.nickname}>
        <Input id="nickname" name="nickname" required maxLength={24} autoComplete="off" placeholder="fx Blå Banan" />
      </Field>

      <div>
        <p className="mb-2 font-display text-lg font-semibold text-cobalt">Vælg din figur</p>
        <AvatarPicker value={avatar} onChange={setAvatar} />
        <input type="hidden" name="avatar" value={avatar} />
      </div>

      <Field label="Brugernavn (til at logge ind)" htmlFor="username" hint="Kun små bogstaver, tal og _" error={fe.username}>
        <Input id="username" name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false} />
      </Field>

      <Field label="Kodeord" htmlFor="password" hint="Mindst 8 tegn. Fortæl det kun til din voksen." error={fe.password}>
        <Input id="password" name="password" type="password" required autoComplete="new-password" minLength={8} />
      </Field>

      <Field label="Hvilket år er du født?" htmlFor="birthYear" hint="Kun WAK kan se det – aldrig de andre medlemmer." error={fe.birthYear}>
        <Input id="birthYear" name="birthYear" type="number" inputMode="numeric" required min={2000} max={2030} />
      </Field>

      <Field label="Din voksens e-mail" htmlFor="guardianEmail" hint="Din forælder eller værge skal sige ja, før du kan være med." error={fe.guardianEmail}>
        <Input id="guardianEmail" name="guardianEmail" type="email" required autoComplete="off" inputMode="email" />
      </Field>

      {/* Honeypot – hidden from people, bots fill it in */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <Checkbox name="askedGrownup" label="Jeg har spurgt min voksen, og de ved, at der kommer en mail." />
        {fe.askedGrownup && <p className="mt-1 text-sm font-semibold text-danger">{fe.askedGrownup}</p>}
      </div>

      <SubmitButton variant="orange" size="lg" pendingLabel="Sender…">
        Send til min voksen
      </SubmitButton>
    </form>
  );
}
