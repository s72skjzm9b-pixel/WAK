import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedItem, ReactionSummary } from "@/lib/types";
import { signPaths } from "@/lib/storage";

export const PAGE_SIZE = 12;

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
  // One big picture at a time in the feed, so sign the full image (max 1800px).
  const urls = await signPaths(supabase, "artwork", items.map((i) => i.image_path));
  const reactions = await reactionMap(supabase, items.map((i) => i.id));
  return { items, urls, ...reactions };
}

/** Newer / older neighbour in gallery order, for swiping between works. */
export async function loadNeighbors(supabase: SupabaseClient, artworkId: string) {
  const { data } = await supabase.rpc("gallery_neighbors", { p_artwork: artworkId });
  const row = (data as { newer: string | null; older: string | null }[] | null)?.[0];
  return { newer: row?.newer ?? null, older: row?.older ?? null };
}
