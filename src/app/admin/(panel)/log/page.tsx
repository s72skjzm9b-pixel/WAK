import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { fmtShortDate, fmtTime } from "@/lib/format";

export const metadata: Metadata = { title: "Log · Admin" };

export default async function AuditLogPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("audit_log").select("id, actor_id, action, target_type, target_id, details, created_at").order("created_at", { ascending: false }).limit(200);
  const actorIds = [...new Set((data ?? []).map((d) => d.actor_id).filter(Boolean))] as string[];
  const { data: actors } = await supabase.from("profiles").select("id, role, nickname").in("id", actorIds);
  const who = (id: string | null) => {
    if (!id) return "system";
    const a = (actors ?? []).find((x) => x.id === id);
    return a ? (a.role === "child" ? a.nickname : a.role) : "slettet";
  };
  return (
    <>
      <h1 className="mb-4 text-4xl text-cobalt">Handlingslog</h1>
      <div className="overflow-x-auto rounded-3xl border-2 border-cobalt bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="bg-lavender-soft"><tr><th className="p-2">Tid</th><th className="p-2">Hvem</th><th className="p-2">Handling</th><th className="p-2">Mål</th></tr></thead>
          <tbody>
            {(data ?? []).map((d) => (
              <tr key={d.id} className="border-t border-cobalt/10">
                <td className="whitespace-nowrap p-2">{fmtShortDate(d.created_at)} {fmtTime(d.created_at)}</td>
                <td className="p-2">{who(d.actor_id)}</td>
                <td className="p-2 font-mono">{d.action}</td>
                <td className="p-2 font-mono text-xs text-ink-soft">{d.target_type}:{String(d.target_id).slice(0, 8)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
