import type { Metadata } from "next";
import { createHash } from "node:crypto";
import { PublicShell } from "@/components/shell/PublicShell";
import { Notice } from "@/components/ui/Notice";
import { Avatar } from "@/components/ui/Avatar";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConsentForm } from "./ConsentForm";

export const metadata: Metadata = { title: "Samtykke", referrer: "no-referrer" };

export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  // Look up by the hash only: the raw token is never stored.
  const { data: app } = await admin
    .from("membership_applications")
    .select("status, token_expires_at, guardian_email, child_id")
    .eq("token_hash", createHash("sha256").update(token).digest("hex"))
    .maybeSingle();

  const valid = app && app.status === "pending_guardian" && new Date(app.token_expires_at) > new Date();
  if (!valid) {
    return (
      <PublicShell>
        <h1 className="mb-4 text-4xl text-cobalt">Linket virker ikke</h1>
        <Notice>Linket er udløbet eller allerede brugt. Hvis barnet stadig vil være med, kan det sende en ny anmodning.</Notice>
      </PublicShell>
    );
  }
  const [{ data: child }, { data: priv }] = await Promise.all([
    admin.from("profiles").select("nickname, avatar").eq("id", app.child_id).single(),
    admin.from("child_private").select("username, birth_year").eq("child_id", app.child_id).single(),
  ]);

  return (
    <PublicShell wide>
      <p className="font-hand text-2xl text-orange">til forælder eller værge</p>
      <h1 className="mb-4 text-4xl text-cobalt sm:text-5xl">{child?.nickname} vil gerne være med i WAK</h1>

      <section className="sticker mb-6 flex items-center gap-4 p-4">
        <Avatar value={child?.avatar} size="lg" />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-lg">
          <dt className="text-ink-soft">Kunstnernavn</dt><dd className="font-semibold">{child?.nickname}</dd>
          <dt className="text-ink-soft">Brugernavn</dt><dd className="font-semibold">{priv?.username}</dd>
          <dt className="text-ink-soft">Fødselsår</dt><dd className="font-semibold">{priv?.birth_year}</dd>
          <dt className="text-ink-soft">Din e-mail</dt><dd className="font-semibold break-all">{app.guardian_email}</dd>
        </dl>
      </section>

      <section className="mb-6 space-y-3 text-lg">
        <h2 className="text-3xl text-cobalt">Hvad er WAK?</h2>
        <p>WAK – Weird Art Klub er en lukket, reklamefri kunstklub for børn på 10–13 år.</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Kun godkendte medlemmer kan se indhold. Ingen kan søge medlemmer frem, og der er ingen beskeder eller kommentarer.</li>
          <li>Andre medlemmer ser kun kunstnernavn, en tegnet figur og delt kunst – aldrig alder, rigtigt navn eller kontaktinfo.</li>
          <li>Alle billeder bliver set af en voksen fra WAK, før de vises. Placeringsdata fjernes fra billederne.</li>
          <li>Ture (WAKT) kræver altid dit ja – hver gang.</li>
          <li>Du kan trække samtykke tilbage og bede om sletning på forældresiden.</li>
        </ul>
      </section>

      <ConsentForm token={token} nickname={child?.nickname ?? "barnet"} />
    </PublicShell>
  );
}
