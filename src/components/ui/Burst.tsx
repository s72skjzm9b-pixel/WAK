// The little "action lines" that sit around the can in the logo.
export function Burst({ side = "left", className = "" }: { side?: "left" | "right"; className?: string }) {
  const flip = side === "right" ? "scale(-1,1) translate(-40,0)" : undefined;
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round">
      <g transform={flip}>
        <path d="M28 8 L20 2" />
        <path d="M26 20 L12 18" />
        <path d="M28 32 L20 38" />
      </g>
    </svg>
  );
}
