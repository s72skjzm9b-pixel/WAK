"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ImageError, processArtworkImage } from "@/lib/images";
import { friendlyError } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const meta = z.object({
  title: z.string().trim().max(60, "Titlen må højst være 60 tegn").optional(),
  description: z.string().trim().max(300, "Højst 300 tegn").optional(),
});

const IMAGE_ERRORS: Record<string, string> = {
  too_big: "Billedet er for stort. Prøv et mindre billede.",
  not_image: "Det kunne vi ikke åbne som et billede. Prøv JPG eller PNG.",
  too_small: "Billedet er for lille.",
};

export async function uploadArtwork(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Log ind igen." };
  const me = auth.user.id;

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Vælg et billede først." };
  const parsed = meta.safeParse({ title: formData.get("title") || undefined, description: formData.get("description") || undefined });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  let processed;
  try {
    processed = await processArtworkImage(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return { ok: false, error: e instanceof ImageError ? IMAGE_ERRORS[e.message] : "Billedet kunne ikke behandles." };
  }

  // Upload as the child: storage policies check they are an active member
  // with image-sharing consent, and only allow their own folder.
  const key = randomUUID();
  const imagePath = `${me}/${key}.webp`;
  const thumbPath = `${me}/${key}_thumb.webp`;
  const bucket = supabase.storage.from("artwork");
  const up1 = await bucket.upload(imagePath, processed.image, { contentType: "image/webp", upsert: false });
  if (up1.error) return { ok: false, error: "Du kan ikke dele kunst lige nu. Spørg din voksen, om de har givet lov til billeddeling." };
  const up2 = await bucket.upload(thumbPath, processed.thumb, { contentType: "image/webp", upsert: false });
  if (up2.error) {
    await bucket.remove([imagePath]);
    return { ok: false, error: friendlyError(up2.error) };
  }

  const { error } = await supabase.from("artworks").insert({
    owner_id: me,
    title: parsed.data.title || null,
    description: parsed.data.description || null,
    image_path: imagePath,
    thumb_path: thumbPath,
    width: processed.width,
    height: processed.height,
  });
  if (error) {
    await bucket.remove([imagePath, thumbPath]);
    return { ok: false, error: friendlyError(error) };
  }
  revalidatePath("/min-wak");
  return { ok: true };
}
