import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";
import type { Profile } from "@/lib/types";

/** The signed-in user + their own profile row (read through RLS). */
export const getViewer = cache(async () => {
  // Always render per request – never prerender anything that depends on who is signed in.
  await connection();
  if (!isConfigured()) return null;
  const supabase = await createClient();
  // getUser() asks the Auth server, so a forged cookie is never trusted.
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, status, nickname, avatar, bio, pending_nickname, pending_bio")
    .eq("id", data.user.id)
    .maybeSingle<Profile>();
  return { user: data.user, profile, supabase };
});

export function homeFor(profile: Pick<Profile, "role" | "status"> | null | undefined) {
  if (!profile) return "/log-ind";
  if (profile.role === "admin") return "/admin";
  if (profile.role === "guardian") return "/voksen";
  return profile.status === "active" ? "/kunst" : "/venter";
}

/** Page guard for the children's club. UI convenience only – RLS is the real lock. */
export async function requireActiveChild() {
  const viewer = await getViewer();
  if (!viewer?.profile) redirect("/log-ind");
  if (viewer.profile.role !== "child") redirect(homeFor(viewer.profile));
  if (viewer.profile.status !== "active") redirect("/venter");
  return { ...viewer, profile: viewer.profile };
}

export async function requireGuardian() {
  const viewer = await getViewer();
  if (!viewer?.profile) redirect("/voksen/log-ind");
  if (viewer.profile.role !== "guardian" || viewer.profile.status !== "active") redirect(homeFor(viewer.profile));
  return { ...viewer, profile: viewer.profile };
}

export async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.profile) redirect("/admin/log-ind");
  if (viewer.profile.role !== "admin" || viewer.profile.status !== "active") redirect(homeFor(viewer.profile));
  return { ...viewer, profile: viewer.profile };
}
