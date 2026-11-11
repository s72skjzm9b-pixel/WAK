"use server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, serverEnv } from "@/lib/env";
import { consentRequestMail, sendMail } from "@/lib/email";
import { friendlyError } from "@/lib/errors";
import { AVATAR_PATTERN } from "@/lib/avatars";

export type JoinState = { ok: boolean; error?: string; fieldErrors?: Record<string, string> };

const thisYear = new Date().getFullYear();
const schema = z.object({
  nickname: z.string().trim().min(2, "Mindst 2 tegn").max(24, "Højst 24 tegn")
    .refine((v) => !/@|\d{6,}|https?:/i.test(v), "Brug et kunstnernavn – ikke e-mail, telefon eller links"),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/, "3–20 tegn: a–z, 0–9 og _"),
  password: z.string().min(8, "Mindst 8 tegn").max(72),
  birthYear: z.coerce.number().int().min(thisYear - 14, "WAK er for 10–13 år").max(thisYear - 9, "WAK er for 10–13 år"),
  guardianEmail: z.string().trim().toLowerCase().email("Skriv en rigtig e-mail"),
  avatar: z.string().regex(AVATAR_PATTERN),
  askedGrownup: z.literal("on", { message: "Spørg din voksen først" }),
  website: z.string().max(0).optional(), // honeypot: real people leave it empty
});

export async function requestMembership(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    if (fieldErrors.website) return { ok: true }; // silently drop bots
    return { ok: false, fieldErrors };
  }
  const d = parsed.data;
  const admin = createAdminClient();
  const { childLoginDomain } = serverEnv();

  const { data: taken } = await admin.from("child_private").select("child_id").eq("username", d.username).maybeSingle();
  if (taken) return { ok: false, fieldErrors: { username: "Det brugernavn er taget – prøv et andet" } };

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: `${d.username}@${childLoginDomain}`,
    password: d.password,
    email_confirm: true,
    app_metadata: { wak_role: "child" },
  });
  if (createErr || !created.user) {
    return { ok: false, fieldErrors: { username: "Det brugernavn er taget – prøv et andet" } };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  const { error } = await admin.rpc("register_child", {
    p_user_id: created.user.id,
    p_nickname: d.nickname,
    p_avatar: d.avatar,
    p_username: d.username,
    p_birth_year: d.birthYear,
    p_guardian_email: d.guardianEmail,
    p_token_hash: tokenHash,
    p_token_expires_at: expires,
  });
  if (error) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: friendlyError(error) };
  }

  try {
    await sendMail(consentRequestMail(d.guardianEmail, d.nickname, `${env.siteUrl}/voksen/samtykke/${token}`));
  } catch (e) {
    await admin.auth.admin.deleteUser(created.user.id); // cascades to the application
    return { ok: false, error: friendlyError(e, "Vi kunne ikke sende mailen til din voksen. Prøv igen senere.") };
  }
  return { ok: true };
}
