const LABELS: Record<string, { label: string; cls: string }> = {
  // membership
  pending_guardian: { label: "Venter på voksen", cls: "bg-lavender text-cobalt" },
  pending_admin: { label: "Venter på WAK", cls: "bg-lavender text-cobalt" },
  active: { label: "Aktiv", cls: "bg-[#d4f2e0] text-success" },
  suspended: { label: "Suspenderet", cls: "bg-[#fde8e5] text-danger" },
  rejected: { label: "Afvist", cls: "bg-[#fde8e5] text-danger" },
  // artwork
  pending: { label: "Vi kigger på den", cls: "bg-lavender text-cobalt" },
  approved: { label: "I galleriet", cls: "bg-[#d4f2e0] text-success" },
  removed: { label: "Fjernet", cls: "bg-[#fde8e5] text-danger" },
  // registrations
  confirmed: { label: "Du er tilmeldt!", cls: "bg-orange text-cobalt-deep" },
  waitlisted: { label: "På venteliste", cls: "bg-lavender text-cobalt" },
  declined: { label: "Voksen sagde nej", cls: "bg-cream text-ink-soft border border-ink-soft/30" },
  cancelled: { label: "Afmeldt", cls: "bg-cream text-ink-soft border border-ink-soft/30" },
  expired: { label: "Udløbet", cls: "bg-cream text-ink-soft border border-ink-soft/30" },
  // events
  draft: { label: "Kladde", cls: "bg-cream text-ink-soft border border-ink-soft/30" },
  published: { label: "Offentliggjort", cls: "bg-[#d4f2e0] text-success" },
  // reports
  open: { label: "Åben", cls: "bg-orange text-cobalt-deep" },
  resolved: { label: "Løst", cls: "bg-[#d4f2e0] text-success" },
  dismissed: { label: "Afvist", cls: "bg-cream text-ink-soft border border-ink-soft/30" },
};

export function statusLabel(status: string, context?: "registration-guardian") {
  if (context === "registration-guardian" && status === "pending_guardian") return "Venter på dit svar";
  if (context === "registration-guardian" && status === "confirmed") return "Tilmeldt";
  return LABELS[status]?.label ?? status;
}

export function StatusPill({ status, context, className = "" }: { status: string; context?: "registration-guardian"; className?: string }) {
  const s = LABELS[status] ?? { label: status, cls: "bg-cream" };
  const label = status === "pending_guardian" && context !== "registration-guardian" ? s.label : statusLabel(status, context);
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${s.cls} ${className}`}>{label}</span>;
}
