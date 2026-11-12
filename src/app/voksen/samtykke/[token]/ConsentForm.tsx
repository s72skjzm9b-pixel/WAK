"use client";
import { useActionState } from "react";
import { decideConsent, type ConsentState } from "../actions";
import { Field, Input, Checkbox } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { ButtonLink } from "@/components/ui/Button";

export function ConsentForm({ token, nickname }: { token: string; nickname: string }) {
  const [state, action] = useActionState<ConsentState, FormData>(decideConsent, {});

  if (state.done === "approved") {
    return (
      <div className="space-y-4">
        <Notice tone="success" title="Tak!">
          Dit samtykke er registreret. En voksen fra WAK kigger nu på ansøgningen – {nickname} kan logge ind, når den er godkendt.
        </Notice>
        <ButtonLink href="/voksen/log-ind">Gå til forældresiden</ButtonLink>
      </div>
    );
  }
  if (state.done === "declined") {
    return <Notice title="Anmodningen er slettet">Vi har slettet anmodningen og de oplysninger, barnet skrev. Der sker ikke mere.</Notice>;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Dit fulde navn" htmlFor="fullName" hint="Ses kun af WAK's administratorer.">
        <Input id="fullName" name="fullName" required autoComplete="name" />
      </Field>
      <Field label="Telefon (frivilligt)" htmlFor="phone" hint="Så arrangøren kan ringe på en tur.">
        <Input id="phone" name="phone" type="tel" autoComplete="tel" />
      </Field>
      <Checkbox name="privacy" required label={<>Jeg har læst <a href="/privatliv" target="_blank" className="font-semibold underline">hvordan WAK behandler data</a>.</>} />
      <Checkbox name="membership" required label={`Jeg er forælder/værge for ${nickname} og giver samtykke til, at ${nickname} bliver medlem af WAK.`} />
      <Checkbox
        name="imageSharing"
        label={`Jeg giver samtykke til, at ${nickname} må dele billeder af kunst i WAK's lukkede galleri. Billederne vises med det samme, og både du og WAK kan fjerne dem. Frivilligt – kan slås fra når som helst.`}
      />
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <SubmitButton name="decision" value="approve" size="lg" pendingLabel="Gemmer…">Ja, giv samtykke</SubmitButton>
        <SubmitButton name="decision" value="decline" variant="danger" size="lg" formNoValidate pendingLabel="Sletter…">
          Nej, slet anmodningen
        </SubmitButton>
      </div>
    </form>
  );
}
