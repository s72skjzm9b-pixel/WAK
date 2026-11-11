import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/shell/PublicShell";
import { ChildLoginForm } from "./ChildLoginForm";
import { getViewer, homeFor } from "@/lib/auth";
import { Sticker } from "@/components/ui/Logo";

export const metadata: Metadata = { title: "Log ind" };

export default async function LoginPage() {
  const viewer = await getViewer();
  if (viewer?.profile) redirect(homeFor(viewer.profile));
  return (
    <PublicShell>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="font-hand text-2xl text-orange">hej igen!</p>
          <h1 className="text-5xl text-cobalt">Log ind</h1>
        </div>
        <Sticker name="sticker-eyes" className="h-16 w-auto motion-safe:animate-float" />
      </div>
      <ChildLoginForm />
      <div className="mt-6 space-y-2 text-lg">
        <p>
          Ikke medlem endnu? <Link href="/bliv-medlem" className="font-semibold text-cobalt underline">Bliv medlem</Link>
        </p>
        <p>
          Glemt kodeord? Din voksen kan lave et nyt på <Link href="/voksen/log-ind" className="font-semibold text-cobalt underline">forældresiden</Link>.
        </p>
      </div>
    </PublicShell>
  );
}
