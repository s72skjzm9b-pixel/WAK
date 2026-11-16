'use client';
import type { Combo, ComboSlot } from '@/lib/combos';
import { PLACEMENTS, type PlacementKey, type TextStyle } from '@/lib/typography';

const css = (s: TextStyle): React.CSSProperties => ({ fontFamily: s.fontFamily, fontSize: s.fontSize, lineHeight: `${s.lineHeight}px`, fontWeight: s.fontWeight, color: s.color, letterSpacing: s.letterSpacing });

function SlotText({ s }: { s: ComboSlot }) {
  const cls = s.state === 'proposed' ? 'slot-proposed' : s.state === 'editing' ? 'slot-editing' : s.state === 'missing' ? 'slot-missing' : undefined;
  const title = `${s.slot} · ${s.sourceId}${s.label ? ' · ' + s.label : s.state === 'sheet' ? ' · current Sheet wording' : ''}`;
  return <span className={cls} title={title}>{s.state === 'missing' ? `[${s.label ?? 'missing'}]` : s.text}</span>;
}

function joinSlots(slots: ComboSlot[], sep: string) {
  return slots.map((s, i) => <span key={s.slot}>{i > 0 && sep}<SlotText s={s} /></span>);
}

export function AdPreview({ combo, placement, destination }: { combo: Combo; placement: PlacementKey; destination?: string | null }) {
  const p = PLACEMENTS[placement];
  const heads = combo.slots.filter((s) => s.slot.startsWith('H'));
  const descs = combo.slots.filter((s) => s.slot.startsWith('D'));
  const urlGap = 'Landing URL not set';
  if (p.family === 'search') {
    return (
      <div className={`adframe ${p.device === 'mobile' ? 'mobile' : ''}`} style={{ maxWidth: p.width }} lang={langAttr(combo.language)}>
        <div style={css(p.meta)} className="serp-sponsor">Sponsored</div>
        <div className="serp-site">
          <div className="serp-fav" aria-hidden>LC</div>
          <div>
            <div style={{ ...css(p.meta), fontSize: p.meta.fontSize }}>La Cabra</div>
            <div style={{ ...css(p.meta), color: 'var(--bad)', fontSize: p.meta.fontSize - 1 }} title={destination ?? ''}>[{urlGap}{destination ? ` — ${destination}` : ''}]</div>
          </div>
        </div>
        <div style={css(p.headline)}>{joinSlots(heads, p.headlineSeparator)}</div>
        <div style={{ ...css(p.description), marginTop: 2 }}>{joinSlots(descs, ' ')}</div>
      </div>
    );
  }
  return (
    <div className={`adframe ${p.device === 'mobile' ? 'mobile' : ''}`} style={{ maxWidth: p.width, border: '1px solid var(--line)', padding: 12 }} lang={langAttr(combo.language)}>
      <div className="pmax-img">Image / video not in workbook — gap</div>
      <div style={css(p.headline)}>{joinSlots(heads, p.headlineSeparator)}</div>
      <div style={{ ...css(p.description), marginTop: 4 }}>{joinSlots(descs, ' ')}</div>
      <div style={{ ...css(p.meta), marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>Ad · <span style={{ color: 'var(--bad)' }}>[business name & logo not in workbook]</span></span>
        <span aria-hidden>›</span>
      </div>
    </div>
  );
}

export function PreviewCard({ combo, placement, destination, children }: { combo: Combo; placement: PlacementKey; destination?: string | null; children?: React.ReactNode }) {
  return (
    <div className="adcard">
      <span className="illus">Illustrative · not a live ad</span>
      <AdPreview combo={combo} placement={placement} destination={destination} />
      <div className="slotkey">
        {combo.slots.map((s) => (
          <span key={s.slot}>{s.slot}: <b>{s.sourceId}</b>{s.state === 'proposed' ? ' (proposed)' : s.state === 'editing' ? ' (your draft)' : s.state === 'missing' ? ' (missing)' : ''}</span>
        ))}
      </div>
      {children}
    </div>
  );
}

const langAttr = (l: string) => (l === 'DK' ? 'da' : l === 'DE' ? 'de' : 'en');

export function TypographyNote({ placement }: { placement: PlacementKey }) {
  const p = PLACEMENTS[placement];
  return (
    <p className="previewNote">
      <b>Approximate typography.</b> {p.basis} Headline {p.headline.fontSize}px/{p.headline.lineHeight}px, description {p.description.fontSize}px/{p.description.lineHeight}px. Illustrative previews only — Google assembles and formats live ads itself.
    </p>
  );
}
