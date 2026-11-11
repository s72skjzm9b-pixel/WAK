// Sample content for the style guide only (no real members, no real data).
import { blobPath } from "@/components/ui/Blob";

const C = { cobalt: "#1015B9", orange: "#FF6500", cream: "#FFF7E9", lav: "#C8B4EB", ink: "#0B0F6B", pink: "#FF9EC4", green: "#2BB673" };

function svg(w: number, h: number, body: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`;
}

/** Abstract placeholder "artworks" drawn as SVG. */
type SampleArt = { title: string | null; nickname: string; avatar: string; w: number; h: number; counts: Record<string, number>; src: string };

export const SAMPLE_ART: SampleArt[] = [
  { title: "Bananen der drømte", nickname: "Blå Banan", avatar: "can:orange", w: 600, h: 760, counts: { "🔥": 4, "🌀": 2 },
    src: svg(600, 760, `<rect width="600" height="760" fill="${C.lav}"/><path d="${blobPath(7, 0.12)}" transform="translate(80 160) scale(2.2)" fill="${C.orange}"/><circle cx="300" cy="380" r="70" fill="${C.cream}"/><circle cx="300" cy="380" r="28" fill="${C.ink}"/>`) },
  { title: "Gadens øje", nickname: "Spiralpigen", avatar: "eyes:lavender", w: 600, h: 600, counts: { "👀": 6, "😮": 1 },
    src: svg(600, 600, `<rect width="600" height="600" fill="${C.cobalt}"/>${[0, 1, 2, 3, 4].map((i) => `<circle cx="300" cy="300" r="${260 - i * 50}" fill="none" stroke="${i % 2 ? C.orange : C.cream}" stroke-width="22"/>`).join("")}`) },
  { title: "Weird stol", nickname: "Monster Mo", avatar: "mascot:cream", w: 600, h: 480, counts: { "😂": 3 },
    src: svg(600, 480, `<rect width="600" height="480" fill="${C.cream}"/><rect x="150" y="120" width="300" height="200" rx="40" fill="${C.green}"/><rect x="170" y="310" width="30" height="130" fill="${C.ink}"/><rect x="400" y="310" width="30" height="130" fill="${C.ink}"/><circle cx="250" cy="200" r="20" fill="${C.cream}"/><circle cx="350" cy="200" r="20" fill="${C.cream}"/>`) },
  { title: "Lyd i farver", nickname: "Ziggy", avatar: "star:cobalt", w: 600, h: 820, counts: { "🤯": 5, "❤️": 2 },
    src: svg(600, 820, `<rect width="600" height="820" fill="${C.orange}"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${40 + i * 75}" y="${400 - (i % 3) * 110}" width="50" height="${200 + (i % 3) * 220}" rx="25" fill="${i % 2 ? C.cobalt : C.lav}"/>`).join("")}`) },
  { title: null, nickname: "Pip", avatar: "peace:lavender", w: 600, h: 600, counts: {},
    src: svg(600, 600, `<rect width="600" height="600" fill="${C.pink}"/><path d="${blobPath(5, 0.18, 20)}" transform="translate(70 70) scale(2.3)" fill="${C.cobalt}"/><path d="M200 300 Q300 180 400 300 T600 300" stroke="${C.cream}" stroke-width="18" fill="none"/>`) },
  { title: "Murens hemmelighed", nickname: "Kasper K", avatar: "wak:orange", w: 600, h: 700, counts: { "❤️": 7 },
    src: svg(600, 700, `<rect width="600" height="700" fill="#9a8f86"/>${Array.from({ length: 10 }, (_, r) => Array.from({ length: 5 }, (_, c) => `<rect x="${c * 130 - (r % 2) * 60}" y="${r * 70}" width="120" height="60" fill="#b3a79c"/>`).join("")).join("")}<circle cx="300" cy="330" r="150" fill="${C.lav}"/><text x="300" y="360" font-family="Arial" font-weight="bold" font-size="90" text-anchor="middle" fill="${C.cobalt}">WOW</text>`) },
];

const inDays = (d: number, h = 10) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  x.setHours(h, 0, 0, 0);
  return x.toISOString();
};

export const SAMPLE_EVENTS = [
  { id: "00000000-0000-0000-0000-000000000001", title: "WAKT #01 · Copenhagen", description: "", starts_at: inDays(18), ends_at: inDays(18, 14), meeting_point: "Foran Statens Museum for Kunst", address: null, cover_path: null, organizer_name: "Mette", organizer_email: null, organizer_phone: null, capacity: 20, registration_deadline: inDays(15), practical_info: null, status: "published" as const },
  { id: "00000000-0000-0000-0000-000000000002", title: "WAKT #02 · Aarhus gadekunst", description: "", starts_at: inDays(32), ends_at: inDays(32, 15), meeting_point: "Godsbanen", address: null, cover_path: null, organizer_name: "Ali", organizer_email: null, organizer_phone: null, capacity: 15, registration_deadline: inDays(28), practical_info: null, status: "published" as const },
  { id: "00000000-0000-0000-0000-000000000003", title: "WAKT #03 · Malmö", description: "", starts_at: inDays(60), ends_at: inDays(60, 16), meeting_point: "Malmö C, under uret", address: null, cover_path: null, organizer_name: "Sofie", organizer_email: null, organizer_phone: null, capacity: 12, registration_deadline: inDays(55), practical_info: null, status: "published" as const },
];
