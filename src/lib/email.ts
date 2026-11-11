import "server-only";
import { appendFile } from "node:fs/promises";
import { serverEnv } from "@/lib/env";

type Mail = { to: string; subject: string; text: string; html: string };

/**
 * Sends transactional email (no marketing, no tracking pixels).
 * - Production: Resend (set RESEND_API_KEY + EMAIL_FROM) – swap for any provider.
 * - Development: printed to the server log, and appended to WAK_DEV_OUTBOX
 *   (a .jsonl file) if set, so the flows can be tested without real email.
 */
export async function sendMail(mail: Mail) {
  const { resendApiKey, emailFrom } = serverEnv();
  if (resendApiKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: emailFrom, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) throw new Error(`Email failed: ${res.status}`);
    return;
  }
  if (process.env.NODE_ENV === "production" && !process.env.WAK_DEV_OUTBOX) {
    throw new Error("No email provider configured (RESEND_API_KEY)");
  }
  console.info(`\n[wak:mail] → ${mail.to}\n${mail.subject}\n${mail.text}\n`);
  if (process.env.WAK_DEV_OUTBOX) {
    await appendFile(process.env.WAK_DEV_OUTBOX, JSON.stringify({ ...mail, at: new Date().toISOString() }) + "\n");
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.5">${esc(p)}</p>`).join("");
  const button = cta
    ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#1015B9;color:#FFF7E9;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold;display:inline-block">${esc(cta.label)}</a></p><p style="font-size:13px;color:#555">Virker knappen ikke? Kopiér linket: ${esc(cta.url)}</p>`
    : "";
  const html = `<!doctype html><html lang="da"><body style="margin:0;background:#FFF7E9;font-family:Arial,sans-serif;color:#0B0F6B">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
  <p style="font-size:28px;font-weight:bold;color:#1015B9;margin:0 0 4px">W.A.K</p>
  <p style="font-size:12px;letter-spacing:3px;color:#1015B9;margin:0 0 24px">WEIRD, ART, KLUB</p>
  <h1 style="font-size:22px;margin:0 0 16px">${esc(title)}</h1>${body}${button}
  <p style="font-size:12px;color:#555;margin-top:32px">Du får denne mail, fordi din e-mail blev skrevet ind hos WAK – Weird Art Klub. Vi sender kun mails om dit barns medlemskab og ture.</p>
  </div></body></html>`;
  const text = [title, "", ...paragraphs, ...(cta ? ["", `${cta.label}: ${cta.url}`] : [])].join("\n");
  return { html, text };
}

export function consentRequestMail(to: string, nickname: string, url: string) {
  const { html, text } = layout(
    `${nickname} vil gerne være med i WAK`,
    [
      `Et barn har bedt om at blive medlem af WAK – Weird Art Klub og skrevet din e-mail som voksen.`,
      `WAK er en lukket kunstklub for børn på 10–13 år. Medlemmer kan dele billeder af kunst, reagere med emojis og tage med på kunstture (WAKT).`,
      `Før kontoen bliver åbnet, skal du læse hvad vi gemmer, og give dit samtykke. Derefter kigger en voksen fra WAK på ansøgningen.`,
      `Linket virker i 7 dage. Hvis du ikke kender til det, kan du bare ignorere mailen – så sker der ingenting, og vi sletter anmodningen.`,
    ],
    { label: "Se anmodningen", url },
  );
  return { to, subject: `${nickname} vil gerne være med i WAK`, html, text };
}

export function eventPermissionMail(to: string, nickname: string, eventTitle: string, when: string, url: string) {
  const { html, text } = layout(
    `${nickname} vil gerne med på tur!`,
    [`${nickname} har trykket "Jeg vil med!" til ${eventTitle} (${when}).`, `Læs om turen og svar ja eller nej på forældresiden.`],
    { label: "Svar på forespørgslen", url },
  );
  return { to, subject: `Spørg din voksen: ${eventTitle}`, html, text };
}

export function registrationResultMail(to: string, nickname: string, eventTitle: string, when: string, status: string, url: string) {
  const lines: Record<string, string> = {
    confirmed: `${nickname} er tilmeldt ${eventTitle} (${when}). Vi ses på tur!`,
    waitlisted: `${eventTitle} er fuld lige nu, så ${nickname} er på ventelisten. Vi skriver, hvis der bliver plads.`,
    cancelled: `Tilmeldingen af ${nickname} til ${eventTitle} (${when}) er aflyst.`,
  };
  const { html, text } = layout(lines[status] ? "Nyt om WAKT" : "WAKT", [lines[status] ?? `Status: ${status}`], {
    label: "Gå til forældresiden",
    url,
  });
  return { to, subject: `WAKT: ${eventTitle}`, html, text };
}
