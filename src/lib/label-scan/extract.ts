import "server-only";

// The label reader (spec §A.2, D1). One photo is one Claude Sonnet 5 request
// through the official SDK: the image by URL, then the prompt. No system prompt,
// no tools, no web search, no batch; `effort: "low"` keeps adaptive thinking short.
// About $0.01 per scan (spec §A.7). Server-only: ANTHROPIC_API_KEY never reaches
// the browser, and the client is created lazily, after the fixture check.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  LABEL_READ_PROMPT,
  LabelReadSchema,
  coerceLabelRead,
  type LabelRead,
} from "./label-read-schema";
import { labelReadFixture } from "./fixture";

export const LABEL_READ_MODEL = "claude-sonnet-5";

export type LabelReadUsage = { input_tokens: number; output_tokens: number };
export type LabelReadFailure = "not-read" | "busy" | "network" | "rejected" | "service";
export type LabelReadOutcome =
  | { ok: true; read: LabelRead; model: string; usage: LabelReadUsage }
  | { ok: false; reason: "not-a-label"; read: LabelRead; model: string; usage: LabelReadUsage }
  // usage is non-null whenever the API returned a billed response: a refusal, a max_tokens
  // stop or an unparsed output (not-read). readLabelPhoto records those too (A.5).
  | { ok: false; reason: LabelReadFailure; model: string; usage: LabelReadUsage | null };

/**
 * The JSON schema `zodOutputFormat(LabelReadSchema)` sends, with a `parse` that
 * never throws. The helper's own `parse` throws on invalid JSON or on any schema
 * miss, and `messages.parse` runs it before returning, so a truncated max_tokens
 * output, a refusal's text or one out-of-vocabulary value (the SDK sends `enum`
 * only as description text) would throw past the stop_reason checks below and
 * lose the billed usage. Here a JSON object that carries the boolean
 * `isWineLabel` the outcome branches on is handed on as it came, and
 * `coerceLabelRead` normalises it field by field (spec §A.3). Anything else
 * parses to null, which is `not-read` (spec §A.2's unparsed output), so a garbled
 * output is never reported as "not a wine label".
 */
const labelReadFormat = {
  ...zodOutputFormat(LabelReadSchema),
  parse: (content: string): unknown => {
    try {
      const value: unknown = JSON.parse(content);
      const isObject = typeof value === "object" && value !== null && !Array.isArray(value);
      return isObject && typeof (value as { isWineLabel?: unknown }).isWineLabel === "boolean" ? value : null;
    } catch {
      return null;
    }
  },
};

let client: Anthropic | null = null;

export async function readLabel(imageUrl: string): Promise<LabelReadOutcome> {
  const fixture = await labelReadFixture(); // development only; checked before any SDK use
  if (fixture) return fixture;

  const fail = (
    reason: LabelReadFailure,
    usage: LabelReadUsage | null = null,
    status?: number | string | null,
  ): LabelReadOutcome => {
    // Never the key, never the read JSON.
    console.error("label read failed", { reason, status });
    return { ok: false, reason, model: LABEL_READ_MODEL, usage };
  };

  try {
    client ??= new Anthropic({ maxRetries: 1, timeout: 60_000 });
    const response = await client.messages.parse({
      model: LABEL_READ_MODEL,
      max_tokens: 16000,
      output_config: { effort: "low", format: labelReadFormat },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            { type: "text", text: LABEL_READ_PROMPT },
          ],
        },
      ],
    });
    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    };
    if (
      response.stop_reason === "refusal" ||
      response.stop_reason === "max_tokens" ||
      !response.parsed_output
    ) {
      return fail("not-read", usage, response.stop_reason);
    }
    const read = coerceLabelRead(response.parsed_output);
    return read.isWineLabel
      ? { ok: true, read, model: LABEL_READ_MODEL, usage }
      : { ok: false, reason: "not-a-label", read, model: LABEL_READ_MODEL, usage };
  } catch (error) {
    // Most specific first. In the TS SDK, APIConnectionError is a subclass of APIError.
    const status = error instanceof Anthropic.APIError ? error.status : undefined;
    if (error instanceof Anthropic.RateLimitError) return fail("busy", null, status);
    if (error instanceof Anthropic.InternalServerError) return fail("busy", null, status);
    if (error instanceof Anthropic.APIConnectionError) return fail("network", null, status);
    if (error instanceof Anthropic.BadRequestError) return fail("rejected", null, status);
    if (error instanceof Anthropic.APIError) return fail("service", null, status);
    throw error;
  }
}
