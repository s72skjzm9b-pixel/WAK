import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Registration, WaktEvent } from "@/lib/types";
import { signPaths } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { eventPermissionMail, registrationResultMail, sendMail } from "@/lib/email";
import { fmtDateTime } from "@/lib/format";

export const EVENT_FIELDS =
  "id, title, description, starts_at, ends_at, meeting_point, address, cover_path, organizer_name, organizer_email, organizer_phone, capacity, registration_deadline, practical_info, status";

export async function availability(supabase: SupabaseClient, ids: string[]) {
  const out: Record<string, { spaces_left: number; confirmed: number }> = {};
  if (!ids.length) return out;
  const { data } = await supabase.rpc("event_availability", { p_ids: ids });
  for (const r of (data ?? []) as { event_id: string; spaces_left: number; confirmed: number }[]) out[r.event_id] = r;
  return out;
}

export async function coverUrls(supabase: SupabaseClient, events: Pick<WaktEvent, "cover_path">[]) {
  return signPaths(supabase, "event-covers", events.map((e) => e.cover_path ?? "").filter(Boolean));
}

export const ACTIVE_REG = ["pending_guardian", "confirmed", "waitlisted"] as const;

/** Latest registration per event for one child (as seen through RLS). */
export async function myRegistrations(supabase: SupabaseClient, childId: string) {
  const { data } = await supabase
    .from("event_registrations")
    .select("id, event_id, child_id, status, requested_at, expires_at, confirmed_at")
    .eq("child_id", childId)
    .order("requested_at", { ascending: false });
  const byEvent: Record<string, Registration> = {};
  for (const r of (data ?? []) as Registration[]) byEvent[r.event_id] ??= r;
  return byEvent;
}

/**
 * Email every guardian of a child. Uses the service role ONLY to look up
 * guardian email addresses for a child id the caller has already been
 * authorised for (children can never read these addresses themselves).
 */
async function guardianEmailsFor(childId: string) {
  const admin = createAdminClient();
  const { data: links } = await admin.from("guardian_children").select("guardian_id").eq("child_id", childId);
  const ids = (links ?? []).map((l) => l.guardian_id);
  if (!ids.length) return [];
  const { data } = await admin.from("guardian_private").select("email").in("guardian_id", ids);
  return (data ?? []).map((g) => g.email as string);
}

export async function notifyGuardiansOfRequest(childId: string, nickname: string, ev: Pick<WaktEvent, "title" | "starts_at">) {
  for (const email of await guardianEmailsFor(childId)) {
    await sendMail(eventPermissionMail(email, nickname, ev.title, fmtDateTime(ev.starts_at), `${env.siteUrl}/voksen`)).catch(() => {});
  }
}

/** For registrations whose status changed (e.g. promoted from waitlist). */
export async function notifyRegistrationStatus(registrationIds: string[], status: string) {
  if (!registrationIds.length) return;
  const admin = createAdminClient();
  const { data } = await admin
    .from("event_registrations")
    .select("child_id, events(title, starts_at), profiles!event_registrations_child_id_fkey(nickname)")
    .in("id", registrationIds);
  for (const r of (data ?? []) as unknown as { child_id: string; events: { title: string; starts_at: string }; profiles: { nickname: string } }[]) {
    for (const email of await guardianEmailsFor(r.child_id)) {
      await sendMail(
        registrationResultMail(email, r.profiles.nickname, r.events.title, fmtDateTime(r.events.starts_at), status, `${env.siteUrl}/voksen`),
      ).catch(() => {});
    }
  }
}
