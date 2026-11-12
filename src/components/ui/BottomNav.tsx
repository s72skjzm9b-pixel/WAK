"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCamera, IconKunst, IconMe, IconWakt } from "./Icons";

const ITEMS = [
  { href: "/kunst", label: "KUNST", Icon: IconKunst },
  { href: "/upload", label: "UPLOAD", Icon: IconCamera },
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
                      ? `h-8 w-14 bg-orange text-cobalt-deep group-active:scale-95 ${active ? "ring-[3px] ring-cream" : ""}`
                      : active
                        ? "h-8 w-14 bg-lavender text-cobalt"
                        : "h-8 w-14"
                  }`}
                >
                  <Icon className="size-6" />
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
