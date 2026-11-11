import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { ActionForm } from "../ActionForm";
import { processDeletion } from "../actions";
import { fmtShortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Sletning · Admin" };

export default async function DeletionPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("deletion_requests").select("id, kind, child_id, guardian_id, note, status, created_at, processed_at").order("created_at", { ascending: false }).limit(100);
  const reqs = data ?? [];
  const childIds = reqs.map((r) => r.child_id).filter(Boolean) as string[];
  const gIds = reqs.map((r) => r.guardian_id).filter(Boolean) as string[];
  const [{ data: kids }, { data: gs }] = await Promise.all([
    supabase.from("profiles").select("id, nickname").in("id", childIds),
    supabase.from("guardian_private").select("guardian_id, full_name, email").in("guardian_id", gIds),
  ]);
  const open = reqs.filter((r) => r.status === "open");
  return (
    <div className="space-y-6">
      <h1 className="text-4xl text-cobalt">Sletteanmodninger</h1>
      <Notice tone="warn">Sletning kan ikke fortrydes. Konto, billeder, reaktioner, tilmeldinger og samtykker slettes. Loggen beholder kun at sletningen skete.</Notice>
      {open.length === 0 && <Notice>Ingen åbne anmodninger.</Notice>}
      <ul className="space-y-3">
        {open.map((r) => {
          const g = (gs ?? []).find((x) => x.guardian_id === r.guardian_id);
          const k = (kids ?? []).find((x) => x.id === r.child_id);
          return (
            <li key={r.id} className="sticker flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <p className="font-display text-xl text-cobalt">{r.kind === "child_account" ? `Barn: ${k?.nickname ?? "?"}` : "Forælderkonto"}</p>
                <p className="text-sm">Anmodet af {g?.full_name} ({g?.email}) · {fmtShortDate(r.created_at)}</p>
                {r.note && <p className="text-sm">“{r.note}”</p>}
              </div>
              <ActionForm action={processDeletion} hidden={{ requestId: r.id }}>
                <div className="flex gap-2">
                  <SubmitButton name="decision" value="delete" variant="danger" size="sm">Slet nu</SubmitButton>
                  <SubmitButton name="decision" value="reject" variant="ghost" size="sm">Afvis</SubmitButton>
                </div>
              </ActionForm>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
