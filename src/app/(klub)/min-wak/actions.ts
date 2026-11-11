"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveChild } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { AVATAR_PATTERN } from "@/lib/avatars";
import type { ActionResult } from "@/lib/types";

const profileSchema = z.object({
  avatar: z.string().regex(AVATAR_PATTERN),
  nickname: z.string().trim().min(2, "Mindst 2 tegn").max(24, "Højst 24 tegn")
    .refine((v) => !/@|\d{6,}|https?:/i.test(v), "Brug et kunstnernavn – ikke e-mail, telefon eller links"),
  bio: z.string().trim().max(140, "Højst 140 tegn")
    .refine((v) => !/@|\d{6,}|https?:/i.test(v), "Skriv ikke kontaktinfo eller links"),
});

export async function updateProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase } = await requireActiveChild();
  const { error } = await supabase.rpc("update_my_profile", {
    p_avatar: parsed.data.avatar,
    p_nickname: parsed.data.nickname,
    p_bio: parsed.data.bio,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Gemt! Nyt navn og tekst bliver vist, når WAK har kigget på dem." };
}

export async function deleteMyArtwork(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("artworkId"));
  if (!id.success) return;
  const { supabase, profile } = await requireActiveChild();
  const { data: art } = await supabase
    .from("artworks").select("image_path, thumb_path").eq("id", id.data).eq("owner_id", profile.id).maybeSingle();
  if (!art) return;
  await supabase.storage.from("artwork").remove([art.image_path, art.thumb_path]);
  await supabase.from("artworks").delete().eq("id", id.data).eq("owner_id", profile.id);
  revalidatePath("/min-wak");
}
