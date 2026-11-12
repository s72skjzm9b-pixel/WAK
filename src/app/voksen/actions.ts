"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGuardian } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyError } from "@/lib/errors";
import { notifyRegistrationStatus } from "@/lib/events";
import type { ActionResult } from "@/lib/types";

const uuid = z.string().uuid();

export async function decideRegistration(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const reg = uuid.safeParse(formData.get("registrationId"));
  if (!reg.success) return { ok: false, error: "Ugyldig" };
  const approve = formData.get("decision") === "yes";
  const { supabase } = await requireGuardian();
  const { data, error } = await supabase.rpc("guardian_decide_registration", { p_reg: reg.data, p_approve: approve });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/voksen");
  const msg: Record<string, string> = {
    confirmed: "Tilmeldt! Barnet kan se det i appen.",
    waitlisted: "Turen er fuld – barnet er sat på venteliste.",
    declined: "Du har sagt nej.",
    expired: "Forespørgslen var udløbet.",
  };
  return { ok: true, message: msg[data as string] ?? "Gemt" };
}

export async function cancelRegistration(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const reg = uuid.safeParse(formData.get("registrationId"));
  if (!reg.success) return { ok: false, error: "Ugyldig" };
  const { supabase } = await requireGuardian();
  const { data, error } = await supabase.rpc("cancel_registration", { p_reg: reg.data });
  if (error) return { ok: false, error: friendlyError(error) };
  await notifyRegistrationStatus((data as string[]) ?? [], "confirmed");
  revalidatePath("/voksen");
  return { ok: true, message: "Tilmeldingen er afmeldt." };
}

export async function removeChildArtwork(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const art = uuid.safeParse(formData.get("artworkId"));
  if (!art.success) return { ok: false, error: "Ugyldig" };
  const { supabase } = await requireGuardian();
  const { error } = await supabase.rpc("guardian_remove_artwork", { p_artwork: art.data });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/voksen");
  revalidatePath("/kunst");
  return { ok: true, message: "Billedet er fjernet." };
}

export async function setConsent(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const child = uuid.safeParse(formData.get("childId"));
  const type = z.enum(["membership", "image_sharing"]).safeParse(formData.get("type"));
  if (!child.success || !type.success) return { ok: false, error: "Ugyldig" };
  const granted = formData.get("granted") === "true";
  const { supabase } = await requireGuardian();
  const { error } = await supabase.rpc("guardian_set_consent", { p_child: child.data, p_type: type.data, p_granted: granted });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/voksen");
  return { ok: true, message: "Samtykket er opdateret." };
}

export async function requestDeletion(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const kind = z.enum(["child_account", "guardian_account"]).safeParse(formData.get("kind"));
  const child = formData.get("childId");
  if (!kind.success) return { ok: false, error: "Ugyldig" };
  if (formData.get("confirm") !== "on") return { ok: false, error: "Sæt kryds for at bekræfte." };
  const { supabase } = await requireGuardian();
  const { error } = await supabase.rpc("guardian_request_deletion", {
    p_child: kind.data === "child_account" ? String(child) : null,
    p_kind: kind.data,
    p_note: String(formData.get("note") ?? "").slice(0, 500) || null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/voksen");
  return { ok: true, message: "Anmodningen er sendt. Kontoen er sat på pause, og WAK sletter data hurtigst muligt." };
}

/** Set a new password for your own child (kids forget). */
export async function resetChildPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const child = uuid.safeParse(formData.get("childId"));
  const password = String(formData.get("password") ?? "");
  if (!child.success) return { ok: false, error: "Ugyldig" };
  if (password.length < 8 || password.length > 72) return { ok: false, error: "Kodeordet skal være mindst 8 tegn." };
  const { supabase, profile } = await requireGuardian();
  // RLS: a guardian only sees their own links, so this proves the relationship.
  const { data: link } = await supabase.from("guardian_children").select("child_id").eq("guardian_id", profile.id).eq("child_id", child.data).maybeSingle();
  if (!link) return { ok: false, error: friendlyError("forbidden") };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(child.data, { password });
  if (error) return { ok: false, error: friendlyError(error) };
  await admin.from("audit_log").insert({ actor_id: profile.id, action: "child.password_reset", target_type: "profile", target_id: child.data });
  return { ok: true, message: "Nyt kodeord er sat. Giv det til dit barn." };
}
