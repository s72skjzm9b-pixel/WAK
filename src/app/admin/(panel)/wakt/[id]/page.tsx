import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { EVENT_FIELDS, coverUrls } from "@/lib/events";
import { toLocalInput, fmtShortDate } from "@/lib/format";
import { StatusPill } from "@/components/ui/StatusPill";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { Avatar } from "@/components/ui/Avatar";
import { ActionForm } from "../../ActionForm";
import { adminCancelRegistration, cancelEvent } from "../../actions";
import { EventForm } from "../EventForm";
import type { WaktEvent } from "@/lib/types";

export const metadata: Metadata = { title: "WAKT · Admin" };

const ORDER = ["confirmed", "waitlisted", "pending_guardian", "declined", "cancelled", "expired"];

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireAdmin();
  const { data: ev } = await supabase.from("events").select(EVENT_FIELDS).eq("id", id).maybeSingle<WaktEvent>();
  if (!ev) notFound();
  const covers = await coverUrls(supabase, [ev]);
  const { data: regsData } = await supabase.from("event_registrations")
    .select("id, child_id, status, requested_at, guardian_decided_at, profiles!event_registrations_child_id_fkey(nickname, avatar)")
    .eq("event_id", id);
  const regs = ((regsData ?? []) as unknown as { id: string; child_id: string; status: string; requested_at: string; profiles: { nickname: string; avatar: string } }[])
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const childIds = regs.map((r) => r.child_id);
  const { data: links } = await supabase.from("guardian_children").select("child_id, guardian_id").in("child_id", childIds);
  const { data: guardians } = await supabase.from("guardian_private").select("guardian_id, full_name, email, phone")
    .in("guardian_id", [...new Set((links ?? []).map((l) => l.guardian_id))]);
  const contactsFor = (child: string) => (links ?? []).filter((l) => l.child_id === child)
    .map((l) => (guardians ?? []).find((g) => g.guardian_id === l.guardian_id)).filter(Boolean);
  const confirmed = regs.filter((r) => r.status === "confirmed").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl text-cobalt">{ev.title}</h1>
        <StatusPill status={ev.status} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
      {covers[ev.cover_path ?? ""] && <img src={covers[ev.cover_path ?? ""]} alt="" className="aspect-[16/7] w-full rounded-3xl border-2 border-cobalt object-cover" />}

      <section>
        <h2 className="mb-3 text-3xl text-cobalt">Tilmeldinger · {confirmed}/{ev.capacity}</h2>
        <p className="mb-3 text-sm text-ink-soft">Kun administratorer kan se denne liste. Forældres kontaktinfo bruges kun til turen.</p>
        {regs.length === 0 ? <Notice>Ingen tilmeldinger endnu.</Notice> : (
          <ul className="divide-y-2 divide-cobalt/10 rounded-3xl border-2 border-cobalt bg-paper">
            {regs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                <Avatar value={r.profiles?.avatar} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.profiles?.nickname} <span className="text-sm font-normal text-ink-soft">· {fmtShortDate(r.requested_at)}</span></p>
                  {contactsFor(r.child_id).map((g) => (
                    <p key={g!.guardian_id} className="text-sm">{g!.full_name} · <a className="underline" href={`mailto:${g!.email}`}>{g!.email}</a>{g!.phone && <> · <a className="underline" href={`tel:${g!.phone}`}>{g!.phone}</a></>}</p>
                  ))}
                </div>
                <StatusPill status={r.status} context="registration-guardian" />
                {["pending_guardian", "confirmed", "waitlisted"].includes(r.status) && (
                  <ActionForm action={adminCancelRegistration} hidden={{ registrationId: r.id }}>
                    <SubmitButton variant="ghost" size="sm">Afmeld</SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-3xl text-cobalt">Ret tur</h2>
        <EventForm values={{
          id: ev.id, title: ev.title, description: ev.description, starts_at: toLocalInput(ev.starts_at), ends_at: toLocalInput(ev.ends_at),
          registration_deadline: toLocalInput(ev.registration_deadline), meeting_point: ev.meeting_point, address: ev.address ?? "",
          organizer_name: ev.organizer_name, organizer_email: ev.organizer_email ?? "", organizer_phone: ev.organizer_phone ?? "",
          capacity: ev.capacity, practical_info: ev.practical_info ?? "", status: ev.status === "cancelled" ? "draft" : ev.status,
        }} />
      </section>

      {ev.status !== "cancelled" && (
        <section className="rounded-3xl border-2 border-danger bg-paper p-5">
          <h2 className="mb-2 text-2xl text-danger">Aflys turen</h2>
          <p className="mb-3">Alle tilmeldinger bliver aflyst, og forældrene får en mail.</p>
          <ActionForm action={cancelEvent} hidden={{ eventId: ev.id }}>
            <SubmitButton variant="danger" className="self-start">Aflys WAKT</SubmitButton>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
