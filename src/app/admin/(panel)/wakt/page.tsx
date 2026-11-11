import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { availability, EVENT_FIELDS } from "@/lib/events";
import { ButtonLink } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { DateSticker } from "@/components/ui/DateSticker";
import { fmtDateTime } from "@/lib/format";
import type { WaktEvent } from "@/lib/types";

export const metadata: Metadata = { title: "WAKT · Admin" };

export default async function AdminEventsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("events").select(EVENT_FIELDS).order("starts_at", { ascending: false });
  const events = (data ?? []) as WaktEvent[];
  const spaces = await availability(supabase, events.map((e) => e.id));
  const { data: pend } = await supabase.from("event_registrations").select("event_id").eq("status", "pending_guardian");
  const pendingCount = (id: string) => (pend ?? []).filter((p) => p.event_id === id).length;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-4xl text-cobalt">WAKT</h1>
        <ButtonLink href="/admin/wakt/ny" variant="orange">+ Ny tur</ButtonLink>
      </div>
      <ul className="space-y-3">
        {events.map((e) => (
          <li key={e.id}>
            <Link href={`/admin/wakt/${e.id}`} className="sticker flex flex-wrap items-center gap-4 p-4">
              <DateSticker iso={e.starts_at} tone="lavender" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl text-cobalt">{e.title}</p>
                <p className="text-sm text-ink-soft">{fmtDateTime(e.starts_at)} · {e.meeting_point}</p>
              </div>
              <p className="font-semibold">{spaces[e.id]?.confirmed ?? 0}/{e.capacity} tilmeldt{pendingCount(e.id) ? ` · ${pendingCount(e.id)} venter på voksen` : ""}</p>
              <StatusPill status={e.status} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
