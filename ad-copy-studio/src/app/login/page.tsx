'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function Page() { return <Suspense><Login /></Suspense>; }

function Login() {
  const p = useSearchParams();
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const hd = process.env.NEXT_PUBLIC_STUDIO_SIGNIN_DOMAIN;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: 'select_account', ...(hd ? { hd } : {}) } },
    });
  };
  return (
    <div className="login">
      <h1>La Cabra Ad Copy Studio</h1>
      <p className="muted">Sign in with your La Cabra Google account.</p>
      {p.get('denied') && <p className="notice bad">That Google account doesn’t have access. Use your La Cabra account, or ask Christian to add you.</p>}
      {p.get('error') && <p className="notice bad">Sign-in didn’t complete. Please try again.</p>}
      <button className="btn primary" onClick={signIn} disabled={busy}>{busy ? 'Opening Google…' : 'Sign in with Google'}</button>
    </div>
  );
}
