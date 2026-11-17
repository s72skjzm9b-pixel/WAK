import { route, getStudio } from '@/server/http/handler';
import { authStatus } from '@/server/google/auth';
import { config } from '@/server/config';
export const dynamic = 'force-dynamic';
// Guided checklist for connecting the live Sheet. Reads only.
export const GET = route(async () => {
  const auth = authStatus();
  const read = auth.state === 'ready' ? await (await getStudio()).liveReadable() : { ok: false, message: 'Sign in first.' };
  if (config.hosted) {
    const email = (auth as any).account as string | undefined;
    return {
      steps: [
        { key: 'client', label: 'A Google service account is added to the hosting settings (GOOGLE_SERVICE_ACCOUNT_JSON)', done: auth.state === 'ready', detail: auth.state === 'ready' ? '' : auth.detail },
        { key: 'signin', label: `The workbook is shared with ${email ?? 'the service account'} (Viewer is enough while writes are off)`, done: read.ok, detail: '' },
        { key: 'read', label: 'The workbook can be read', done: read.ok, detail: read.ok ? '' : read.message },
      ],
      canUseLive: read.ok, liveWritesEnabled: config.liveWritesEnabled, googleAuthMode: 'service_account', hosted: true,
    };
  }
  return {
    steps: [
      { key: 'client', label: 'Google connection details are set up on this computer', done: auth.state !== 'not_configured', detail: auth.state === 'not_configured' ? auth.detail : '' },
      { key: 'signin', label: 'Signed in with a Google account that can open the workbook', done: auth.state === 'ready', detail: auth.state === 'ready' ? (auth as any).account ?? '' : '' },
      { key: 'read', label: 'The workbook can be read', done: read.ok, detail: read.ok ? '' : read.message },
    ],
    canUseLive: read.ok,
    liveWritesEnabled: config.liveWritesEnabled,
    googleAuthMode: config.googleAuthMode,
  };
});
