"use client";
import { useActionState } from "react";
import { cancelMyRegistration, wantToJoin } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { Sticker } from "@/components/ui/Logo";
import type { ActionResult, RegistrationStatus } from "@/lib/types";

export function JoinControls({ eventId, registrationId, status, open, full }: {
  eventId: string; registrationId?: string; status?: RegistrationStatus; open: boolean; full: boolean;
}) {
  const [joinState, join] = useActionState<ActionResult | null, FormData>(wantToJoin, null);
  const [cancelState, cancel] = useActionState<ActionResult | null, FormData>(cancelMyRegistration, null);
  const error = (joinState && !joinState.ok && joinState.error) || (cancelState && !cancelState.ok && cancelState.error);

  const active = status && ["pending_guardian", "confirmed", "waitlisted"].includes(status);

  return (
    <div className="space-y-3">
      {error && <Notice tone="error">{error}</Notice>}

      {status === "confirmed" && (
        <div className="flex items-center gap-4 rounded-[2rem] border-[3px] border-cobalt bg-orange p-5 shadow-sticker">
          <Sticker name="sticker-peace" className="h-20 w-auto motion-safe:animate-wiggle" />
          <div>
            <p className="font-display text-3xl font-semibold text-cobalt-deep">Du er tilmeldt!</p>
            <p className="text-lg text-cobalt-deep">Vi ses på tur!</p>
          </div>
        </div>
      )}
      {status === "pending_guardian" && (
        <div className="rounded-[2rem] border-[3px] border-cobalt bg-lavender p-5 shadow-sticker">
          <p className="font-display text-3xl font-semibold text-cobalt">Spørg din voksen</p>
          <p className="text-lg">Vi har sendt en besked til din voksen. Når de siger ja, er du med (hvis der er plads).</p>
        </div>
      )}
      {status === "waitlisted" && (
        <div className="rounded-[2rem] border-[3px] border-cobalt bg-lavender-soft p-5">
          <p className="font-display text-2xl font-semibold text-cobalt">Du er på ventelisten</p>
          <p>Turen er fuld lige nu. Hvis der bliver plads, rykker du automatisk op.</p>
        </div>
      )}
      {status === "declined" && !active && <Notice>Din voksen sagde nej til den her tur.</Notice>}
      {status === "expired" && !active && <Notice>Din voksen nåede ikke at svare. Du kan spørge igen.</Notice>}

      {!active && open && (
        <form action={join}>
          <input type="hidden" name="eventId" value={eventId} />
          <SubmitButton variant="orange" size="lg" className="w-full text-2xl" pendingLabel="Spørger din voksen…">
            Jeg vil med!
          </SubmitButton>
          <p className="mt-2 text-center text-ink-soft">{full ? "Turen er fuld – du kommer på venteliste, hvis din voksen siger ja." : "Din voksen får en besked og skal sige ja."}</p>
        </form>
      )}
      {!active && !open && <Notice>Tilmeldingen er lukket.</Notice>}

      {active && registrationId && (
        <form action={cancel}>
          <input type="hidden" name="registrationId" value={registrationId} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="Afmelder…">Jeg kan alligevel ikke</SubmitButton>
        </form>
      )}
    </div>
  );
}
