import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { Blob } from "@/components/ui/Blob";

/** Frame for the public pages (login, membership request, parent consent). */
export function PublicShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="paper-grain relative min-h-dvh overflow-hidden">
      <Blob className="pointer-events-none absolute -right-24 -top-24 size-72 opacity-90" fill="fill-lavender" lobes={8} />
      <Blob className="pointer-events-none absolute -bottom-28 -left-20 size-64 opacity-80" fill="fill-orange" lobes={7} wobble={0.09} />
      <div className={`relative mx-auto flex min-h-dvh flex-col px-4 py-6 ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <Link href="/" className="mb-6 block w-28 self-start" aria-label="Til forsiden">
          <Logo variant="letters" />
        </Link>
        <main className="flex-1">{children}</main>
        <footer className="mt-10 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
          <Link href="/privatliv" className="underline">Privatliv</Link>
          <Link href="/voksen/log-ind" className="underline">For voksne</Link>
          <Link href="/log-ind" className="underline">Log ind</Link>
        </footer>
      </div>
    </div>
  );
}
