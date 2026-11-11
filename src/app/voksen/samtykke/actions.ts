"use server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { friendlyError } from "@/lib/errors";

export type ConsentState = { done?: "approved" | "declined"; error?: string };

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

const approveSchema = z.object({
  token: z.string().min(20),
  fullName: z.string().trim().min(2, "Skriv dit navn").max(100),
  phone: z.string().trim().max(30).optional(),
  privacy: z.literal("on", { message: "Du skal have læst informationen" }),
  membership: z.literal("on", { message: "Samtykke til medlemskab mangler" }),
  imageSharing: z.literal("on").optional(),
});

export async function decideConsent(_prev: ConsentState, formData: FormData): Promise<ConsentState> {
  const admin = createAdminClient();
  const decision = formData.get("decision");
  const token = String(formData.get("token") ?? "");

  if (decision === "decline") {
    const { data: childId, error } = await admin.rpc("guardian_decline_application", { p_token_hash: hash(token) });
    if (error) return { error: friendlyError(error) };
    // Nothing is kept about a child whose guardian said no.
    await admin.auth.admin.deleteUser(childId as string);
    return { done: "declined" };
  }

  const parsed = approveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const { data: app } = await admin
    .from("membership_applications")
    .select("guardian_email, status, token_expires_at")
    .eq("token_hash", hash(d.token))
    .maybeSingle();
  if (!app || app.status !== "pending_guardian") return { error: friendlyError("invalid_token") };

  // Reuse the guardian account for siblings; otherwise create one. Clicking
  // the emailed link proves they own the address.
  let guardianId: string | undefined;
  const { data: existing } = await admin.from("guardian_private").select("guardian_id").eq("email", app.guardian_email).maybeSingle();
  if (existing) {
    guardianId = existing.guardian_id;
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: app.guardian_email,
      email_confirm: true,
      app_metadata: { wak_role: "guardian" },
    });
    if (error || !created.user) return { error: friendlyError("email_not_guardian") };
    guardianId = created.user.id;
  }

  const { error } = await admin.rpc("guardian_confirm_application", {
    p_token_hash: hash(d.token),
    p_guardian_id: guardianId,
    p_full_name: d.fullName,
    p_phone: d.phone ?? "",
    p_image_sharing: d.imageSharing === "on",
    p_policy_version: serverEnv().policyVersion,
  });
  if (error) return { error: friendlyError(error) };
  return { done: "approved" };
}
