import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedItem, ReactionSummary } from "@/lib/types";
import { signPaths } from "@/lib/storage";

export const PAGE_SIZE = 18;

export async function reactionMap(supabase: SupabaseClient, ids: string[]) {
  const counts: Record<string, Record<string, number>> = {};
  const mine: Record<string, string | null> = {};
  if (ids.length === 0) return { counts, mine };
  const { data } = await supabase.rpc("reaction_summary", { p_ids: ids });
  for (const r of (data ?? []) as ReactionSummary[]) {
    (counts[r.artwork_id] ??= {})[r.emoji] = r.total;
    if (r.mine) mine[r.artwork_id] = r.emoji;
  }
  return { counts, mine };
}

export async function loadFeed(supabase: SupabaseClient, before?: string | null, artworkId?: string) {
  const { data, error } = await supabase.rpc("gallery_feed", {
    p_before: before ?? null,
    p_limit: artworkId ? 1 : PAGE_SIZE,
    p_artwork: artworkId ?? null,
  });
  const items = (error ? [] : (data ?? [])) as FeedItem[];
  const urls = await signPaths(supabase, "artwork", items.flatMap((i) => (artworkId ? [i.image_path] : [i.thumb_path])));
  const reactions = await reactionMap(supabase, items.map((i) => i.id));
  return { items, urls, ...reactions };
}
