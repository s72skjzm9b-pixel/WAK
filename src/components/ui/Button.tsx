import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "orange" | "lavender" | "ghost" | "danger" | "cream";
type Size = "md" | "lg" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-display font-semibold select-none transition-transform duration-150 active:translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none";
const variants: Record<Variant, string> = {
  primary: "bg-cobalt text-cream shadow-[3px_4px_0_0_var(--color-orange)] hover:-translate-y-0.5",
  orange: "bg-orange text-cobalt-deep shadow-sticker hover:-translate-y-0.5",
  lavender: "bg-lavender text-cobalt shadow-sticker-sm hover:-translate-y-0.5",
  cream: "bg-cream text-cobalt shadow-[3px_4px_0_0_var(--color-orange)] hover:-translate-y-0.5",
  ghost: "bg-transparent text-cobalt border-2 border-cobalt hover:bg-cobalt/5",
  danger: "bg-paper text-danger border-2 border-danger hover:bg-danger/5",
};
const sizes: Record<Size, string> = {
  sm: "min-h-10 px-4 text-base",
  md: "min-h-12 px-6 text-lg",
  lg: "min-h-14 px-8 text-xl",
};

export const buttonClass = (variant: Variant = "primary", size: Size = "md", extra = "") =>
  `${base} ${variants[variant]} ${sizes[size]} ${extra}`;

export function Button({ variant = "primary", size = "md", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
