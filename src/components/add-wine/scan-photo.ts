// Which catalog wine a scanned bottle's photo joins (scan photos spec §5, D3).
// Pure, relative imports only (vitest has no `@/` alias); unit-tested in
// scan-photo.test.ts. use-sheet-adds.ts calls it where an add lands.
import type { ScanVia } from "../../lib/catalog-photos/types";
import { isScanPath } from "../../lib/catalog-photos/strip";

/** `via` is where the add landed. The database keeps a "cellar" scan exactly
    as private as the photographer's cellar (spec §3.1), so a cellar add must
    never be reported as anything else. */
export type ScanPhotoTarget = { catalogWineId: string; imagePath: string; via: ScanVia };

/** Where an add landed that keeps its scan. An allow-list: a flight never does
    (the owner's rule — a photo must never hint at tonight's flight). */
const ATTACHES: ReadonlySet<string> = new Set<ScanVia>(["catalog", "cellar", "note"]);

function isScanVia(destination: string): destination is ScanVia {
  return ATTACHES.has(destination);
}

/** The catalog wine a scanned bottle's photo joins once its add has landed, or
    null. An allow-list: cellar, catalog and note attach, each as its own
    `via`; flight and anything added later do not. The path must be a staging
    scan (catalog/staging/<id>/scan-….jpg). */
export function scanPhotoTarget(
  landed: { destination: string; catalogWineId: string | null },
  imagePath: string | null,
): ScanPhotoTarget | null {
  const via = landed.destination;
  if (!isScanVia(via)) return null;
  if (!landed.catalogWineId || !imagePath || !isScanPath(imagePath)) return null;
  return { catalogWineId: landed.catalogWineId, imagePath, via };
}
