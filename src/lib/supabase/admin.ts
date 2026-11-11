import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, serverEnv } from "@/lib/env";

/**
 * Service-role client. BYPASSES Row Level Security – only use it for the few
 * account-lifecycle steps where nobody is signed in yet (membership request,
 * guardian consent link) or where Supabase requires it (deleting a login).
 * `server-only` makes the build fail if this is ever imported in the browser.
 */
export function createAdminClient() {
  const { serviceRoleKey } = serverEnv();
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY mangler");
  return createClient(env.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
