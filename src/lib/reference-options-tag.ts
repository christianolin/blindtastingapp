import "server-only";

import { revalidateTag } from "next/cache";

// The cache tag on tasting-request-cache.ts's shared countries/regions/grapes
// lists. Its own module so the write paths can expire it without importing
// the read side (and its admin client).
export const REFERENCE_OPTIONS_TAG = "reference-options";

/**
 * Expire the shared reference lists after a country, region or grape is
 * created, so the next guess form lists it at once. Never throws: outside a
 * server action or route handler revalidateTag refuses, and then the list
 * simply catches up within REFERENCE_OPTIONS_TTL_S.
 */
export function invalidateReferenceOptions(): void {
  try {
    revalidateTag(REFERENCE_OPTIONS_TAG, { expire: 0 });
  } catch (error) {
    console.error("Reference options: could not expire the shared cache", error);
  }
}
