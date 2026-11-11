// Extracts web-ready brand assets from the supplied WAK reference images in
// design/references/. Run with: npm run brand:extract
//
// The logo badge is used directly (background made transparent). The wordmark,
// mascot and stickers are cropped from the supplied moodboards. These are
// raster crops — replace them with the original vector files when available
// (see design/README.md).
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const REF = "design/references";
const OUT = "public/brand";
await mkdir(OUT, { recursive: true });
await mkdir("public/icons", { recursive: true });

const COBALT = [16, 21, 185];
const CREAM = [255, 247, 233];

async function raw(file, region) {
  let img = sharp(file).removeAlpha();
  if (region) img = img.extract(region);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Flood-fill the background from every border pixel; returns a mask (1 = bg). */
function floodBackground({ data, w, h }, isBg) {
  const mask = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (mask[i]) return;
    const p = i * 3;
    if (!isBg(data[p], data[p + 1], data[p + 2])) return;
    mask[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return mask;
}

/** Keep only the largest connected foreground shape (drops neighbour fragments). */
function keepLargest(mask, w, h) {
  const label = new Int32Array(w * h);
  let best = 0, bestSize = 0, next = 0;
  for (let s = 0; s < w * h; s++) {
    if (mask[s] || label[s]) continue;
    next++;
    let size = 0;
    const stack = [s];
    label[s] = next;
    while (stack.length) {
      const i = stack.pop();
      size++;
      const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && !mask[j] && !label[j]) { label[j] = next; stack.push(j); }
      }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }
  for (let i = 0; i < w * h; i++) if (!mask[i] && label[i] !== best) mask[i] = 1;
  return mask;
}

/** Turn an RGB buffer + bg mask into RGBA with soft edges next to the bg. */
function cutout(img, mask, edgeAlpha) {
  const { data, w, h } = img;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const p = i * 3, o = i * 4;
    out[o] = data[p]; out[o + 1] = data[p + 1]; out[o + 2] = data[p + 2];
    if (mask[i]) { out[o + 3] = 0; continue; }
    const x = i % w, y = (i / w) | 0;
    const nearBg =
      (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) ||
      (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w]);
    out[o + 3] = nearBg ? edgeAlpha(data[p], data[p + 1], data[p + 2]) : 255;
  }
  return out;
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

async function save(rgba, w, h, name, size) {
  let img = sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 0 });
  if (size) img = img.resize({ width: size, withoutEnlargement: true });
  await img.png({ compressionLevel: 9 }).toFile(`${OUT}/${name}.png`);
  console.log("wrote", `${OUT}/${name}.png`);
}

// 1) Logo badge — used directly, cream surround removed.
{
  const img = await raw(`${REF}/wak-logo-badge.png`);
  const mask = floodBackground(img, (r, g, b) => r > 225 && g > 220 && b > 210);
  // Edge pixels blend cream→cobalt; estimate alpha from the red channel.
  const rgba = cutout(img, mask, (r) => clamp(((251 - r) / (251 - COBALT[0])) * 255));
  await save(rgba, img.w, img.h, "wak-badge", 1000);
}

// 2) Wordmark (blue on cream) → alpha-extracted, recoloured cobalt + cream.
{
  const region = { left: 40, top: 545, width: 410, height: 190 };
  const img = await raw(`${REF}/wak-moodboard-brand.png`, region);
  const bgR = img.data[0];
  for (const [name, color] of [["wak-wordmark", COBALT], ["wak-wordmark-cream", CREAM]]) {
    const out = Buffer.alloc(img.w * img.h * 4);
    for (let i = 0; i < img.w * img.h; i++) {
      const a = clamp(((bgR - img.data[i * 3]) / (bgR - COBALT[0])) * 255);
      out.set([...color, a < 12 ? 0 : a], i * 4);
    }
    await save(out, img.w, img.h, name);
  }
  // Letters only (W.A.K) without the tagline.
  const top = { left: 40, top: 545, width: 410, height: 120 };
  const t = await raw(`${REF}/wak-moodboard-brand.png`, top);
  for (const [name, color] of [["wak-letters", COBALT], ["wak-letters-cream", CREAM]]) {
    const out = Buffer.alloc(t.w * t.h * 4);
    for (let i = 0; i < t.w * t.h; i++) {
      const a = clamp(((bgR - t.data[i * 3]) / (bgR - COBALT[0])) * 255);
      out.set([...color, a < 12 ? 0 : a], i * 4);
    }
    await save(out, t.w, t.h, name);
  }
}

// 3) Stickers from the sticker sheet (white sticker border on cream paper).
const isPaper = (r, g, b) => r >= 240 && g >= 232 && b >= 218 && b <= 240 && r - b >= 9;
const paperEdge = (r, g, b) => clamp(((b - 231) / (250 - 231)) * 255);
const stickers = {
  "sticker-can": { left: 458, top: 4, width: 134, height: 124 },
  "sticker-wak": { left: 603, top: 30, width: 214, height: 114 },
  "sticker-eyes": { left: 448, top: 148, width: 94, height: 80 },
  "sticker-star": { left: 558, top: 138, width: 120, height: 114 },
  "sticker-peace": { left: 698, top: 138, width: 94, height: 114 },
  "sticker-weird-art-klub": { left: 443, top: 248, width: 114, height: 124 },
  "mascot": { left: 578, top: 253, width: 164, height: 124 },
};
for (const [name, region] of Object.entries(stickers)) {
  const img = await raw(`${REF}/wak-moodboard-brand.png`, region);
  const bg = floodBackground(img, isPaper);
  // The lettering sticker is several separate shapes, so keep all of them.
  const mask = name === "sticker-weird-art-klub" ? bg : keepLargest(bg, img.w, img.h);
  await save(cutout(img, mask, paperEdge), img.w, img.h, name);
}

// 4) PWA / favicon icons from the badge.
const badge = sharp(`${OUT}/wak-badge.png`);
for (const size of [192, 512]) {
  await sharp({ create: { width: size, height: size, channels: 4, background: "#FFF7E9" } })
    .composite([{ input: await badge.clone().resize(Math.round(size * 0.9)).toBuffer(), gravity: "centre" }])
    .png().toFile(`public/icons/icon-${size}.png`);
  // Maskable: badge inside the 80% safe zone.
  await sharp({ create: { width: size, height: size, channels: 4, background: "#FFF7E9" } })
    .composite([{ input: await badge.clone().resize(Math.round(size * 0.72)).toBuffer(), gravity: "centre" }])
    .png().toFile(`public/icons/maskable-${size}.png`);
}
await sharp({ create: { width: 180, height: 180, channels: 4, background: "#FFF7E9" } })
  .composite([{ input: await badge.clone().resize(162).toBuffer(), gravity: "centre" }])
  .png().toFile("public/icons/apple-touch-icon.png");
await badge.clone().resize(48).png().toFile("src/app/icon.png");
console.log("icons done");
