// The label reader's cost and security rules as pure, tested predicates (spec
// §A.1). No `server-only` and no runtime imports (types only), so vitest loads it
// directly.
import type { AppellationLookupOutcome } from "./appellation-lookup-schema";
import type { LabelReadOutcome, LabelReadUsage } from "./extract";
import type { LabelRead } from "./label-read-schema";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True only for the caller's own scan upload,
 * `catalog/staging/<userId>/scan-<name>.jpg` (spec §A.5 step 2): one file directly
 * in the user's own staging folder, never a URL and never another folder. The
 * server never accepts a URL from the client, so no signed-in caller can spend
 * reads on an arbitrary image. The user id is escaped, so it matches literally.
 */
export function isOwnStagingPath(path: string, userId: string): boolean {
  if (typeof path !== "string" || typeof userId !== "string" || userId === "") return false;
  return new RegExp(`^catalog/staging/${escapeRegExp(userId)}/scan-[A-Za-z0-9._-]+\\.jpg$`).test(path);
}

/** The `LABEL_READ_FIXTURE` switch applies only outside production, and only when
    the variable is set (spec §A.6). */
export function fixtureAllowed(env: { NODE_ENV?: string; LABEL_READ_FIXTURE?: string }): boolean {
  return env.NODE_ENV !== "production" && Boolean(env.LABEL_READ_FIXTURE);
}

/** A `label_reads` row without the caller's `user_id` and `image_path`. */
export type LabelReadRow = {
  outcome: "ok" | "not-a-label" | "not-read";
  read: LabelRead | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
};

function tokens(usage: LabelReadUsage): Pick<LabelReadRow, "input_tokens" | "output_tokens"> {
  return { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens };
}

/**
 * What a read outcome stores in `label_reads` (spec §A.5 step 5), or null when no
 * response was billed. Every billed call is kept, so spec §A.7's cost query counts
 * real spend: `ok`, `not-a-label`, and a `not-read` that carries usage (a refusal,
 * a max_tokens stop, an unparsed output). `busy`, `network`, `rejected` and
 * `service` come from thrown errors with no usage, and store nothing. `read` is
 * null exactly for `not-read`, as `label_reads_read_matches_outcome` requires. A
 * fixture replay is kept too, under model "fixture" with zero tokens (spec §A.6).
 */
export function labelReadRow(outcome: LabelReadOutcome): LabelReadRow | null {
  if (outcome.ok) {
    return { outcome: "ok", read: outcome.read, model: outcome.model, ...tokens(outcome.usage) };
  }
  if (outcome.reason === "not-a-label") {
    return { outcome: "not-a-label", read: outcome.read, model: outcome.model, ...tokens(outcome.usage) };
  }
  if (outcome.reason === "not-read" && outcome.usage !== null) {
    return { outcome: "not-read", read: null, model: outcome.model, ...tokens(outcome.usage) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The follow-up lookup (owner fix C, 2026-09-19; spec §6.5, §6.6)

/** The `LABEL_LOOKUP_FIXTURE` switch: only outside production, and only when the
    variable is set. Its own variable, so a replayed read never buys a real
    follow-up by accident (appellation-lookup.ts skips the call instead). */
export function lookupFixtureAllowed(env: { NODE_ENV?: string; LABEL_LOOKUP_FIXTURE?: string }): boolean {
  return env.NODE_ENV !== "production" && Boolean(env.LABEL_LOOKUP_FIXTURE);
}

/** A `label_lookups` row without the caller's `user_id` and `label_read_id`. */
export type LabelLookupRow = {
  region_id: string;
  candidates: number;
  outcome: "answer" | "no-answer" | "discarded" | "not-read";
  answer: string | null;
  appellation_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
};

/** label_lookups.answer's bound (char_length ≤ 200). */
const LOOKUP_ANSWER_MAX = 200;

function capAnswer(answer: string): string {
  if (answer.length <= LOOKUP_ANSWER_MAX) return answer;
  const cut = answer.slice(0, LOOKUP_ANSWER_MAX);
  // Never end on half a surrogate pair (a lone surrogate is not valid UTF-8).
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * What a follow-up outcome stores in `label_lookups`, or null when no response
 * was billed. Like `labelReadRow`, every billed call is kept: an answer that
 * picked one of our rows (`answer`, with that row's id), an answer outside the
 * list (`discarded`), no answer (`no-answer`), and a billed `not-read`. A thrown
 * failure (timeout, busy, network, rejected, service) carries no usage and a
 * skipped lookup made no call: neither stores anything. A fixture replay is kept
 * under model "fixture" with zero tokens.
 */
export function labelLookupRow(
  outcome: AppellationLookupOutcome,
  request: { regionId: string; rows: readonly unknown[] },
  picked: { id: string } | null,
): LabelLookupRow | null {
  const where = { region_id: request.regionId, candidates: request.rows.length };
  if (outcome.ok) {
    const usage = { model: outcome.model, ...tokens(outcome.usage) };
    if (outcome.answer === null) {
      return { ...where, outcome: "no-answer", answer: null, appellation_id: null, ...usage };
    }
    const answer = capAnswer(outcome.answer);
    return picked !== null
      ? { ...where, outcome: "answer", answer, appellation_id: picked.id, ...usage }
      : { ...where, outcome: "discarded", answer, appellation_id: null, ...usage };
  }
  if (outcome.reason === "not-read") {
    return { ...where, outcome: "not-read", answer: null, appellation_id: null, model: outcome.model, ...tokens(outcome.usage) };
  }
  return null;
}
