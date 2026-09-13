// "Just the region" (spec §C.5 A7, §D.4 #8; byhand-5, RC5): a region's
// self-named appellation, plus the appellation field's placeholder and hint.
// The add-wine sheet's by-hand form and WineIdentityFields share it.
//
// Pure: relative imports only, so vitest (no `@/` alias) and the client can both
// load it. The server half is `regionSelfNamedAppellation` in ./by-hand-actions.ts,
// which hands `findSelfNamedAppellation` a targeted, paged prefix query — never a
// limit-25 search, where a crowd of earlier-sorting names can push the row out.
import { foldName, stripDesignationSuffix } from "../../lib/wine-identity/fold";

type Option = { id: string; name: string };

/** PostgREST silently caps one read at 1000 rows. */
const DEFAULT_PAGE_SIZE = 1000;

const HINT =
  "Ordered by the region above when there is one; a plain list when there is not. Nothing is selected for you.";

/**
 * The region's own appellation among `rows`: the one whose name, minus at most
 * one designation suffix, folds equal to the region's name — "Bourgogne AOC" for
 * Bourgogne, never "Bourgogne Aligoté AOC". The first such row in the given order
 * wins. Null when there is none.
 */
export function justTheRegionOption(region: Option, rows: readonly Option[]): Option | null {
  const target = foldName(region.name);
  if (target === "") return null;
  const hit = rows.find((row) => foldName(stripDesignationSuffix(row.name)) === target);
  return hit ? { id: hit.id, name: hit.name } : null;
}

/**
 * Reads `fetchPage(from, to)` (inclusive bounds, like PostgREST's `range`) page by
 * page until a short page, then picks with `justTheRegionOption`. A page longer
 * than requested means the fetcher does not page, so it is treated as the last.
 */
export async function findSelfNamedAppellation(
  region: Option,
  fetchPage: (from: number, to: number) => Promise<Option[]>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<Option | null> {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  const rows: Option[] = [];
  for (let from = 0; ; from += size) {
    const page = await fetchPage(from, from + size - 1);
    rows.push(...page);
    if (page.length !== size) break;
  }
  return justTheRegionOption(region, rows);
}

/** "Just the region" when the region has a self-named appellation, otherwise "Pick one". */
export function appellationPlaceholder(hasSelfNamed: boolean): string {
  return hasSelfNamed ? "Just the region" : "Pick one";
}

/** The note under the appellation field. A chosen region with no self-named
    appellation adds a sentence naming it. */
export function appellationHint(regionName: string | null, hasSelfNamed: boolean): string {
  const region = regionName?.trim();
  if (!region || hasSelfNamed) return HINT;
  return `${HINT} ${region} has no region-wide appellation — pick the one on the label.`;
}

/** Escapes LIKE's wildcards and its escape character (`\`, `%`, `_`), so a name
    is matched literally inside an `ilike` pattern. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
