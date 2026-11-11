// Creates (or promotes) a WAK administrator account.
// Usage: node --env-file=.env.local scripts/create-admin.mjs admin@example.dk "a-long-password"
import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 12) {
  console.error('Usage: node --env-file=.env.local scripts/create-admin.mjs <email> "<password, min 12 chars>"');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await admin.auth.admin.createUser({
  email: email.toLowerCase(),
  password,
  email_confirm: true,
  app_metadata: { wak_role: "admin" },
});
if (error) {
  console.error("Could not create user:", error.message);
  process.exit(1);
}
const { error: pErr } = await admin.from("profiles").insert({ id: data.user.id, role: "admin", status: "active" });
if (pErr) {
  console.error("User created but profile failed:", pErr.message);
  process.exit(1);
}
await admin.from("audit_log").insert({ action: "admin.created", target_type: "profile", target_id: data.user.id });
console.log(`Admin created: ${email}. Log in at /admin/log-ind`);
