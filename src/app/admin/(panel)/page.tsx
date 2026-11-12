import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { nowMs } from "@/lib/format";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  await supabase.rpc("event_availability", { p_ids: [] }); // warm
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [apps, art, reports, profiles, deletions, events] = await Promise.all([
    count(supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "child").eq("status", "pending_admin")),
    count(supabase.from("artworks").select("*", { count: "exact", head: true }).eq("status", "approved").gte("created_at", new Date(nowMs() - 86_400_000).toISOString())),
    count(supabase.from("content_reports").select("*", { count: "exact", head: true }).eq("status", "open")),
    count(supabase.from("profiles").select("*", { count: "exact", head: true }).or("pending_nickname.not.is.null,pending_bio.not.is.null")),
    count(supabase.from("deletion_requests").select("*", { count: "exact", head: true }).eq("status", "open")),
    count(supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "published").gte("starts_at", new Date().toISOString())),
  ]);
  const cards = [
    { href: "/admin/medlemmer", n: apps, label: "ansøgninger venter", urgent: apps > 0 },
    { href: "/admin/kunst", n: art, label: "nye værker (24 t)", urgent: false },
    { href: "/admin/kunst#anmeldelser", n: reports, label: "åbne anmeldelser", urgent: reports > 0 },
    { href: "/admin/medlemmer#profiler", n: profiles, label: "profilændringer", urgent: profiles > 0 },
    { href: "/admin/sletning", n: deletions, label: "sletteanmodninger", urgent: deletions > 0 },
    { href: "/admin/wakt", n: events, label: "kommende WAKT", urgent: false },
  ];
  return (
    <>
      <h1 className="mb-6 text-5xl text-cobalt">Overblik</h1>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <li key={c.label}>
            <Link href={c.href} className={`sticker block p-5 ${c.urgent ? "bg-orange" : ""}`}>
              <p className="font-display text-5xl font-bold text-cobalt">{c.n}</p>
              <p className="text-lg font-semibold">{c.label}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
