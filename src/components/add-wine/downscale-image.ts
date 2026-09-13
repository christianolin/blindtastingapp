// Every photo sent to the label reader is re-encoded here first (spec §A.4,
// ledger D1). The long edge is capped at READ_MAX_SIDE and the result is
// always a JPEG, which also turns HEIC, HEIF, AVIF, GIF and WebP picks into a
// format the API accepts. The sheet runs it for every source before uploading:
// a camera capture (already at most 1600 px, so a cheap pass), a Library pick
// and a laptop upload alike.
//
// Browser-only when called (createImageBitmap, canvas). Nothing browser-only
// runs at module load, so use-camera.ts can import READ_MAX_SIDE anywhere.

export const READ_MAX_SIDE = 1600; // use-camera.ts MAX_SIDE imports this

/** The photo could not be decoded or re-encoded (for example HEIC in a browser
    that cannot decode it). The item becomes the inline failed row (spec §C.4),
    never a modal. */
export class ImageDecodeError extends Error {}

const JPEG_QUALITY = 0.85;

export async function downscaleForRead(file: Blob): Promise<Blob> {
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
    const scale = Math.min(1, READ_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageDecodeError("This photo could not be redrawn.");
    // JPEG has no alpha channel: paint white first, so the dark text of a
    // transparent PNG label does not end up on black.
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new ImageDecodeError("This photo could not be re-encoded.");
    return blob;
  } finally {
    bitmap.close();
  }
}
