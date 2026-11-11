import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Signed URLs live for 15 minutes; pages are rendered per request. */
export const SIGNED_URL_TTL = 60 * 15;

/**
 * Creates short-lived URLs for private images, using the USER's client so the
 * storage policy decides whether they may see each file.
 */
export async function signPaths(supabase: SupabaseClient, bucket: string, paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {} as Record<string, string>;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, SIGNED_URL_TTL);
  if (error || !data) return {} as Record<string, string>;
  const out: Record<string, string> = {};
  for (const item of data) if (item.signedUrl && item.path) out[item.path] = item.signedUrl;
  return out;
}
