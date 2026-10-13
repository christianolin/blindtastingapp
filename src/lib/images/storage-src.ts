// Which image URLs go through Next's image optimizer (egress cuts, 2026-10-13).
//
// The app's photos live in three PUBLIC Supabase Storage buckets and used to be
// rendered straight from Storage at their stored size: a 60 px Overview
// thumbnail downloaded a full ~1,568 px label scan, and an avatar downloaded
// whatever the user uploaded (avatars are not downscaled at all). Every one of
// those bytes is Supabase egress, and the Free plan's 5 GB ran out.
//
// Routing them through `/_next/image` means Supabase serves each original
// once per optimizer cache entry (next.config.ts's minimumCacheTTL) and the
// browser gets a small WebP sized to the box it is drawn in. Only URLs this
// module recognises are rewritten — blob:/data: previews, local /public files
// and any other host stay plain <img> sources — and next.config.ts builds its
// remotePatterns from the same constants, so a URL the component rewrites is
// always one the optimizer accepts.

/** The public buckets whose objects are photos shown in the app. */
export const OPTIMIZED_BUCKETS = ["wine-images", "avatars", "tasting-images"] as const;

export const PUBLIC_OBJECT_PATH = "/storage/v1/object/public/";

/** The Supabase project's hostname, or null when the URL is unset/invalid. */
export function supabaseHostname(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    const url = new URL(supabaseUrl);
    return url.protocol === "https:" ? url.hostname : null;
  } catch {
    return null;
  }
}

/**
 * True when `src` is a public object in one of OPTIMIZED_BUCKETS on this
 * project's Supabase host — the only URLs the optimizer is configured for.
 */
export function isOptimizableStorageUrl(
  src: string | null | undefined,
  supabaseUrl: string | undefined,
): boolean {
  if (!src) return false;
  const host = supabaseHostname(supabaseUrl);
  if (!host) return false;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.hostname !== host || url.port !== "") return false;
  return OPTIMIZED_BUCKETS.some((bucket) =>
    url.pathname.startsWith(`${PUBLIC_OBJECT_PATH}${bucket}/`),
  );
}

/** next.config.ts's images.remotePatterns entries for those buckets. */
export function storageRemotePatterns(supabaseUrl: string | undefined) {
  const host = supabaseHostname(supabaseUrl);
  if (!host) return [];
  return OPTIMIZED_BUCKETS.map((bucket) => ({
    protocol: "https" as const,
    hostname: host,
    port: "",
    pathname: `${PUBLIC_OBJECT_PATH}${bucket}/**`,
    // `search` omitted on purpose: an avatar URL carries a `?t=` cache-buster
    // (profile/edit/avatar-uploader.tsx), and the optimizer keys its cache on
    // the full URL, so a new upload is a new cache entry.
  }));
}
