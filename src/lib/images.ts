import "server-only";
import sharp, { type Metadata } from "sharp";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // keep under hosting body limits
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif", "gif"]);

export class ImageError extends Error {}

/**
 * Decodes, validates and re-encodes an uploaded image.
 * Re-encoding with sharp drops ALL metadata (EXIF, GPS location, camera
 * serials) because we never call .withMetadata(). Orientation is applied
 * first so photos are not sideways.
 */
export async function processArtworkImage(input: Buffer) {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new ImageError("too_big");
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new ImageError("not_image");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new ImageError("not_image");
  if (!meta.width || !meta.height || meta.width < 64 || meta.height < 64) throw new ImageError("too_small");

  const base = sharp(input, { limitInputPixels: 50_000_000, animated: false, failOn: "error" }).rotate();
  const { data: image, info } = await base
    .clone()
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base
    .clone()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 76 })
    .toBuffer();
  return { image, thumb, width: info.width, height: info.height };
}

export async function processCoverImage(input: Buffer) {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new ImageError("too_big");
  try {
    return await sharp(input, { limitInputPixels: 50_000_000, failOn: "error" })
      .rotate()
      .resize({ width: 1400, height: 900, fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new ImageError("not_image");
  }
}
