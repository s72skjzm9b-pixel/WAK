import type { Metadata } from "next";
import { connection } from "next/server";
import { PublicShell } from "@/components/shell/PublicShell";
import { JoinForm } from "./JoinForm";
import { isConfigured } from "@/lib/env";
import { Notice } from "@/components/ui/Notice";

export const metadata: Metadata = { title: "Bliv medlem" };

export default async function JoinPage() {
  await connection();
  return (
    <PublicShell>
      <p className="font-hand text-2xl text-orange">vil du være med?</p>
      <h1 className="mb-2 text-5xl text-cobalt">Bliv medlem</h1>
      <p className="mb-6 text-lg">WAK er kun for medlemmer. Din voksen skal sige ja, og så kigger WAK på det.</p>
      {isConfigured() ? <JoinForm /> : <Notice tone="warn" title="Ikke sat op endnu">Appen mangler forbindelse til databasen.</Notice>}
    </PublicShell>
  );
}
