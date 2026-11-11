// Database functions raise short codes; this turns them into friendly Danish.
const MESSAGES: Record<string, string> = {
  forbidden: "Det har du ikke adgang til.",
  not_found: "Vi kunne ikke finde det.",
  already_registered: "Du har allerede sagt, at du vil med.",
  already_handled: "Det er allerede klaret.",
  deadline_passed: "Tilmeldingen er lukket for den her tur.",
  event_closed: "Turen er lukket eller aflyst.",
  too_many_pending: "Der venter allerede for mange ansøgninger på denne voksen-mail.",
  invalid_token: "Linket virker ikke. Måske er det allerede brugt?",
  token_expired: "Linket er udløbet. Barnet kan sende en ny anmodning.",
  email_not_guardian: "Den e-mail bruges allerede til en anden slags konto.",
  missing_consent: "Der mangler samtykke fra en voksen.",
  not_pending_admin: "Ansøgningen venter ikke på WAK lige nu.",
  invalid_status: "Ugyldig status.",
  already_requested: "Anmodningen er allerede sendt.",
};

export function friendlyError(err: unknown, fallback = "Ups! Noget gik galt. Prøv igen om lidt.") {
  const msg = typeof err === "string" ? err : (err as { message?: string } | null)?.message ?? "";
  for (const [code, text] of Object.entries(MESSAGES)) {
    if (msg === code || msg.includes(code)) return text;
  }
  if (process.env.NODE_ENV !== "production" && msg) console.error("[wak]", msg);
  return fallback;
}
