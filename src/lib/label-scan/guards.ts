// The label reader's cost and security rules as pure, tested predicates (spec
// §A.1). No `server-only` and no runtime imports (types only), so vitest loads it
// directly.
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
