import Link from "next/link";
import { requireActiveChild } from "@/lib/auth";
import { BottomNav } from "@/components/ui/BottomNav";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";

export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireActiveChild();
  return (
    <div className="paper-grain min-h-dvh pb-28">
      <header className="sticky top-0 z-30 border-b-2 border-cobalt/10 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2.5">
          <Link href="/kunst" aria-label="WAK – til galleriet">
            <Logo variant="letters" className="w-20" />
          </Link>
          <Link href="/min-wak" className="flex items-center gap-2 rounded-full py-1 pl-3 pr-1 font-display font-semibold text-cobalt" aria-label="Min WAK">
            <span className="max-w-32 truncate">{profile.nickname}</span>
            <Avatar value={profile.avatar} size="sm" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-5">{children}</main>
      <BottomNav />
    </div>
  );
}
