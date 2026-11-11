const TZ = "Europe/Copenhagen";

export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(iso));
export const fmtShortDate = (iso: string) =>
  new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso));
export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
export const fmtDateTime = (iso: string) => `${fmtDate(iso)} kl. ${fmtTime(iso)}`;
export const fmtMonth = (iso: string) =>
  new Intl.DateTimeFormat("da-DK", { month: "long", year: "numeric", timeZone: TZ }).format(new Date(iso));
export const dayNumber = (iso: string) =>
  new Intl.DateTimeFormat("da-DK", { day: "numeric", timeZone: TZ }).format(new Date(iso)).replace(".", "");
export const monthShort = (iso: string) =>
  new Intl.DateTimeFormat("da-DK", { month: "short", timeZone: TZ }).format(new Date(iso)).replace(".", "");

/** "2026-11-29T10:00" (datetime-local, Copenhagen time) → ISO UTC string. */
export function fromLocalInput(value: string) {
  // Work out the Copenhagen offset for that moment.
  const asUtc = new Date(`${value}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(asUtc);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return new Date(asUtc.getTime() - (shown - asUtc.getTime())).toISOString();
}

/** ISO → value for <input type="datetime-local"> in Copenhagen time. */
export function toLocalInput(iso: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
  return parts.replace(" ", "T");
}

/** Current time; server components render once per request. */
export const nowMs = () => Date.now();
