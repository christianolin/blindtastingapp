// The scan's one follow-up lookup (owner fix C, 2026-09-19; spec
// docs/superpowers/specs/2026-09-19-scan-region-appellation.md §6.3): its prompt,
// its structured-output schema, and the pure helpers around them. Pure: zod and
// relative imports only, so vitest, the server call and the orchestration all
// load it. The call itself is appellation-lookup.ts (server-only).
import { z } from "zod";
import type { WineColour, WineStyle } from "../wine-identity/types";

/** At most this many appellation names go into one lookup. A region with more
    (today only Bourgogne, 1,364) is never looked up: a truncated list could leave
    out the right answer while the prompt forces a pick from the list, and a
    Burgundy label prints its AOC by law, so a gap there is a read miss a text
    lookup cannot cure. label_lookups.candidates carries the same bound. */
export const APPELLATION_LOOKUP_LIST_CAP = 300;

/** What the lookup is told: the resolver's names, the label's own text, and our
    own list of the region's appellations (spec §6.2). */
export type AppellationLookupFacts = {
  producer: string | null;        // draft.producer?.name (our row's name when existing)
  wineName: string | null;        // read.wineName
  grapes: string[];               // the normalised draft blend's grape names, blend order
  colour: WineColour | null;      // read.colour
  style: WineStyle | null;        // read.style (FORTIFIED for TAWNY)
  country: string;                // the resolved country's name
  region: string;                 // the resolved region's name
  labelText: string;              // read.rawText (≤ 2,000 chars after coerceLabelRead)
  appellations: string[];         // every appellation name of that region, appellationsInRegion order
};

export type LookupUsage = { input_tokens: number; output_tokens: number };

export type AppellationLookupOutcome =
  // billed, parsed: the answer is a trimmed name or null ("not confident")
  | { ok: true; answer: string | null; model: string; usage: LookupUsage }
  // billed: a refusal, a max_tokens stop or an unparsed output
  | { ok: false; reason: "not-read"; model: string; usage: LookupUsage }
  // thrown: no response, no usage
  | { ok: false; reason: "timeout" | "busy" | "network" | "rejected" | "service"; model: string; usage: null }
  // a replayed read (LABEL_READ_FIXTURE) with no LABEL_LOOKUP_FIXTURE: nothing was called
  | { ok: false; reason: "skipped"; model: null; usage: null };

export const APPELLATION_LOOKUP_PROMPT =
  "The JSON above describes one wine bottle photographed for a cellar app: what its label reader resolved, " +
  "and the label's own text. The label printed no appellation the app could match. " +
  "Name the one appellation from `appellations` — every appellation the app holds for this wine's region — " +
  "that this specific wine is sold under, using what you know about this producer and this wine. " +
  "A wine sold under a regional classification with no narrower denomination (a Vino de la Tierra, an IGP or IGT, " +
  "a regional GI) takes the entry named like the region itself. " +
  "Copy the name exactly as the list spells it. " +
  "Return null unless you are confident this wine carries that appellation: what the producer's other wines carry, " +
  "or what is common in the region or for the grape, is not enough.";

export const AppellationLookupSchema = z.object({
  appellation: z.string().nullable().describe(
    "One name copied exactly from the appellations list, or null when you are not confident this wine carries it.",
  ),
});

/** The one user text block: the data first and the instruction last, because the
    list can be long. The facts are re-laid in a fixed key order, so the text is
    deterministic whatever order the caller built them in. */
export function appellationLookupText(facts: AppellationLookupFacts): string {
  const ordered: AppellationLookupFacts = {
    producer: facts.producer,
    wineName: facts.wineName,
    grapes: facts.grapes,
    colour: facts.colour,
    style: facts.style,
    country: facts.country,
    region: facts.region,
    labelText: facts.labelText,
    appellations: facts.appellations,
  };
  return `Facts (JSON):\n${JSON.stringify(ordered)}\n\n${APPELLATION_LOOKUP_PROMPT}`;
}

/** The answer in a parsed output: the trimmed name, or null for null, a blank, a
    missing key or anything that is not a string. Never throws. */
export function coerceLookupAnswer(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const value = (raw as { appellation?: unknown }).appellation;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The structured-output format's `parse`, which never throws (the label reader's
 * `labelReadFormat` pattern, extract.ts). A JSON object whose `appellation` is a
 * string or null is handed on as it came; anything else — invalid or truncated
 * JSON, a refusal's text, another shape — parses to null, which the call reports
 * as a billed `not-read`.
 */
export function parseLookupOutput(content: string): unknown {
  try {
    const value: unknown = JSON.parse(content);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const answer = (value as { appellation?: unknown }).appellation;
    return typeof answer === "string" || answer === null ? value : null;
  } catch {
    return null;
  }
}
