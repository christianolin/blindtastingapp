// `wines.added_via` for a flight add (spec §C.1 table, migration E.3). Pure,
// type-only imports; unit-tested in added-via.test.ts.
import type { AddSource, AddedVia } from "./types";

/**
 * How a glass entered the flight: a scan (a catalog match, a read identity or
 * an incomplete read), a catalog search, a cellar lot, or by hand (typed,
 * finished later, or the unidentified-bottle path). `plusOne` is a cellar-only
 * increment and never becomes a glass, so it has no value.
 */
export function addedVia(source: AddSource): AddedVia | null {
  switch (source.kind) {
    case "catalog":
      return source.via === "scan" ? "SCAN" : "CATALOG";
    case "lot":
      return "CELLAR";
    case "identity":
    case "incomplete":
      return source.via === "scan" ? "SCAN" : "BY_HAND";
    case "unidentified":
      return "BY_HAND";
    case "plusOne":
      return null;
    default: {
      const unknown: never = source;
      throw new Error(`Unknown add source: ${JSON.stringify(unknown)}`);
    }
  }
}
