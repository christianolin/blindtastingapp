import type { RevealKey } from "./reveal-rows-math";

// "This glass" facts (B6; D15 reveal-8, answered in B0; HOST-21, HOST-22,
// REVEAL-12), shared by the host console (BT-H2) and the participants' reveal
// rail (BT-R1). Only a type import, so vitest loads it without the `@/` alias.

/** One guess row on the glass — only the columns the facts read. */
export type FactRow = {
  participant_id: string;
  primary_grape_id: string | null;
  appellation_id: string | null;
  locked_at: string | null;
  scored_at: string | null;
};

type Fact = { label: string; value: string };

/**
 * What the table did on this glass, from categories already revealed to
 * everyone — never earlier, so no count gives an answer away (rule 1). Counted
 * over eligible participants whose row is locked in or already scored: an
 * unlocked draft can still change, so it is not a fact yet. "of n" is every
 * eligible participant, with or without a row.
 *
 * - "Got the grape k of n" once `grapes` is revealed.
 * - "Got the appellation k of n" and "Most said {appellation}" once
 *   `appellation` is revealed, and only when the wine has one.
 *
 * Nothing without an answer, or with nobody eligible (the console then says
 * "Nobody is guessing this glass.").
 */
export function glassFacts(input: {
  revealedKeys: readonly RevealKey[];
  answer: { primary_grape_id: string; appellation_id: string | null } | null;
  rows: readonly FactRow[];
  eligibleIds: ReadonlySet<string>;
  nameOf: (appellationId: string) => string | null;
}): Fact[] {
  const { revealedKeys, answer, rows, eligibleIds, nameOf } = input;
  if (!answer || eligibleIds.size === 0) return [];

  const revealed = new Set<RevealKey>(revealedKeys);
  const outOf = eligibleIds.size;
  const counted = rows.filter(
    (r) =>
      eligibleIds.has(r.participant_id) && (r.locked_at !== null || r.scored_at !== null),
  );
  const facts: Fact[] = [];

  if (revealed.has("grapes")) {
    const got = counted.filter((r) => r.primary_grape_id === answer.primary_grape_id).length;
    facts.push({ label: "Got the grape", value: `${got} of ${outOf}` });
  }

  const appellationId = answer.appellation_id;
  if (appellationId !== null && revealed.has("appellation")) {
    const got = counted.filter((r) => r.appellation_id === appellationId).length;
    facts.push({ label: "Got the appellation", value: `${got} of ${outOf}` });
    const mostSaid = mostSaidAppellation(counted, nameOf);
    if (mostSaid) facts.push({ label: "Most said", value: mostSaid });
  }

  return facts;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The appellation the counted rows named most. A tie goes to the name that
 * sorts first (then the id), so a polling page never flips between two tied
 * answers as row order changes. An appellation whose name is unknown is never
 * shown, and never hands "Most said" to one with fewer votes.
 */
function mostSaidAppellation(
  rows: readonly FactRow[],
  nameOf: (appellationId: string) => string | null,
): string | null {
  const tally = new Map<string, number>();
  for (const r of rows) {
    if (r.appellation_id !== null) {
      tally.set(r.appellation_id, (tally.get(r.appellation_id) ?? 0) + 1);
    }
  }
  let top = 0;
  for (const n of tally.values()) top = Math.max(top, n);
  if (top === 0) return null;

  const named = [...tally]
    .filter(([, n]) => n === top)
    .flatMap(([id]) => {
      const name = nameOf(id);
      return name === null ? [] : [{ id, name }];
    })
    .sort((a, b) => byText(a.name, b.name) || byText(a.id, b.id));
  return named[0]?.name ?? null;
}
