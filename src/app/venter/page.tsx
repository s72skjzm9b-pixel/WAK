import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer, homeFor } from "@/lib/auth";
import { PublicShell } from "@/components/shell/PublicShell";
import { Sticker } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Venter" };

const TEXT = {
  pending_guardian: { kicker: "næsten…", title: "Vi venter på din voksen", body: "Din voksen har fået en mail fra WAK. Når de har sagt ja, kigger WAK på din ansøgning.", sticker: "sticker-eyes" },
  pending_admin: { kicker: "så tæt på!", title: "WAK kigger på det", body: "Din voksen har sagt ja. Nu tjekker en voksen fra WAK din ansøgning. Kig forbi igen snart!", sticker: "sticker-star" },
  suspended: { kicker: "pause", title: "Din konto er sat på pause", body: "Du kan ikke bruge WAK lige nu. Snak med din voksen, hvis du er i tvivl om hvorfor.", sticker: "sticker-can" },
  rejected: { kicker: "øv", title: "Det blev et nej denne gang", body: "Din ansøgning blev ikke godkendt. Din voksen kan kontakte WAK, hvis I har spørgsmål.", sticker: "sticker-can" },
} as const;

export default async function WaitingPage() {
  const viewer = await getViewer();
  if (!viewer?.profile) redirect("/log-ind");
  if (viewer.profile.role !== "child" || viewer.profile.status === "active") redirect(homeFor(viewer.profile));
  const t = TEXT[viewer.profile.status as keyof typeof TEXT];
  return (
    <PublicShell>
      <div className="sticker flex flex-col items-center gap-3 p-8 text-center">
        <Sticker name={t.sticker} className="h-24 w-auto motion-safe:animate-float" />
        <p className="font-hand text-2xl text-orange">{t.kicker}</p>
        <h1 className="text-4xl text-cobalt">{t.title}</h1>
        <p className="text-lg">{t.body}</p>
        <form action="/log-ud" method="post" className="mt-2">
          <Button variant="ghost" type="submit">Log ud</Button>
        </form>
      </div>
    </PublicShell>
  );
}
