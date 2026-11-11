"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyError } from "@/lib/errors";
import { fromLocalInput } from "@/lib/format";
import { ImageError, processCoverImage } from "@/lib/images";
import { notifyRegistrationStatus } from "@/lib/events";
import type { ActionResult } from "@/lib/types";

// Every admin action re-checks the admin role on the server (requireAdmin)
// AND the database functions check it again (is_admin()).

const uuid = z.string().uuid();
const note = (fd: FormData) => String(fd.get("note") ?? "").trim().slice(0, 500) || null;
const done = (path: string, message = "Gemt"): ActionResult => { revalidatePath(path, "layout"); return { ok: true, message }; };

export async function decideMembership(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const child = uuid.safeParse(fd.get("childId"));
  if (!child.success) return { ok: false, error: "Ugyldig" };
  const { supabase } = await requireAdmin();
  const approve = fd.get("decision") === "approve";
  const { error } = await supabase.rpc("admin_decide_membership", { p_child: child.data, p_approve: approve, p_note: note(fd) });
  if (error) return { ok: false, error: friendlyError(error) };
  return done("/admin", approve ? "Godkendt – barnet kan logge ind." : "Afvist.");
}

export async function setMemberStatus(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const child = uuid.safeParse(fd.get("childId"));
  const status = z.enum(["active", "suspended"]).safeParse(fd.get("status"));
  if (!child.success || !status.success) return { ok: false, error: "Ugyldig" };
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_set_member_status", { p_child: child.data, p_status: status.data, p_note: note(fd) });
  if (error) return { ok: false, error: friendlyError(error) };
  return done("/admin", status.data === "active" ? "Genaktiveret." : "Suspenderet.");
}

export async function reviewProfile(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const child = uuid.safeParse(fd.get("childId"));
  if (!child.success) return { ok: false, error: "Ugyldig" };
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_review_profile", { p_child: child.data, p_approve: fd.get("decision") === "approve" });
  if (error) return { ok: false, error: friendlyError(error) };
  return done("/admin");
}

export async function moderateArtwork(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = uuid.safeParse(fd.get("artworkId"));
  const status = z.enum(["approved", "rejected", "removed"]).safeParse(fd.get("status"));
  if (!id.success || !status.success) return { ok: false, error: "Ugyldig" };
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_moderate_artwork", { p_artwork: id.data, p_status: status.data, p_note: note(fd) });
  if (error) return { ok: false, error: friendlyError(error) };
  return done("/admin", { approved: "Godkendt – nu i galleriet.", rejected: "Afvist.", removed: "Fjernet." }[status.data]);
}

export async function resolveReport(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = uuid.safeParse(fd.get("reportId"));
  if (!id.success) return { ok: false, error: "Ugyldig" };
  const remove = fd.get("remove") === "yes";
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_resolve_report", { p_report: id.data, p_status: remove ? "resolved" : "dismissed", p_remove_artwork: remove });
  if (error) return { ok: false, error: friendlyError(error) };
  return done("/admin");
}

// ---- Events ----------------------------------------------------------------
const eventSchema = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(4000).default(""),
  starts_at: z.string().min(10),
  ends_at: z.string().min(10),
  registration_deadline: z.string().min(10),
  meeting_point: z.string().trim().min(2).max(200),
  address: z.string().trim().max(200).optional(),
  organizer_name: z.string().trim().min(2).max(100),
  organizer_email: z.string().trim().max(200).optional(),
  organizer_phone: z.string().trim().max(40).optional(),
  capacity: z.coerce.number().int().min(1).max(500),
  practical_info: z.string().trim().max(2000).optional(),
  status: z.enum(["draft", "published"]),
});

export async function saveEvent(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase, profile } = await requireAdmin();
  const parsed = eventSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: `Tjek feltet: ${String(parsed.error.issues[0].path[0])}` };
  const d = parsed.data;
  const row = {
    title: d.title,
    description: d.description,
    starts_at: fromLocalInput(d.starts_at),
    ends_at: fromLocalInput(d.ends_at),
    registration_deadline: fromLocalInput(d.registration_deadline),
    meeting_point: d.meeting_point,
    address: d.address || null,
    organizer_name: d.organizer_name,
    organizer_email: d.organizer_email || null,
    organizer_phone: d.organizer_phone || null,
    capacity: d.capacity,
    practical_info: d.practical_info || null,
    status: d.status,
  };
  if (new Date(row.ends_at) <= new Date(row.starts_at)) return { ok: false, error: "Slut skal være efter start." };
  if (new Date(row.registration_deadline) > new Date(row.starts_at)) return { ok: false, error: "Tilmeldingsfristen skal være før turen starter." };

  const existingId = uuid.safeParse(fd.get("id"));
  let id: string;
  if (existingId.success) {
    const { error } = await supabase.from("events").update(row).eq("id", existingId.data);
    if (error) return { ok: false, error: friendlyError(error) };
    id = existingId.data;
  } else {
    const { data, error } = await supabase.from("events").insert({ ...row, created_by: profile.id }).select("id").single();
    if (error || !data) return { ok: false, error: friendlyError(error) };
    id = data.id;
  }

  const cover = fd.get("cover");
  if (cover instanceof File && cover.size > 0) {
    try {
      const img = await processCoverImage(Buffer.from(await cover.arrayBuffer()));
      const path = `${id}/${randomUUID()}.webp`;
      const { error: upErr } = await supabase.storage.from("event-covers").upload(path, img, { contentType: "image/webp" });
      if (upErr) return { ok: false, error: "Turen er gemt, men coverbilledet kunne ikke uploades." };
      const { data: old } = await supabase.from("events").select("cover_path").eq("id", id).single();
      await supabase.from("events").update({ cover_path: path }).eq("id", id);
      if (old?.cover_path) await supabase.storage.from("event-covers").remove([old.cover_path]);
    } catch (e) {
      return { ok: false, error: e instanceof ImageError ? "Coverbilledet kunne ikke læses." : friendlyError(e) };
    }
  }
  revalidatePath("/admin/wakt", "layout");
  if (!existingId.success) redirect(`/admin/wakt/${id}`);
  return { ok: true, message: "Turen er gemt." };
}

export async function cancelEvent(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = uuid.safeParse(fd.get("eventId"));
  if (!id.success) return { ok: false, error: "Ugyldig" };
  const { supabase } = await requireAdmin();
  const { data: regs } = await supabase.from("event_registrations").select("id").eq("event_id", id.data).in("status", ["pending_guardian", "confirmed", "waitlisted"]);
  const { error } = await supabase.rpc("admin_cancel_event", { p_event: id.data });
  if (error) return { ok: false, error: friendlyError(error) };
  await notifyRegistrationStatus((regs ?? []).map((r) => r.id), "cancelled");
  return done("/admin/wakt", "Turen er aflyst, og forældrene har fået besked.");
}

export async function adminCancelRegistration(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = uuid.safeParse(fd.get("registrationId"));
  if (!id.success) return { ok: false, error: "Ugyldig" };
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("cancel_registration", { p_reg: id.data });
  if (error) return { ok: false, error: friendlyError(error) };
  await notifyRegistrationStatus([id.data], "cancelled");
  await notifyRegistrationStatus((data as string[]) ?? [], "confirmed");
  return done("/admin/wakt", "Afmeldt.");
}

// ---- Deletion ----------------------------------------------------------------
export async function processDeletion(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = uuid.safeParse(fd.get("requestId"));
  if (!id.success) return { ok: false, error: "Ugyldig" };
  const { supabase } = await requireAdmin();
  const admin = createAdminClient();

  if (fd.get("decision") === "reject") {
    const { error } = await supabase.rpc("admin_mark_deletion", { p_request: id.data, p_status: "rejected" });
    return error ? { ok: false, error: friendlyError(error) } : done("/admin/sletning", "Afvist.");
  }

  const { data: req } = await supabase.from("deletion_requests").select("id, kind, child_id, guardian_id, status").eq("id", id.data).single();
  if (!req || req.status !== "open") return { ok: false, error: "Allerede behandlet." };
  const target = req.kind === "child_account" ? req.child_id : req.guardian_id;
  if (!target) return { ok: false, error: "Kontoen findes ikke længere." };

  if (req.kind === "guardian_account") {
    const { data: kids } = await admin.from("guardian_children").select("child_id").eq("guardian_id", target);
    for (const k of kids ?? []) {
      const { count } = await admin.from("guardian_children").select("*", { count: "exact", head: true }).eq("child_id", k.child_id);
      if ((count ?? 0) <= 1) return { ok: false, error: "Forælderen har et barn uden anden voksen. Slet barnets konto først." };
    }
  }

  const { error } = await supabase.rpc("admin_mark_deletion", { p_request: id.data, p_status: "completed" });
  if (error) return { ok: false, error: friendlyError(error) };

  if (req.kind === "child_account") {
    // Remove every image file in the child's private folder, then the login
    // (which cascades to profile, art rows, reactions, registrations, consents).
    const { data: files } = await admin.storage.from("artwork").list(target, { limit: 1000 });
    if (files?.length) await admin.storage.from("artwork").remove(files.map((f) => `${target}/${f.name}`));
  }
  const { error: delErr } = await admin.auth.admin.deleteUser(target);
  if (delErr) return { ok: false, error: "Markeret som slettet, men login kunne ikke slettes: " + delErr.message };
  return done("/admin/sletning", "Slettet.");
}
