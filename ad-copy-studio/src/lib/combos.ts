// Generates illustrative text combinations for one asset group / ad group. Pure and isomorphic so the
// editor can re-render previews while typing. These are review aids, not a prediction of what Google
// will serve: Google assembles ads itself, and rejecting a preview does not stop Google from showing it.
import type { CampaignFormat, Lang } from '@/server/workbook/types';

export type SlotName = 'H1' | 'H2' | 'H3' | 'D1' | 'D2';
export type PinPosition = SlotName;

export interface PoolAsset {
  sourceId: string;
  assetType: string; // Headline | Description | Long headline …
  text: string;
  linkedHeadline: string | null; // descriptions that must appear with a specific headline
  state: 'sheet' | 'proposed' | 'editing' | 'missing';
  label?: string; // e.g. "Proposed revision", "Not yet translated"
}

export interface ComboSlot { slot: SlotName; sourceId: string; text: string; state: PoolAsset['state']; label?: string }
export interface Combo { key: string; format: CampaignFormat; campaign: string; group: string; language: Lang; slots: ComboSlot[] }

export interface GroupContext {
  campaign: string;
  group: string;
  format: CampaignFormat;
  language: Lang;
  assets: PoolAsset[];
  pins: Record<string, PinPosition>; // sourceId → position (Search only)
}

const isHeadline = (a: PoolAsset) => /^headline$/i.test(a.assetType.trim());
const isDescription = (a: PoolAsset) => /^description$/i.test(a.assetType.trim());

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function shuffled<T>(list: T[], seed: string): T[] {
  let x = hashSeed(seed) || 1;
  const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1_000_000) / 1_000_000; };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function comboKey(c: Omit<Combo, 'key'>): string {
  return [c.format, c.campaign, c.group, c.language, ...c.slots.map((s) => `${s.slot}=${s.sourceId}`)].join('|');
}

/** Explicit headline–description pairs: a description with a linked headline may only appear with it. */
function pairsOk(heads: PoolAsset[], descs: PoolAsset[], englishHeadlineById: Map<string, string>): boolean {
  for (const d of descs) {
    if (!d.linkedHeadline) continue;
    const ok = heads.some((h) => (englishHeadlineById.get(h.sourceId) ?? h.text) === d.linkedHeadline);
    if (!ok) return false;
  }
  return true;
}

const MAX_ENUMERATED = 60_000;

export function generateCombos(ctx: GroupContext, englishHeadlineById: Map<string, string> = new Map()): { all: Combo[]; total: number; truncated: boolean; notes: string[] } {
  const notes: string[] = [];
  const heads = ctx.assets.filter(isHeadline);
  const descs = ctx.assets.filter(isDescription);
  const out: Omit<Combo, 'key'>[] = [];
  let truncated = false;
  const base = { format: ctx.format, campaign: ctx.campaign, group: ctx.group, language: ctx.language };
  const slot = (s: SlotName, a: PoolAsset): ComboSlot => ({ slot: s, sourceId: a.sourceId, text: a.text, state: a.state, label: a.label });

  if (!heads.length) notes.push('No headlines in this group.');
  if (!descs.length) notes.push('No descriptions in this group.');

  if (ctx.format === 'search') {
    // Search: up to 3 headlines and 2 descriptions; pinned assets may only appear in their pinned slot,
    // and when a slot has pins, only pinned assets may fill it.
    const pinnedTo = (a: PoolAsset) => ctx.pins[a.sourceId];
    const candidates = (s: SlotName, pool: PoolAsset[]) => {
      const pinnedHere = pool.filter((a) => pinnedTo(a) === s);
      return pinnedHere.length ? pinnedHere : pool.filter((a) => !pinnedTo(a));
    };
    const h1 = candidates('H1', heads), h2 = candidates('H2', heads), h3 = candidates('H3', heads);
    const d1 = candidates('D1', descs), d2 = candidates('D2', descs);
    if (Object.keys(ctx.pins).length) notes.push('Respecting the pinning proposal configured for this ad group (a proposal only — not applied in Google Ads).');
    outer: for (const a of h1) for (const b of h2) {
      if (b === a) continue;
      for (const c of [...h3, null]) {
        if (c === a || c === b) continue;
        for (const d of d1) for (const e of [...d2, null]) {
          if (e === d) continue;
          const hs = [a, b, ...(c ? [c] : [])];
          const ds = [d, ...(e ? [e] : [])];
          if (!pairsOk(hs, ds, englishHeadlineById)) continue;
          // Google may show only two headlines / one description; keep the fuller layouts for review.
          if (!c || !e) continue;
          out.push({ ...base, slots: [slot('H1', a), slot('H2', b), slot('H3', c), slot('D1', d), slot('D2', e)] });
          if (out.length >= MAX_ENUMERATED) { truncated = true; break outer; }
        }
      }
    }
    if (!out.length && heads.length >= 2 && descs.length >= 1) {
      // Small groups: fall back to two headlines + one description.
      for (const a of h1) for (const b of h2) for (const d of d1) {
        if (a === b || !pairsOk([a, b], [d], englishHeadlineById)) continue;
        out.push({ ...base, slots: [slot('H1', a), slot('H2', b), slot('D1', d)] });
      }
    }
  } else {
    // PMax / Demand Gen: no pinning. Any headline can meet any description in the group.
    outer2: for (const d of descs) for (const a of heads) {
      if (pairsOk([a], [d], englishHeadlineById)) out.push({ ...base, slots: [slot('H1', a), slot('D1', d)] });
      for (const b of heads) {
        if (b === a || !pairsOk([a, b], [d], englishHeadlineById)) continue;
        out.push({ ...base, slots: [slot('H1', a), slot('H2', b), slot('D1', d)] });
        if (out.length >= MAX_ENUMERATED) { truncated = true; break outer2; }
      }
    }
  }
  const all = shuffled(out, `${ctx.campaign}|${ctx.group}|${ctx.language}`).map((c) => ({ ...c, key: comboKey(c) }));
  // Put combinations containing an asset being edited or proposed first, so changes are visible immediately.
  all.sort((x, y) => Number(y.slots.some((s) => s.state !== 'sheet')) - Number(x.slots.some((s) => s.state !== 'sheet')));
  return { all, total: all.length, truncated, notes };
}
