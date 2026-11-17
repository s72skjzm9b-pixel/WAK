// What Anabelle receives. Inclusion is strict: only wording with a currently valid approval of its
// exact text (and, for translations, of the English it translates). Drafts, submitted proposals,
// invalidated approvals and test items are never included; they are counted and listed separately.
import type { Lang } from '../workbook/types';
import type { Studio } from './studio';
import { fp, type CopyItem } from './library';
import type { Revision } from '../store/repo';

export interface HandoverFilters { market?: string; language?: Lang; campaign?: string }

export interface ApprovedLine {
  market: string; campaign: string; group: string; format: string; assetType: string; sourceId: string; language: Lang;
  text: string; englishBasis: string; textFp: string; approvalId: string; approvedAt: string; approvedBy: string; sheetState: string;
}
export interface ReplacementLine {
  revisionId: string; sourceId: string; language: Lang; previousText: string; replacementText: string; englishBasis: string;
  usages: { market: string; campaign: string; group: string; format: string }[]; approvalId: string; approvedAt: string;
  writtenAt: string | null; acknowledged: { id: string; at: string; by: string; referenceState: string } | null; textFp: string;
}
export interface VariationLine {
  revisionId: string; proposedId: string; language: Lang; text: string; englishBasis: string; assetType: string;
  targets: { campaign: string; group: string }[]; approvalId: string; approvedAt: string; textFp: string;
}
export interface RetirementLine { revisionId: string; sourceId: string; language: Lang; text: string; usages: { campaign: string; group: string }[]; reason: string; approvedAt: string }
export interface Dependency { kind: string; sourceId?: string; language?: Lang; campaign?: string; group?: string; detail: string }

export interface Handover {
  generatedAt: string; mode: string; readAt: string; origin: string;
  approved: ApprovedLine[]; replacements: ReplacementLine[]; variations: VariationLine[]; retirements: RetirementLine[];
  dependencies: Dependency[];
  excluded: { notApproved: number; drafts: number; tests: number };
  updatesInSheet: { sourceId: string; lang: Lang; previous: string; current: string; action: string; campaignRefs: string }[];
}

export async function buildHandover(studio: Studio, f: HandoverFilters = {}): Promise<Handover> {
  const wb = await studio.workbook();
  const lib = new Map(wb.library.map((i) => [i.sourceId, i]));
  const revs = (await studio.repo.listRevisions());
  const acks = (await studio.repo.listAcks());
  const marketOk = (m: string) => !f.market || m === f.market;
  const langOk = (l: Lang) => !f.language || l === f.language;
  const campOk = (c: string) => !f.campaign || c === f.campaign;

  const approved: ApprovedLine[] = [];
  const dependencies: Dependency[] = [];
  let notApproved = 0, tests = 0;

  // 1. Approved copy per campaign tab / group, in the campaign's language.
  for (const item of wb.library) {
    if (item.isTest) { tests++; continue; }
    for (const u of item.usages) {
      if (!marketOk(u.market) || !langOk(u.language) || !campOk(u.campaign)) continue;
      const v = item.versions[u.language];
      if (!v.text) { dependencies.push({ kind: 'missing_translation', sourceId: item.sourceId, language: u.language, campaign: u.campaign, group: u.group, detail: `${u.language} wording missing for ${item.sourceId}.` }); continue; }
      const a = (await studio.currentWordingApproval(item, u.language));
      if (!a) { notApproved++; continue; }
      const written = revs.find((r) => r.kind === 'replace' && r.state === 'written' && r.sourceId === item.sourceId && r.language === u.language && r.proposedText === v.text);
      approved.push({
        market: u.market, campaign: u.campaign, group: u.group, format: u.format, assetType: u.assetType, sourceId: item.sourceId, language: u.language,
        text: v.text, englishBasis: item.versions.EN.text, textFp: fp(v.text), approvalId: a.id, approvedAt: a.approvedAt, approvedBy: a.approvedBy,
        sheetState: written ? 'Written to Sheet by the studio' : 'Current Sheet wording',
      });
    }
  }

  // 2. Replacements written to the Sheet: exact previous → replacement text.
  const replacements: ReplacementLine[] = [];
  for (const r of revs.filter((x) => x.kind === 'replace' && x.state === 'written' && !x.isTest)) {
    const item = lib.get(r.sourceId);
    if (!langOk(r.language)) continue;
    const usages = (item?.usages ?? []).filter((u) => u.language === r.language && marketOk(u.market) && campOk(u.campaign));
    if ((f.market || f.campaign) && !usages.length) continue;
    const chk = (await studio.checkRevisionApproval(r, item ?? null));
    if (!chk.valid) {
      dependencies.push({ kind: 'approval_invalid', sourceId: r.sourceId, language: r.language, detail: `Written replacement no longer approved: ${chk.reason}.` });
      continue;
    }
    if (item && item.versions[r.language].text !== r.proposedText) {
      dependencies.push({ kind: 'sheet_changed', sourceId: r.sourceId, language: r.language, detail: `The Sheet changed after this replacement was written (now “${item.versions[r.language].text}”).` });
      continue;
    }
    const ack = acks.find((a) => a.revisionId === r.id) ?? null;
    if (ack?.referenceState === 'advanced') continue; // done: applied and reference advanced
    replacements.push({
      revisionId: r.id, sourceId: r.sourceId, language: r.language, previousText: r.baseText, replacementText: r.proposedText, englishBasis: r.englishBasis,
      usages: usages.map((u) => ({ market: u.market, campaign: u.campaign, group: u.group, format: u.format })),
      approvalId: chk.approval.id, approvedAt: chk.approval.approvedAt, writtenAt: r.updatedAt,
      acknowledged: ack ? { id: ack.id, at: ack.acknowledgedAt, by: ack.acknowledgedBy, referenceState: ack.referenceState } : null, textFp: fp(r.proposedText),
    });
  }

  // 3. Approved new variations (local only in this release).
  const variations: VariationLine[] = [];
  for (const r of revs.filter((x) => x.kind === 'variation' && x.state === 'approved' && !x.isTest)) {
    if (!langOk(r.language)) continue;
    const targets = (r.meta.targets ?? []).filter((t) => campOk(t.campaign) && marketOk(t.campaign.split('_')[0]));
    if ((f.market || f.campaign) && !targets.length) continue;
    const chk = (await studio.checkRevisionApproval(r, null));
    if (!chk.valid) { dependencies.push({ kind: 'approval_invalid', sourceId: r.sourceId, language: r.language, detail: `New variation approval invalid: ${chk.reason}.` }); continue; }
    variations.push({ revisionId: r.id, proposedId: r.sourceId, language: r.language, text: r.proposedText, englishBasis: r.englishBasis, assetType: r.meta.assetType ?? '', targets, approvalId: chk.approval.id, approvedAt: chk.approval.approvedAt, textFp: fp(r.proposedText) });
    if (!targets.length) dependencies.push({ kind: 'variation_unassigned', sourceId: r.sourceId, language: r.language, detail: `${r.sourceId} is approved but has no intended campaign group. It is not distributed automatically.` });
    dependencies.push({ kind: 'variation_unregistered', sourceId: r.sourceId, language: r.language, detail: `${r.sourceId} (${r.language}) is approved in the studio but not registered in the Sheet yet.` });
  }

  // 4. Approved retirements.
  const retirements: RetirementLine[] = [];
  for (const r of revs.filter((x) => x.kind === 'retire' && x.state === 'approved' && !x.isTest)) {
    if (!langOk(r.language)) continue;
    const item = lib.get(r.sourceId);
    const usages = (item?.usages ?? []).filter((u) => u.language === r.language && marketOk(u.market) && campOk(u.campaign));
    if ((f.market || f.campaign) && !usages.length) continue;
    retirements.push({ revisionId: r.id, sourceId: r.sourceId, language: r.language, text: r.baseText, usages: usages.map((u) => ({ campaign: u.campaign, group: u.group })), reason: r.reason, approvedAt: r.updatedAt });
  }

  // 5. Unresolved dependencies.
  for (const r of revs.filter((x) => x.kind === 'replace' && x.state === 'approved' && !x.isTest && langOk(x.language))) {
    dependencies.push({ kind: `write_${r.syncState}`, sourceId: r.sourceId, language: r.language, detail: `Approved but not in the Sheet yet (${r.syncState}): ${r.syncDetail}` });
  }
  for (const item of wb.library) {
    if (item.isTest) continue;
    for (const l of ['DK', 'DE'] as Lang[]) {
      if (!langOk(l)) continue;
      const usedHere = item.usages.some((u) => u.language === l && marketOk(u.market) && campOk(u.campaign));
      if (!usedHere) continue;
      if (/recheck/i.test(item.versions[l].sheetStatus)) dependencies.push({ kind: 'translation_recheck', sourceId: item.sourceId, language: l, detail: `English changed — ${l} translation needs re-review (${item.versions[l].sheetStatus}).` });
      const openEn = revs.some((r) => r.sourceId === item.sourceId && r.language === 'EN' && r.kind === 'replace' && ['submitted', 'approved'].includes(r.state));
      if (openEn) dependencies.push({ kind: 'translation_pending_english', sourceId: item.sourceId, language: l, detail: `An English change for ${item.sourceId} is in review; the ${l} translation will need re-review.` });
    }
  }
  const p = wb.parsed;
  for (const c of p.campaigns) {
    if (!marketOk(c.market) || !campOk(c.name) || !langOk(c.language)) continue;
    for (const g of c.gaps) dependencies.push({ kind: 'missing_asset', campaign: c.name, group: g.group, detail: `${g.assetType}: ${g.note}` });
  }
  for (const m of p.campaignMap) {
    if (!campOk(m.name) && f.campaign) continue;
    if (/pending|confirm|needed/i.test(m.allowedSource) && /christmas|advent/i.test(m.name)) dependencies.push({ kind: 'seasonal_gap', campaign: m.name, detail: `${m.allowedSource}. ${m.decision}` });
    else if (/confirm/i.test(m.destination) && (!f.market || m.name.startsWith(f.market + '_'))) dependencies.push({ kind: 'destination', campaign: m.name, detail: `Landing URL: ${m.destination}` });
  }
  const openFeedback = (await studio.feedback()).filter((x) => x.verdict === 'needs_changes' && !x.resolvedAt && campOk(x.combo.campaign) && langOk(x.combo.language));
  for (const fb of openFeedback) dependencies.push({ kind: 'combination_feedback', campaign: fb.combo.campaign, group: fb.combo.group, detail: `Combination marked “needs changes” (${fb.reasons.join(', ') || 'no reason'}): ${fb.comment}`.trim() });

  const drafts = revs.filter((r) => ['draft', 'submitted', 'changes_requested'].includes(r.state)).length;
  const updatesInSheet = p.updatesRows.filter((r) => langOk(r.lang)).map((r) => ({ sourceId: r.sourceId, lang: r.lang, previous: r.previous, current: r.current, action: r.action, campaignRefs: r.campaignRefs }));
  return {
    generatedAt: new Date().toISOString(), mode: studio.mode(), readAt: wb.readAt, origin: wb.origin,
    approved, replacements, variations, retirements, dependencies,
    excluded: { notApproved, drafts, tests: tests + revs.filter((r) => r.isTest).length }, updatesInSheet,
  };
}

// ----------------------------------------------------------------- CSV
const CSV_COLUMNS = [
  'export_type', 'batch_id', 'generated_at', 'record_type', 'market', 'campaign', 'group', 'format', 'asset_type', 'source_id', 'language',
  'previous_text', 'text', 'english_basis', 'text_fingerprint', 'approval_id', 'approved_at', 'sheet_state', 'notes',
] as const;

function csvCell(v: string): string {
  let s = v ?? '';
  // Prevent spreadsheet formula injection when the CSV is opened in Sheets/Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function handoverCsv(h: Handover, batchId: string): { csv: string; rows: number; items: { kind: string; id: string; fp: string }[] } {
  const EXPORT_TYPE = 'Review/handover CSV — not validated for Google Ads Editor import';
  const rows: string[][] = [];
  const items: { kind: string; id: string; fp: string }[] = [];
  const base = (rt: string) => ({ export_type: EXPORT_TYPE, batch_id: batchId, generated_at: h.generatedAt, record_type: rt });
  const push = (o: Record<string, string>) => rows.push(CSV_COLUMNS.map((c) => o[c] ?? ''));
  for (const a of h.approved) {
    push({ ...base('approved_copy'), market: a.market, campaign: a.campaign, group: a.group, format: a.format, asset_type: a.assetType, source_id: a.sourceId, language: a.language, text: a.text, english_basis: a.englishBasis, text_fingerprint: a.textFp, approval_id: a.approvalId, approved_at: a.approvedAt, sheet_state: a.sheetState });
    items.push({ kind: 'approved_copy', id: `${a.sourceId}/${a.language}@${a.campaign}/${a.group}`, fp: a.textFp });
  }
  for (const r of h.replacements) {
    const targets = r.usages.length ? r.usages : [{ market: '', campaign: '', group: '', format: '' }];
    for (const u of targets) push({ ...base('replacement'), market: u.market, campaign: u.campaign, group: u.group, format: u.format, source_id: r.sourceId, language: r.language, previous_text: r.previousText, text: r.replacementText, english_basis: r.englishBasis, text_fingerprint: r.textFp, approval_id: r.approvalId, approved_at: r.approvedAt, sheet_state: 'Written to Sheet', notes: r.acknowledged ? `Acknowledged applied ${r.acknowledged.at}` : 'Replace the previous text exactly' });
    items.push({ kind: 'replacement', id: r.revisionId, fp: r.textFp });
  }
  for (const v of h.variations) {
    const targets = v.targets.length ? v.targets : [{ campaign: '', group: '' }];
    for (const t of targets) push({ ...base('new_variation'), market: t.campaign.split('_')[0] ?? '', campaign: t.campaign, group: t.group, asset_type: v.assetType, source_id: v.proposedId, language: v.language, text: v.text, english_basis: v.englishBasis, text_fingerprint: v.textFp, approval_id: v.approvalId, approved_at: v.approvedAt, sheet_state: 'Studio only — ID not yet registered in Sheet', notes: 'Add alongside existing assets; does not replace anything' });
    items.push({ kind: 'new_variation', id: v.revisionId, fp: v.textFp });
  }
  for (const r of h.retirements) {
    for (const u of r.usages.length ? r.usages : [{ campaign: '', group: '' }]) push({ ...base('retirement'), campaign: u.campaign, group: u.group, source_id: r.sourceId, language: r.language, previous_text: r.text, approved_at: r.approvedAt, sheet_state: 'Line kept in Sheet', notes: `Remove or pause this asset. ${r.reason}`.trim() });
    items.push({ kind: 'retirement', id: r.revisionId, fp: fp(r.text) });
  }
  const csv = '﻿' + [CSV_COLUMNS.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
  return { csv, rows: rows.length, items };
}

export function handoverText(h: Handover): string {
  const out: string[] = [`La Cabra — approved copy handover (${new Date(h.generatedAt).toLocaleString('en-GB')})`, 'Illustrative review export; not a Google Ads Editor import file.', ''];
  if (h.replacements.length) {
    out.push('REPLACE (exact text)');
    for (const r of h.replacements) out.push(`• ${r.sourceId} ${r.language} — in ${r.usages.map((u) => `${u.campaign} / ${u.group}`).join('; ') || 'no campaign usage'}`, `  Previous:    ${r.previousText}`, `  Replacement: ${r.replacementText}`);
    out.push('');
  }
  if (h.variations.length) {
    out.push('ADD (new variation — does not replace anything)');
    for (const v of h.variations) out.push(`• ${v.proposedId} ${v.language} ${v.assetType}: ${v.text}`, `  Intended for: ${v.targets.map((t) => `${t.campaign} / ${t.group}`).join('; ') || 'not assigned'}`);
    out.push('');
  }
  if (h.retirements.length) {
    out.push('REMOVE / PAUSE');
    for (const r of h.retirements) out.push(`• ${r.sourceId} ${r.language}: ${r.text}`);
    out.push('');
  }
  if (h.approved.length) {
    out.push('APPROVED COPY BY GROUP');
    const groups = new Map<string, ApprovedLine[]>();
    for (const a of h.approved) { const k = `${a.campaign} / ${a.group}`; groups.set(k, [...(groups.get(k) ?? []), a]); }
    for (const [k, list] of groups) { out.push(k); for (const a of list) out.push(`  ${a.assetType}: ${a.text}`); }
    out.push('');
  }
  if (h.dependencies.length) {
    out.push('UNRESOLVED');
    for (const d of h.dependencies) out.push(`• ${[d.campaign, d.group, d.sourceId, d.language].filter(Boolean).join(' · ')}: ${d.detail}`);
  }
  return out.join('\n');
}

export type { Revision, CopyItem };
