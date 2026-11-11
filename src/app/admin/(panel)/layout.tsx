import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

const NAV = [
  { href: "/admin", label: "Overblik" },
  { href: "/admin/medlemmer", label: "Medlemmer" },
  { href: "/admin/kunst", label: "Kunst" },
  { href: "/admin/wakt", label: "WAKT" },
  { href: "/admin/sletning", label: "Sletning" },
  { href: "/admin/log", label: "Log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-dvh bg-cream">
      <header className="bg-cobalt text-cream">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo variant="letters-cream" className="w-20" />
            <span className="rounded-full bg-orange px-3 py-1 text-sm font-semibold text-cobalt-deep">Admin</span>
          </div>
          <form action="/log-ud" method="post"><Button variant="cream" size="sm" type="submit">Log ud</Button></form>
        </div>
        <nav aria-label="Admin" className="mx-auto max-w-5xl overflow-x-auto px-4 pb-2">
          <ul className="flex gap-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="block whitespace-nowrap rounded-full px-4 py-2 font-display font-semibold hover:bg-cobalt-deep">{n.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
