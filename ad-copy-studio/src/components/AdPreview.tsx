'use client';
import type { Combo, ComboSlot } from '@/lib/combos';
import { PLACEMENTS, type PlacementKey, type TextStyle } from '@/lib/typography';

const css = (s: TextStyle): React.CSSProperties => ({ fontFamily: s.fontFamily, fontSize: s.fontSize, lineHeight: `${s.lineHeight}px`, fontWeight: s.fontWeight, color: s.color, letterSpacing: s.letterSpacing });
const langAttr = (l: string) => (l === 'DK' ? 'da' : l === 'DE' ? 'de' : 'en');

function SlotText({ s }: { s: ComboSlot }) {
  const cls = s.state === 'proposed' || s.state === 'editing' ? 'slot-suggested' : s.state === 'missing' ? 'slot-missing' : undefined;
  const title = s.state === 'proposed' || s.state === 'editing' ? 'Suggested wording' : undefined;
  return <span className={cls} title={title}>{s.state === 'missing' ? `[${s.label ?? 'missing'}]` : s.text}</span>;
}
const join = (slots: ComboSlot[], sep: string) => slots.map((s, i) => <span key={s.slot}>{i > 0 && sep}<SlotText s={s} /></span>);

export function AdPreview({ combo, placement, businessName = 'La Cabra' }: { combo: Combo; placement: PlacementKey; businessName?: string }) {
  const p = PLACEMENTS[placement];
  const heads = combo.slots.filter((s) => s.slot.startsWith('H'));
  const descs = combo.slots.filter((s) => s.slot.startsWith('D'));
  if (p.family === 'search') {
    return (
      <div className={`adframe ${p.device === 'mobile' ? 'mobile' : ''}`} style={{ maxWidth: p.width }} lang={langAttr(combo.language)}>
        <div style={{ ...css(p.meta), fontWeight: 700 }}>Sponsored</div>
        <div className="serp-site">
          <div className="serp-fav" aria-hidden />
          <div>
            <div style={css(p.meta)}>{businessName}</div>
            <div style={{ ...css(p.meta), color: 'var(--ink-3)', fontSize: p.meta.fontSize - 1 }}>landing page not set</div>
          </div>
        </div>
        <div style={css(p.headline)}>{join(heads, p.headlineSeparator)}</div>
        <div style={{ ...css(p.description), marginTop: 2 }}>{join(descs, ' ')}</div>
      </div>
    );
  }
  return (
    <div className={`adframe ${p.device === 'mobile' ? 'mobile' : ''}`} style={{ maxWidth: p.width, border: '1px solid var(--line)', padding: 12 }} lang={langAttr(combo.language)}>
      <div className="pmax-img">Text-only example — no image</div>
      <div style={css(p.headline)}>{join(heads, p.headlineSeparator)}</div>
      <div style={{ ...css(p.description), marginTop: 4 }}>{join(descs, ' ')}</div>
      <div style={{ ...css(p.meta), marginTop: 8 }}>Ad · {businessName}</div>
    </div>
  );
}
