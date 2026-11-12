"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { EMOJIS } from "@/lib/avatars";
import { friendlyError } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const uuid = z.string().uuid();

/** Set (or clear, with null) my emoji on an artwork. RLS enforces who may react. */
export async function setReaction(artworkId: string, emoji: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(artworkId).success) return { ok: false, error: "Ugyldigt værk" };
  if (emoji !== null && !(EMOJIS as readonly string[]).includes(emoji)) return { ok: false, error: "Ugyldig emoji" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Log ind igen" };
  const me = auth.user.id;

  if (emoji === null) {
    const { error } = await supabase.from("reactions").delete().eq("artwork_id", artworkId).eq("user_id", me);
    return error ? { ok: false, error: friendlyError(error) } : { ok: true };
  }
  const { data: updated, error: upErr } = await supabase
    .from("reactions").update({ emoji }).eq("artwork_id", artworkId).eq("user_id", me).select("artwork_id");
  if (upErr) return { ok: false, error: friendlyError(upErr) };
  if (!updated?.length) {
    const { error } = await supabase.from("reactions").insert({ artwork_id: artworkId, user_id: me, emoji });
    if (error) return { ok: false, error: friendlyError(error) };
  }
  return { ok: true };
}

const reportSchema = z.object({
  artworkId: uuid,
  reason: z.enum(["personal_info", "identifiable_person", "unsafe", "mean", "other"]),
  details: z.string().trim().max(300).optional(),
});

export async function reportArtwork(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = reportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Vælg hvorfor du anmelder." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Log ind igen" };
  const { error } = await supabase.from("content_reports").insert({
    artwork_id: parsed.data.artworkId,
    reporter_id: auth.user.id,
    reason: parsed.data.reason,
    details: parsed.data.details || null,
  });
  if (error && !error.message.includes("duplicate")) return { ok: false, error: friendlyError(error) };
  revalidatePath("/kunst");
  return { ok: true, message: "Tak! Værket er skjult, indtil en voksen fra WAK har kigget på det." };
}
