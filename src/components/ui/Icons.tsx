// Simple, thick, rounded line icons drawn for WAK.
type P = { className?: string };
const s = { fill: "none", stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const IconKunst = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...s}>
    <rect x="3" y="4" width="18" height="16" rx="3.5" />
    <circle cx="9" cy="10" r="2" />
    <path d="M4 18l5-5 4 4 3-3 4 4" />
  </svg>
);
export const IconUpload = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...s}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconWakt = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...s}>
    <rect x="3" y="5" width="18" height="16" rx="3.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
    <path d="M8.5 15.5l2 2 4.5-4.5" />
  </svg>
);
export const IconMe = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...s}>
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4 21c1.2-4 4.4-6 8-6s6.8 2 8 6" />
  </svg>
);
export const IconCamera = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...s}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
export const IconImage = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...s}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M4 18l5-5 4 4 3-3 4 4" />
  </svg>
);
export const IconClose = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...s}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconPin = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...s}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);
export const IconClock = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...s}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const IconPeople = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...s}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6M18 15c1.6.6 2.6 2.1 3 4" />
  </svg>
);
export const IconFlag = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...s}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
);
export const IconArrow = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...s}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconBack = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...s}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
