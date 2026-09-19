// The browser half of the shared photo size rule (scan photos spec §4, D1):
// decode (EXIF orientation applied), fit within PHOTO_MAX_EDGE, paint on white,
// re-encode as a JPEG at PHOTO_JPEG_QUALITY. Two entry points:
//
// - `toScanJpeg`: every photo sent to the label reader. Always a JPEG (the
//   reader needs one and the staging path ends `.jpg`), which also turns HEIC,
//   HEIF, AVIF, GIF and WebP picks into a format the API accepts. A photo the
//   browser cannot decode throws ImageDecodeError: the sheet's failed row.
// - `prepareUpload`: ImageUploader (wine photos, tasting covers). Never throws:
//   a photo it cannot decode is uploaded as it came, and so is a JPEG already
//   within the limit that the re-encode would not shrink (`keepOriginal`).
//
// Browser-only when called (createImageBitmap, canvas). Nothing browser-only
// runs at module load.
import {
  PHOTO_JPEG_QUALITY,
  PHOTO_MAX_EDGE,
  fitWithin,
  keepOriginal,
  uploadExtension,
} from "./downscale-math";

/** The photo could not be decoded or re-encoded (for example HEIC in a browser
    that cannot decode it). In the add-wine sheet the item becomes the inline
    failed row (spec §C.4), never a modal. */
export class ImageDecodeError extends Error {}

async function encodeJpeg(file: Blob): Promise<{ blob: Blob; scaled: boolean }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageDecodeError("This photo could not be decoded.");
  }
  try {
    if (!bitmap.width || !bitmap.height) {
      throw new ImageDecodeError("This photo has no pixels to read.");
    }
    const size = fitWithin({ width: bitmap.width, height: bitmap.height }, PHOTO_MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageDecodeError("This photo could not be redrawn.");
    // JPEG has no alpha channel: paint white first, so the dark text of a
    // transparent PNG label does not end up on black.
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", PHOTO_JPEG_QUALITY),
    );
    if (!blob) throw new ImageDecodeError("This photo could not be re-encoded.");
    return { blob, scaled: size.scaled };
  } finally {
    bitmap.close();
  }
}

/** A label scan, ready for the reader: always a JPEG within PHOTO_MAX_EDGE.
    Throws ImageDecodeError when the browser cannot decode or re-encode it. */
export async function toScanJpeg(file: Blob): Promise<Blob> {
  return (await encodeJpeg(file)).blob;
}

export type PreparedUpload = { blob: Blob; contentType: string; extension: string };

/** ImageUploader's upload body. Never throws: the original file is the fallback. */
export async function prepareUpload(file: File): Promise<PreparedUpload> {
  let encoded: { blob: Blob; scaled: boolean } | null = null;
  try {
    encoded = await encodeJpeg(file);
  } catch (error) {
    if (!(error instanceof ImageDecodeError)) {
      console.error("image upload: the photo could not be resized", error instanceof Error ? error.message : typeof error);
    }
  }
  const keep = keepOriginal({
    type: file.type,
    size: file.size,
    scaled: encoded?.scaled ?? false,
    encodedSize: encoded?.blob.size ?? null,
  });
  if (keep || encoded === null) {
    return {
      blob: file,
      contentType: file.type || "application/octet-stream",
      extension: uploadExtension(false, file.name),
    };
  }
  return { blob: encoded.blob, contentType: "image/jpeg", extension: uploadExtension(true, file.name) };
}
