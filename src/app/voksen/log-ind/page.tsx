import type { Metadata } from "next";
import { PublicShell } from "@/components/shell/PublicShell";
import { Notice } from "@/components/ui/Notice";
import { GuardianLoginForm } from "./GuardianLoginForm";

export const metadata: Metadata = { title: "Forældreside – log ind" };

export default async function GuardianLoginPage({ searchParams }: { searchParams: Promise<{ fejl?: string }> }) {
  const { fejl } = await searchParams;
  return (
    <PublicShell>
      <p className="font-hand text-2xl text-orange">for forældre og værger</p>
      <h1 className="mb-2 text-5xl text-cobalt">Forældreside</h1>
      <p className="mb-5 text-lg">Her godkender du ture, ser dit barns konto og styrer samtykker. Du logger ind med et link på mail – ingen kodeord.</p>
      {fejl && <div className="mb-4"><Notice tone="error">Linket virkede ikke eller er udløbet. Bed om et nyt.</Notice></div>}
      <GuardianLoginForm />
    </PublicShell>
  );
}
