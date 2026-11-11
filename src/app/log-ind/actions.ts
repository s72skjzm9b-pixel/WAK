"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env, serverEnv } from "@/lib/env";
import { homeFor } from "@/lib/auth";
import type { Profile } from "@/lib/types";

export type LoginState = { error?: string; sent?: boolean };

async function routeAfterLogin(userId: string): Promise<never> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("role, status").eq("id", userId).maybeSingle<Pick<Profile, "role" | "status">>();
  redirect(homeFor(data));
}

export async function childLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!/^[a-z0-9_]{3,20}$/.test(username) || !password) return { error: "Tjek dit brugernavn og kodeord." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${username}@${serverEnv().childLoginDomain}`,
    password,
  });
  if (error || !data.user) return { error: "Forkert brugernavn eller kodeord. Prøv igen – eller spørg din voksen." };
  return routeAfterLogin(data.user.id);
}

/** Parents/guardians log in with a one-time link sent to their email. */
export async function guardianLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Skriv en gyldig e-mail." };
  const supabase = await createClient();
  // shouldCreateUser:false → only existing guardian accounts get a link.
  // We show the same message either way so nobody can test which emails exist.
  await supabase.auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${env.siteUrl}/auth/callback?next=/voksen` },
  });
  return { sent: true };
}

export async function adminLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "Forkert e-mail eller kodeord." };
  return routeAfterLogin(data.user.id);
}
