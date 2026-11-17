import { route, getStudio } from '@/server/http/handler';
import { workspaceView } from '@/server/domain/workspace';
import { handoffItems } from '@/lib/handoff';
export const dynamic = 'force-dynamic';
// What still needs doing in Google Ads (applied/registered work is excluded). A plain list, NOT a Google Ads import.
export const GET = route(async (req) => {
  const v = await workspaceView((await getStudio()));
  const rows = handoffItems(v as any);
  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const esc = (x: string) => { let t = x ?? ''; if (/^[=+\-@]/.test(t)) t = `'${t}`; return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const head = ['To do', 'Collection', 'Language', 'Field', 'Old wording', 'New wording', 'Where (markets · formats · groups)', 'Sheet status', 'Source ID'];
    const csv = '﻿' + [head.join(','), ...rows.map((r) => [r.todo, r.collection, r.languageName, r.field, r.old, r.new, r.whereText, r.sheetState, r.sourceId].map(esc).join(','))].join('\r\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="la-cabra-changes-to-apply-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  const text = ['La Cabra — copy changes to apply (review list, not a Google Ads import)', '',
    ...rows.map((r) => `${r.todo} · ${r.collection} · ${r.languageName} · ${r.field}\n  Old: ${r.old || '—'}\n  New: ${r.new}\n  Where: ${r.whereText}`)].join('\n');
  return { text, count: rows.length };
});
