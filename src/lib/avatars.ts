export const AVATAR_STICKERS = [
  { id: "can", label: "Dåsen", src: "/brand/sticker-can.png" },
  { id: "eyes", label: "Øjnene", src: "/brand/sticker-eyes.png" },
  { id: "peace", label: "Peace", src: "/brand/sticker-peace.png" },
  { id: "star", label: "Stjernen", src: "/brand/sticker-star.png" },
  { id: "mascot", label: "Løberen", src: "/brand/mascot.png" },
  { id: "wak", label: "W.A.K", src: "/brand/sticker-wak.png" },
] as const;

export const AVATAR_COLORS = [
  { id: "lavender", label: "Lavendel", className: "bg-lavender" },
  { id: "orange", label: "Orange", className: "bg-orange" },
  { id: "cobalt", label: "Kobolt", className: "bg-cobalt" },
  { id: "cream", label: "Creme", className: "bg-cream" },
] as const;

export const AVATAR_PATTERN = /^(can|eyes|peace|star|mascot|wak):(cobalt|orange|cream|lavender)$/;

export function parseAvatar(value: string | null | undefined) {
  const [s, c] = (value && AVATAR_PATTERN.test(value) ? value : "can:lavender").split(":");
  const sticker = AVATAR_STICKERS.find((x) => x.id === s) ?? AVATAR_STICKERS[0];
  const color = AVATAR_COLORS.find((x) => x.id === c) ?? AVATAR_COLORS[0];
  return { sticker, color };
}

export const EMOJIS = ["❤️", "🔥", "😮", "👀", "😂", "🤯", "🌀"] as const;
