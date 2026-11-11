// Central place for configuration. Public values are safe in the browser;
// everything else must only be read on the server.
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

export function serverEnv() {
  return {
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    /** Children log in with a username; Supabase needs an email, so we map it. */
    childLoginDomain: process.env.CHILD_LOGIN_EMAIL_DOMAIN ?? "konto.wak.invalid",
    policyVersion: process.env.WAK_POLICY_VERSION ?? "2026-11-draft",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    emailFrom: process.env.EMAIL_FROM ?? "WAK <hej@example.com>",
  };
}

export const isConfigured = () => Boolean(env.supabaseUrl && env.supabaseAnonKey);
