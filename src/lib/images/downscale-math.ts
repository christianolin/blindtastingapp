// The size rule every new photo upload shares (scan photos spec §4, D1): the
// label scan, the camera capture and ImageUploader (wine photos and tasting
// covers). Pure, with no imports, so vitest and use-camera.ts can load it by a
// relative path. The browser half is downscale.ts.
//
// 1,568 px is a storage choice, not the label reader's limit (Sonnet 5 takes
// 2,576 px): it keeps reads at the fidelity they have had since 2026-09-13 and
// a photo around 300 KB instead of a ~1.6 MB phone original.

export const PHOTO_MAX_EDGE = 1568;
export const PHOTO_JPEG_QUALITY = 0.82;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // mirrors the RPC's 5 MB refusal

export type Size = { width: number; height: number };

function assertSide(value: number, what: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${what} must be a finite number above 0, got ${value}.`);
  }
}

/** The long edge at most `maxEdge`, aspect kept, never upscaled, each side ≥ 1
    (Math.round). Throws RangeError for a side that is not a finite number > 0. */
export function fitWithin(size: Size, maxEdge: number = PHOTO_MAX_EDGE): Size & { scaled: boolean } {
  assertSide(size.width, "width");
  assertSide(size.height, "height");
  assertSide(maxEdge, "maxEdge");
  const long = Math.max(size.width, size.height);
  if (long <= maxEdge) return { width: size.width, height: size.height, scaled: false };
  const scale = maxEdge / long;
  // The long edge is set exactly, so float error can never leave it at 1567.
  const side = (value: number) => (value === long ? maxEdge : Math.max(1, Math.round(value * scale)));
  return { width: side(size.width), height: side(size.height), scaled: true };
}

const JPEG_TYPES = new Set(["image/jpeg", "image/jpg", "image/pjpeg"]);

/** ImageUploader only: upload the original when the decode failed (encodedSize
    null), or when the original is a JPEG that needed no scaling and the
    re-encode is not smaller. */
export function keepOriginal(o: {
  type: string;
  size: number;
  scaled: boolean;
  encodedSize: number | null;
}): boolean {
  if (o.encodedSize === null) return true;
  if (o.scaled) return false;
  return JPEG_TYPES.has(o.type.toLowerCase()) && o.size <= o.encodedSize;
}

/** "jpg" for a re-encoded blob; otherwise the original name's extension,
    lower-cased, [a-z0-9]{1,5}, else "jpg". */
export function uploadExtension(reencoded: boolean, fileName: string): string {
  if (reencoded) return "jpg";
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return "jpg";
  const ext = fileName.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "jpg";
}
