import Image from "next/image";
import { parseAvatar } from "@/lib/avatars";

const SIZES = { sm: "size-9 p-1", md: "size-14 p-1.5", lg: "size-28 p-3", xl: "size-36 p-4" };

/** Illustrated avatar: a brand sticker on a coloured blob. Never a photo. */
export function Avatar({ value, size = "md", className = "" }: { value: string | null | undefined; size?: keyof typeof SIZES; className?: string }) {
  const { sticker, color } = parseAvatar(value);
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 border-cobalt ${color.className} ${SIZES[size]} ${className}`}>
      <Image src={sticker.src} alt="" width={120} height={120} className="h-full w-full object-contain" />
    </span>
  );
}
