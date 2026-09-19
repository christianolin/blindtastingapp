// The wine page's photo strip, pure (scan photos spec §8.1). Relative imports
// only (vitest has no `@/` alias); unit-tested in strip.test.ts.
import type { AttachPhotoStatus } from "./types";

/** Thumbnails shown before the "+N" tile. */
export const STRIP_SHOWN = 8;

const PUBLIC_PREFIX = "/storage/v1/object/public/";

/** The object name inside `bucket` that a Supabase public URL points at — the
    decoded text after `/storage/v1/object/public/<bucket>/`, any `?query`
    dropped. Null for null, another bucket, or not a storage URL. */
export function pathFromPublicUrl(
  url: string | null | undefined,
  bucket = "wine-images",
): string | null {
  if (!url) return null;
  const marker = `${PUBLIC_PREFIX}${bucket}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const raw = url.slice(at + marker.length).split(/[?#]/, 1)[0];
  if (raw === "") return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** A label scan's staging object: `catalog/staging/<uid>/scan-….jpg`, the
    shape add-wine-sheet.tsx uploads and the RPC accepts as a scan. */
export function isScanPath(path: string): boolean {
  return /^catalog\/staging\/[^/]+\/scan-[A-Za-z0-9._-]+\.jpg$/.test(path);
}

type StripRow = { id: string; imagePath: string; createdAt: string };

function newestFirst(a: StripRow, b: StripRow): number {
  const byInstant = (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
  if (byInstant !== 0) return byInstant;
  // Same millisecond: the text still carries Postgres's microseconds.
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/** The strip's photos: every row but the main photo, newest first (created_at,
    then id, descending), the first STRIP_SHOWN shown and the rest counted. */
export function stripPhotos<T extends StripRow>(
  rows: readonly T[],
  mainImageUrl: string | null,
): { photos: T[]; shown: T[]; more: number } {
  const mainPath = pathFromPublicUrl(mainImageUrl);
  const photos = rows.filter((r) => mainPath === null || r.imagePath !== mainPath).sort(newestFirst);
  return {
    photos,
    shown: photos.slice(0, STRIP_SHOWN),
    more: Math.max(0, photos.length - STRIP_SHOWN),
  };
}

export function stripHeading(hasMain: boolean): string {
  return hasMain ? "More photos" : "Photos";
}

export function photoCaption(p: { isOwn: boolean; name: string; isScan: boolean }): string {
  const verb = p.isScan ? "Scanned by" : "Added by";
  return `${verb} ${p.isOwn ? "you" : p.name}`;
}

/** Whether a wine-page upload may also become the wine's main photo. Only the
    statuses attach_catalog_wine_photo returns AFTER its step-7 unrevealed-glass
    check (already-attached, limit, attached) prove the caller has no unrevealed
    glass of this wine; every earlier refusal, and a failed call, never ran that
    check — so it fails closed, and the database refuses it too
    (`catalog_wines_rule1_guard`, 20260919213300). */
export function mayBecomeMainPhoto(status: AttachPhotoStatus): boolean {
  return status === "attached" || status === "already-attached" || status === "limit";
}

/** The line under the wine page's upload button for an attach's status; null
    for no status. */
export function attachNotice(status: AttachPhotoStatus | null): string | null {
  switch (status) {
    case null:
      return null;
    case "attached":
      return "Added to More photos.";
    case "already-attached":
      return "That photo is already on this wine.";
    case "limit":
      return "You have added 12 photos to this wine. Remove one to add another.";
    case "unrevealed-glass":
      return "This wine is in one of your flights that hasn't been revealed yet. Add photos after the reveal.";
    case "too-large":
      return "That photo is too large. Try a smaller one.";
    default:
      return "Couldn't add the photo. Please try again.";
  }
}
