// Supabase sign-in for the hosted studio (Google accounts). Not used by the local Mac version.
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { config } from '../config';
import { isAllowedEmail } from './access';

export interface SignedInUser { email: string; name: string }

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* read-only in some contexts */ } },
    },
  });
}

/** The verified, allowed user for this request — or null. Validates the token with Supabase. */
export async function currentUser(): Promise<SignedInUser | null> {
  if (!config.hosted) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u?.email || !isAllowedEmail(u.email, config.allowedEmailDomains, config.allowedEmails)) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, string>;
  return { email: u.email, name: meta.full_name || meta.name || u.email };
}
