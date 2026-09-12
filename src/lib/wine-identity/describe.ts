// The only place completeness wording is built (spec §B.3), plus the read
// display line (spec §A.5). Pure: relative imports only.
import { emptyDraft, missingWineFields, normaliseDraft } from "./complete";
import { DESIGNATION_SUFFIXES, foldName } from "./fold";
import type { WineFieldKey, WineIdentityDraft } from "./types";

export type DisplayNames = {
  producer: string | null;
  appellation: string | null;
  region: string | null;
  country: string | null;
  primaryGrape: string | null;
};

const NOUNS: Record<WineFieldKey, { article: "a" | "an"; noun: string }> = {
  producer: { article: "a", noun: "producer" },
  vintage: { article: "a", noun: "vintage" },
  colour: { article: "a", noun: "colour" },
  style: { article: "a", noun: "style" },
  country: { article: "a", noun: "country" },
  region: { article: "a", noun: "region" },
  appellation: { article: "an", noun: "appellation" },
  primaryGrape: { article: "a", noun: "grape" },
};

// Known keys only, each once, in the order given. Stored lists come from jsonb,
// so an unknown key is dropped rather than printed as "undefined".
function knownFields(fields: readonly WineFieldKey[]): WineFieldKey[] {
  const out: WineFieldKey[] = [];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(NOUNS, field) && !out.includes(field)) out.push(field);
  }
  return out;
}

// "x", "x and y", "x, y and z" (no serial comma).
function joinList(items: string[], conjunction: "and" | "or"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}

/** "needs a vintage", "needs a producer, a vintage and a grape"; "" for none. */
export function describeMissing(fields: readonly WineFieldKey[]): string {
  const known = knownFields(fields);
  if (known.length === 0) return "";
  return `needs ${joinList(known.map((f) => `${NOUNS[f].article} ${NOUNS[f].noun}`), "and")}`;
}

/** "no vintage read", "no producer, vintage or grape read"; "" for none. */
export function describeUnread(fields: readonly WineFieldKey[]): string {
  const known = knownFields(fields);
  if (known.length === 0) return "";
  return `no ${joinList(known.map((f) => NOUNS[f].noun), "or")} read`;
}

/** "2018", "NV", "20 years"; "" whenever the vintage is not complete (§B.3). */
export function vintageLabel(v: WineIdentityDraft["vintage"], opts: { now?: Date } = {}): string {
  if (missingWineFields({ ...emptyDraft(), vintage: v }, { now: opts.now }).includes("vintage")) return "";
  switch (v.kind) {
    case "YEAR": return String(v.year);
    case "NV": return "NV";
    case "TAWNY": return v.tawnyYears === 1 ? "1 year" : `${v.tawnyYears} years`;
    default: return "";
  }
}

function clean(s: string | null | undefined): string | null {
  const trimmed = s?.trim();
  return trimmed ? trimmed : null;
}

const DESIGNATION_SET = new Set(DESIGNATION_SUFFIXES);

// Drops one trailing word whose foldName is a designation, keeping the original
// casing: "Barbaresco DOCG" → "Barbaresco". A lone word is kept.
function withoutDesignation(name: string | null): string | null {
  const trimmed = clean(name);
  if (!trimmed) return null;
  const match = /^(.*\S)\s+(\S+)$/.exec(trimmed);
  return match && DESIGNATION_SET.has(foldName(match[2])) ? match[1] : trimmed;
}

/** The confirm screen's title and meta lines (spec §A.5). Meta uses only the
    resolved names, never raw read text (scan-3). */
export function readDisplay(
  draft: WineIdentityDraft,
  names: DisplayNames,
): { title: string; meta: string; newProducer: boolean } {
  const d = normaliseDraft(draft);
  const producer = clean(names.producer) ?? clean(d.producer?.name);
  const wine = [d.wineName ?? withoutDesignation(names.appellation), vintageLabel(d.vintage)]
    .filter(Boolean)
    .join(" ");
  const title = [producer, wine].filter(Boolean).join(", ");
  const meta = [names.appellation, names.region, names.country, names.primaryGrape]
    .map(clean)
    .filter(Boolean)
    .join(" · ");
  return { title, meta, newProducer: d.producer?.kind === "pending" };
}
