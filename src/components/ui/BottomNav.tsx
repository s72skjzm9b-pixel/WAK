"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconKunst, IconMe, IconUpload, IconWakt } from "./Icons";

const ITEMS = [
  { href: "/kunst", label: "KUNST", Icon: IconKunst },
  { href: "/upload", label: "UPLOAD", Icon: IconUpload },
  { href: "/wakt", label: "WAKT", Icon: IconWakt },
  { href: "/min-wak", label: "MIN WAK", Icon: IconMe },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hovedmenu"
      className="fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-cobalt-deep bg-cobalt pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const isUpload = href === "/upload";
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="group flex min-h-16 flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 text-cream"
              >
                <span
                  className={`flex items-center justify-center rounded-full transition-transform ${
                    isUpload
                      ? "size-11 -mt-5 border-[3px] border-cobalt-deep bg-orange text-cobalt-deep shadow-[0_3px_0_0_var(--color-cobalt-deep)] group-active:translate-y-0.5"
                      : active
                        ? "h-8 w-14 bg-lavender text-cobalt"
                        : "h-8 w-14"
                  }`}
                >
                  <Icon className={isUpload ? "size-7" : "size-6"} />
                </span>
                <span className={`font-display text-[13px] font-semibold tracking-wide ${active ? "text-cream" : "text-cream/80"}`}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
