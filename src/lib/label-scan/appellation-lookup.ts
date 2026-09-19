import "server-only";

// The scan's one follow-up lookup (owner fix C, 2026-09-19; spec
// docs/superpowers/specs/2026-09-19-scan-region-appellation.md §6.4). When the
// resolver leaves a wine's appellation missing inside a region we trust,
// readLabelPhoto makes at most ONE text-only Claude Sonnet 5 request: no image, no
// system prompt, no tools, no web search, no batch, `effort: "low"`, at most 1,024
// output tokens, an 8-second bound and no retries. It picks one NAME from our own
// list of that region's appellations, or null. About $0.001–0.003 per call; the
// worst case (Piemonte's 254 names and a full output) about $0.015.
//
// Server-only: ANTHROPIC_API_KEY never reaches the browser. The dev fixture switch
// is checked before the client exists, and a replayed read (LABEL_READ_FIXTURE)
// never buys a real follow-up (AGENTS.md cost rules). Every billed outcome is
// returned with its usage so the caller can keep it (label_lookups).
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  AppellationLookupSchema,
  appellationLookupText,
  coerceLookupAnswer,
  parseLookupOutput,
  type AppellationLookupFacts,
  type AppellationLookupOutcome,
} from "./appellation-lookup-schema";
import { LABEL_READ_MODEL } from "./extract";
import { fixtureAllowed } from "./guards";
import { labelLookupFixture } from "./lookup-fixture";

export const LABEL_LOOKUP_MODEL = LABEL_READ_MODEL; // "claude-sonnet-5"
export const LOOKUP_TIMEOUT_MS = 8_000;
/** The answer itself is about 15 tokens; the rest is headroom for low-effort
    adaptive thinking. A max_tokens stop is a billed `not-read`. */
export const LOOKUP_MAX_TOKENS = 1_024;

/** `zodOutputFormat(AppellationLookupSchema)` with a `parse` that never throws, so
    a truncated or refused output reaches the stop_reason checks below with its
    billed usage instead of throwing past them (extract.ts's labelReadFormat). */
const lookupFormat = {
  ...zodOutputFormat(AppellationLookupSchema),
  parse: parseLookupOutput,
};

type ThrownReason = "timeout" | "busy" | "network" | "rejected" | "service";

let client: Anthropic | null = null;

export async function lookupAppellation(facts: AppellationLookupFacts): Promise<AppellationLookupOutcome> {
  // 1. Dev replay, checked before any SDK client exists (mirrors fixture.ts).
  const fixture = await labelLookupFixture();
  if (fixture) return fixture;
  // 2. A replayed read never buys a real follow-up: with LABEL_READ_FIXTURE on and
  //    no LABEL_LOOKUP_FIXTURE, nothing is called.
  if (fixtureAllowed(process.env)) return { ok: false, reason: "skipped", model: null, usage: null };

  const fail = (reason: ThrownReason, status?: number | string | null): AppellationLookupOutcome => {
    // Never the key, never the facts.
    console.error("label lookup failed", { reason, status });
    return { ok: false, reason, model: LABEL_LOOKUP_MODEL, usage: null };
  };

  try {
    client ??= new Anthropic({ maxRetries: 0, timeout: LOOKUP_TIMEOUT_MS });
    const response = await client.messages.parse(
      {
        model: LABEL_LOOKUP_MODEL,
        max_tokens: LOOKUP_MAX_TOKENS,
        output_config: { effort: "low", format: lookupFormat },
        messages: [{ role: "user", content: appellationLookupText(facts) }],
      },
      { timeout: LOOKUP_TIMEOUT_MS, maxRetries: 0, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    );
    const usage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !response.parsed_output) {
      console.error("label lookup not read", { stop_reason: response.stop_reason });
      return { ok: false, reason: "not-read", model: LABEL_LOOKUP_MODEL, usage };
    }
    return { ok: true, answer: coerceLookupAnswer(response.parsed_output), model: LABEL_LOOKUP_MODEL, usage };
  } catch (error) {
    // Most specific first: APIConnectionTimeoutError ⊂ APIConnectionError ⊂ APIError,
    // and APIUserAbortError ⊂ APIError (our own AbortSignal firing before headers).
    const status = error instanceof Anthropic.APIError ? error.status : undefined;
    if (error instanceof Anthropic.APIConnectionTimeoutError || error instanceof Anthropic.APIUserAbortError) {
      return fail("timeout", status);
    }
    // The AbortSignal firing while the body is read surfaces as a plain
    // AbortError/TimeoutError DOMException, not an SDK error.
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      return fail("timeout");
    }
    if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
      return fail("busy", status);
    }
    if (error instanceof Anthropic.APIConnectionError) return fail("network", status);
    if (error instanceof Anthropic.BadRequestError) return fail("rejected", status);
    if (error instanceof Anthropic.APIError) return fail("service", status);
    // Not an API error: followUpAppellation's catch turns it into "no answer".
    throw error;
  }
}
