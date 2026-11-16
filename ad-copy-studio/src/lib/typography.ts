// Typography for illustrative ad previews. Google does not publish the stylesheet of its results
// pages or ad placements, and google.com could not be inspected from the build environment, so every
// value below is an APPROXIMATION and is labelled as such in the UI. Adjust here if you measure the
// live pages (DevTools → Computed) — nothing else needs to change.
//
// Fonts used (all legitimately distributable, self-hosted via @fontsource, no third-party requests):
//   Arial → falls back to Arimo (Apache-2.0, metric-compatible with Arial) where Arial is not installed.
//   Roboto (Apache-2.0) for Android/Display-style placements.
//   Google Sans Flex (SIL OFL 1.1, open-sourced by Google in 2025) for the app UI and Google-Sans-style surfaces.

export interface TextStyle { fontFamily: string; fontSize: number; lineHeight: number; fontWeight: number; color: string; letterSpacing?: string }
export interface PlacementTypography {
  key: PlacementKey;
  label: string;
  family: 'search' | 'pmax';
  device: 'desktop' | 'mobile';
  width: number; // px of the illustrative container
  headline: TextStyle;
  description: TextStyle;
  meta: TextStyle;
  headlineSeparator: string;
  verified: false;
  basis: string;
}
export type PlacementKey = 'search-desktop' | 'search-mobile' | 'pmax-display' | 'pmax-feed';

const ARIAL = 'Arial, Arimo, "Liberation Sans", sans-serif';
const ROBOTO = 'Roboto, Arimo, Arial, sans-serif';
const GSANS = '"Google Sans Flex Variable", "Google Sans", Roboto, Arial, sans-serif';

export const PLACEMENTS: Record<PlacementKey, PlacementTypography> = {
  'search-desktop': {
    key: 'search-desktop', label: 'Search — desktop', family: 'search', device: 'desktop', width: 600,
    headline: { fontFamily: ARIAL, fontSize: 20, lineHeight: 26, fontWeight: 400, color: 'var(--serp-link)' },
    description: { fontFamily: ARIAL, fontSize: 14, lineHeight: 22, fontWeight: 400, color: 'var(--serp-text)' },
    meta: { fontFamily: ARIAL, fontSize: 14, lineHeight: 20, fontWeight: 400, color: 'var(--serp-meta)' },
    headlineSeparator: ' | ', verified: false,
    basis: 'Approximation: 20px/26px Arial headline and 14px/22px description, as commonly measured by SEO snippet tools (e.g. Screaming Frog). Google may render Google Sans or Roboto in some markets and experiments.',
  },
  'search-mobile': {
    key: 'search-mobile', label: 'Search — mobile', family: 'search', device: 'mobile', width: 360,
    headline: { fontFamily: ARIAL, fontSize: 18, lineHeight: 24, fontWeight: 400, color: 'var(--serp-link)' },
    description: { fontFamily: ARIAL, fontSize: 14, lineHeight: 20, fontWeight: 400, color: 'var(--serp-text)' },
    meta: { fontFamily: ARIAL, fontSize: 12, lineHeight: 18, fontWeight: 400, color: 'var(--serp-meta)' },
    headlineSeparator: ' | ', verified: false,
    basis: 'Approximation: 18px Arial headline on a 360px-wide card. Mobile layouts vary by device, browser and experiment.',
  },
  'pmax-display': {
    key: 'pmax-display', label: 'PMax — display-style text', family: 'pmax', device: 'desktop', width: 336,
    headline: { fontFamily: ROBOTO, fontSize: 18, lineHeight: 24, fontWeight: 500, color: 'var(--ink)' },
    description: { fontFamily: ROBOTO, fontSize: 14, lineHeight: 20, fontWeight: 400, color: 'var(--ink-2)' },
    meta: { fontFamily: ROBOTO, fontSize: 12, lineHeight: 16, fontWeight: 400, color: 'var(--ink-3)' },
    headlineSeparator: ' · ', verified: false,
    basis: 'Approximation of a responsive display placement in Roboto. Publisher sites may use their own fonts; images, logos and layout are not represented.',
  },
  'pmax-feed': {
    key: 'pmax-feed', label: 'PMax — feed / mobile text', family: 'pmax', device: 'mobile', width: 360,
    headline: { fontFamily: GSANS, fontSize: 16, lineHeight: 22, fontWeight: 500, color: 'var(--ink)' },
    description: { fontFamily: GSANS, fontSize: 14, lineHeight: 20, fontWeight: 400, color: 'var(--ink-2)' },
    meta: { fontFamily: GSANS, fontSize: 12, lineHeight: 16, fontWeight: 400, color: 'var(--ink-3)' },
    headlineSeparator: ' · ', verified: false,
    basis: 'Approximation of a Google-Sans-style feed surface (e.g. Discover/Gmail-like) using Google Sans Flex. Real placements add images and differ by surface.',
  },
};

export function placementsFor(format: string): PlacementKey[] {
  return format === 'search' ? ['search-desktop', 'search-mobile'] : ['pmax-display', 'pmax-feed'];
}
