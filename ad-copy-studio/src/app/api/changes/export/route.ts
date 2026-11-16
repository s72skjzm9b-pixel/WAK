import { route, getStudio } from '@/server/http/handler';
import { workspaceView } from '@/server/domain/workspace';
export const dynamic = 'force-dynamic';
// Old → new list of accepted changes for Anabelle. A plain review list, NOT a Google Ads Editor import.
export const GET = route(async (req) => {
  const v = await workspaceView(getStudio());
  const colsFor = (id: string, collection: string | null) => collection
    ? [v.collections.find((c) => c.key === collection)?.name ?? collection]
    : v.collections.filter((c) => c.sourceIds.includes(id)).map((c) => c.name);
  const accepted = v.suggestions.filter((s) => s.state === 'written' || (s.state === 'approved' && s.kind !== 'replace'));
  const rows = accepted.map((s) => ({
    collection: colsFor(s.sourceId, s.collection).join('; '), language: s.language, change: s.kind === 'variation' ? 'New' : s.kind === 'retire' ? 'Remove' : 'Replace',
    old: s.baseText, new: s.proposedText, inSheet: s.state === 'written' ? 'Yes' : 'No — kept in the studio', id: s.sourceId, accepted: s.updatedAt,
  }));
  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const esc = (x: string) => { let t = x ?? ''; if (/^[=+\-@]/.test(t)) t = `'${t}`; return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const head = ['Collection', 'Language', 'Change', 'Old wording', 'New wording', 'In the Sheet', 'Source ID', 'Accepted'];
    const csv = '﻿' + [head.join(','), ...rows.map((r) => [r.collection, r.language, r.change, r.old, r.new, r.inSheet, r.id, r.accepted].map(esc).join(','))].join('\r\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="la-cabra-accepted-changes-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  const text = ['La Cabra — accepted copy changes (review list, not a Google Ads import)', '',
    ...rows.map((r) => `${r.collection} · ${r.language} · ${r.change}\n  Old: ${r.old || '—'}\n  New: ${r.new || '—'}${r.inSheet === 'Yes' ? '' : `\n  (${r.inSheet})`}`)].join('\n');
  return { text, count: rows.length };
});
