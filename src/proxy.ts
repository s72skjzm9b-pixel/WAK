import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|icons/|icon.png|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
