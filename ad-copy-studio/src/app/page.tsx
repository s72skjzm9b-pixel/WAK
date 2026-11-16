'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, useStudio } from '@/components/client';

export default function Home() {
  const { status, version } = useStudio();
  const [revs, setRevs] = useState<any[]>([]);
  useEffect(() => { api('/api/revisions').then((r) => setRevs(r.revisions)).catch(() => {}); }, [version]);
  const count = (s: string) => revs.filter((r) => r.state === s).length;
  const wb = status?.workbook;
  return (
    <div className="stack">
      <h1>La Cabra Ad Copy Studio</h1>
      <p className="muted" style={{ maxWidth: 760 }}>Develop copy visually, review how lines read together, and hand Anabelle exactly approved wording. The Google Sheet stays the canonical copy library; this studio keeps proposals, feedback, approvals and history on this computer.</p>
      <div className="grid3">
        <Link href="/write" className="panel" style={{ textDecoration: 'none', color: 'inherit' }}><h2>Write</h2><p className="small">Browse the library by intent, market and language. Replace wording or add a variation with live previews. Typing never changes the Sheet.</p><p className="small"><b>{count('draft')}</b> drafts · <b>{count('changes_requested')}</b> sent back</p></Link>
        <Link href="/review" className="panel" style={{ textDecoration: 'none', color: 'inherit' }}><h2>Review</h2><p className="small">Approve exact wording, and give separate feedback on illustrative combinations.</p><p className="small"><b>{count('submitted')}</b> waiting for approval · <b>{count('approved')}</b> approved, not in Sheet</p></Link>
        <Link href="/handover" className="panel" style={{ textDecoration: 'none', color: 'inherit' }}><h2>Handover</h2><p className="small">Approved copy by market and group, exact replacements, new variations, gaps, clipboard text and dated CSV batches.</p><p className="small"><b>{count('written')}</b> written to the Sheet</p></Link>
      </div>
      <div className="panel">
        <h2>Four states of wording</h2>
        <ol className="small">
          <li><b>Current Sheet wording</b> — what the workbook says now. Not necessarily approved, and never assumed to be live in Google Ads.</li>
          <li><b>Proposed revision</b> — saved in the studio only.</li>
          <li><b>Approved revision</b> — an approver accepted this exact text (and, for translations, the English it translates). Any edit invalidates it.</li>
          <li><b>Written to the Sheet</b> — the approved text was written to the canonical cell and verified by reading it back.</li>
        </ol>
      </div>
      {wb && <p className="small muted">Workbook: “{wb.title}” · {wb.counts.sourceIds} source IDs · {wb.counts.campaignTabs} campaign tabs.</p>}
    </div>
  );
}
