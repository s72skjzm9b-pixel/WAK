// Organic scalloped shape inspired by the WAK badge outline.
type BlobProps = {
  className?: string;
  /** Number of soft "petals" around the edge. */
  lobes?: number;
  /** 0–0.2: how wavy the edge is. */
  wobble?: number;
  /** Tailwind fill class, e.g. "fill-lavender". */
  fill?: string;
  rotate?: number;
};

export function blobPath(lobes = 9, wobble = 0.07, rotate = 0) {
  const pts: string[] = [];
  const steps = 180;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = 92 * (1 - wobble + wobble * Math.cos(lobes * (t + (rotate * Math.PI) / 180)));
    pts.push(`${(100 + r * Math.cos(t)).toFixed(2)},${(100 + r * Math.sin(t)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

export function Blob({ className = "", lobes = 9, wobble = 0.07, fill = "fill-cobalt", rotate = 0 }: BlobProps) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" className={className} preserveAspectRatio="none">
      <path d={blobPath(lobes, wobble, rotate)} className={fill} />
    </svg>
  );
}

/** Spiky star like the lavender sticker. */
export function Spark({ className = "", fill = "fill-lavender", points = 9 }: { className?: string; fill?: string; points?: number }) {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const t = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 95 : 62;
    pts.push(`${(100 + r * Math.cos(t)).toFixed(1)},${(100 + r * Math.sin(t)).toFixed(1)}`);
  }
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" className={className}>
      <polygon points={pts.join(" ")} className={fill} strokeLinejoin="round" strokeWidth="14" stroke="currentColor" />
    </svg>
  );
}
