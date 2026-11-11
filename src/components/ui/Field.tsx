import type { ComponentProps, ReactNode } from "react";

export const inputClass =
  "w-full min-h-13 rounded-2xl border-[2.5px] border-cobalt bg-paper px-4 py-3 text-lg text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-4 focus:ring-orange/40";

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-display text-lg font-semibold text-cobalt">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-sm text-ink-soft">{hint}</p>}
      {error && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${inputClass} min-h-28 resize-y ${props.className ?? ""}`} />;
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-cobalt/20 bg-paper p-4 has-[:checked]:border-cobalt has-[:checked]:bg-lavender-soft">
      <input type="checkbox" {...props} className="mt-1 size-6 shrink-0 accent-cobalt" />
      <span className="text-base leading-snug">{label}</span>
    </label>
  );
}
