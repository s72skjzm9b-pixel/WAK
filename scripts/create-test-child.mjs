// Creates an approved TEST child (+ test guardian) by running the real flow:
// signup (register_child) → guardian consent (guardian_confirm_application) → admin approval.
// Usage: node --env-file=.env.local scripts/create-test-child.mjs <username> "<child password>" <admin email> "<admin password>"
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [username, password, adminEmail, adminPassword] = process.argv.slice(2);
if (!username || !password || !adminEmail || !adminPassword) {
  console.error('Usage: node --env-file=.env.local scripts/create-test-child.mjs <username> "<password>" <admin-email> "<admin-password>"');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const domain = process.env.CHILD_LOGIN_EMAIL_DOMAIN ?? "konto.wak.invalid";
const opts = { auth: { persistSession: false } };
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);
const fail = (step, e) => { console.error(`${step}:`, e?.message ?? e); process.exit(1); };

// 1. Child signs up
const { data: child, error: e1 } = await service.auth.admin.createUser({
  email: `${username}@${domain}`, password, email_confirm: true, app_metadata: { wak_role: "child" },
});
if (e1) fail("create child", e1);
const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");
const guardianEmail = `voksen.${username}@wak.test`;
const { error: e2 } = await service.rpc("register_child", {
  p_user_id: child.user.id, p_nickname: "Test Kunstner", p_avatar: "eyes:orange", p_username: username,
  p_birth_year: new Date().getFullYear() - 11, p_guardian_email: guardianEmail,
  p_token_hash: tokenHash, p_token_expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
});
if (e2) { await service.auth.admin.deleteUser(child.user.id); fail("register_child", e2); }

// 2. Guardian consents (incl. image sharing)
const { data: g, error: e3 } = await service.auth.admin.createUser({
  email: guardianEmail, email_confirm: true, app_metadata: { wak_role: "guardian" },
});
if (e3) fail("create guardian", e3);
const { error: e4 } = await service.rpc("guardian_confirm_application", {
  p_token_hash: tokenHash, p_guardian_id: g.user.id, p_full_name: "Test Voksen", p_phone: "",
  p_image_sharing: true, p_policy_version: process.env.WAK_POLICY_VERSION ?? "2026-11-draft",
});
if (e4) fail("guardian consent", e4);

// 3. Admin approves (as the logged-in admin, so it is audited)
const adminClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
const { error: e5 } = await adminClient.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
if (e5) fail("admin login", e5);
const { error: e6 } = await adminClient.rpc("admin_decide_membership", { p_child: child.user.id, p_approve: true, p_note: "Testkonto" });
if (e6) fail("admin approve", e6);

console.log(`Test child ready. Log in at /log-ind with username "${username}". Guardian: ${guardianEmail}`);
