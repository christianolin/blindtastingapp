// Owner fix C (2026-09-19, spec §6.4, §6.5, §9.3): the follow-up call, with the SDK
// replaced by a recording fake. Nothing here reaches api.anthropic.com (AGENTS.md
// cost rules): the constructor and `messages.parse` are both fakes, and the fixture
// cases prove the constructor is never even reached.
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppellationLookupFacts } from "./appellation-lookup-schema";

vi.mock("server-only", () => ({}));

const sdk = vi.hoisted(() => ({
  constructed: [] as unknown[],
  parse: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  const Real = actual.default;
  class FakeAnthropic {
    static APIError = Real.APIError;
    static APIConnectionError = Real.APIConnectionError;
    static APIConnectionTimeoutError = Real.APIConnectionTimeoutError;
    static APIUserAbortError = Real.APIUserAbortError;
    static BadRequestError = Real.BadRequestError;
    static RateLimitError = Real.RateLimitError;
    static InternalServerError = Real.InternalServerError;
    messages = { parse: sdk.parse };
    constructor(options: unknown) {
      sdk.constructed.push(options);
    }
  }
  return { ...actual, default: FakeAnthropic };
});

const facts: AppellationLookupFacts = {
  producer: "Bodegas Tridente", wineName: "Tridente", grapes: ["Tempranillo"], colour: "RED", style: "STILL",
  country: "Spain", region: "Castilla y Leon", labelText: "TRIDENTE TEMPRANILLO",
  appellations: ["Castilla y Leon", "Ribera del Duero DO"],
};

const FIXTURE = path.join("src", "lib", "label-scan", "__fixtures__", "lookup", "castilla-y-leon.json");

async function load() {
  vi.resetModules();
  return import("./appellation-lookup");
}

beforeEach(() => {
  sdk.constructed.length = 0;
  sdk.parse.mockReset();
  vi.stubEnv("LABEL_READ_FIXTURE", "");
  vi.stubEnv("LABEL_LOOKUP_FIXTURE", "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("lookupAppellation: the dev switches come before any SDK client (spec §6.5)", () => {
  it("LABEL_LOOKUP_FIXTURE replays its answer under model fixture with zero tokens, and never constructs the SDK", async () => {
    vi.stubEnv("LABEL_LOOKUP_FIXTURE", FIXTURE);
    const { lookupAppellation } = await load();
    expect(await lookupAppellation(facts)).toEqual({
      ok: true, answer: "Castilla y Leon", model: "fixture", usage: { input_tokens: 0, output_tokens: 0 },
    });
    expect([sdk.constructed, sdk.parse.mock.calls]).toEqual([[], []]);
  });

  it("a replayed read (LABEL_READ_FIXTURE alone) buys no real follow-up: skipped, and the SDK is never constructed", async () => {
    vi.stubEnv("LABEL_READ_FIXTURE", "src/lib/label-scan/__fixtures__/live/tridente-2020.json");
    const { lookupAppellation } = await load();
    expect(await lookupAppellation(facts)).toEqual({ ok: false, reason: "skipped", model: null, usage: null });
    expect([sdk.constructed, sdk.parse.mock.calls]).toEqual([[], []]);
  });

  it("the lookup fixture wins over the read fixture", async () => {
    vi.stubEnv("LABEL_READ_FIXTURE", "src/lib/label-scan/__fixtures__/live/tridente-2020.json");
    vi.stubEnv("LABEL_LOOKUP_FIXTURE", FIXTURE);
    const { lookupAppellation } = await load();
    expect(await lookupAppellation(facts)).toMatchObject({ ok: true, model: "fixture" });
    expect(sdk.constructed).toEqual([]);
  });

  it("production ignores both switches (the fake SDK answers instead)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LABEL_READ_FIXTURE", "x.json");
    vi.stubEnv("LABEL_LOOKUP_FIXTURE", FIXTURE);
    sdk.parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { appellation: null }, usage: { input_tokens: 9, output_tokens: 3 } });
    const { lookupAppellation } = await load();
    expect(await lookupAppellation(facts)).toEqual({ ok: true, answer: null, model: "claude-sonnet-5", usage: { input_tokens: 9, output_tokens: 3 } });
    expect(sdk.constructed.length).toBe(1);
  });
});

describe("lookupAppellation: the call (spec §6.4)", () => {
  const usage = { input_tokens: 512, output_tokens: 41, cache_read_input_tokens: 0 };

  it("one text-only claude-sonnet-5 request: low effort, 1,024 tokens, 8 s, no retries, an abort signal, no tools", async () => {
    sdk.parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { appellation: " Castilla y Leon " }, usage });
    const { lookupAppellation, LOOKUP_MAX_TOKENS, LOOKUP_TIMEOUT_MS, LABEL_LOOKUP_MODEL } = await load();
    const outcome = await lookupAppellation(facts);
    expect(outcome).toEqual({ ok: true, answer: "Castilla y Leon", model: "claude-sonnet-5", usage: { input_tokens: 512, output_tokens: 41 } });
    expect([LABEL_LOOKUP_MODEL, LOOKUP_MAX_TOKENS, LOOKUP_TIMEOUT_MS]).toEqual(["claude-sonnet-5", 1024, 8000]);

    expect(sdk.constructed).toEqual([{ maxRetries: 0, timeout: 8000 }]);
    expect(sdk.parse).toHaveBeenCalledTimes(1);
    const [params, options] = sdk.parse.mock.calls[0];
    expect(options).toMatchObject({ timeout: 8000, maxRetries: 0 });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(params).toMatchObject({ model: "claude-sonnet-5", max_tokens: 1024, output_config: { effort: "low" } });
    expect(Object.keys(params).sort()).toEqual(["max_tokens", "messages", "model", "output_config"]);
    expect(params.tools).toBeUndefined();
    expect(params.system).toBeUndefined();
    expect(params.thinking).toBeUndefined();
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
    // Text only: a plain string, never an image block.
    expect(typeof params.messages[0].content).toBe("string");
    expect(params.messages[0].content).toContain('"appellations":["Castilla y Leon","Ribera del Duero DO"]');
    // The format's parse never throws.
    expect(params.output_config.format.parse("{")).toBeNull();
    expect(params.output_config.format.parse('{"appellation":"Toro DO"}')).toEqual({ appellation: "Toro DO" });
  });

  it.each(["refusal", "max_tokens"])("a %s stop is a billed not-read with its usage", async (stop_reason) => {
    sdk.parse.mockResolvedValue({ stop_reason, parsed_output: { appellation: "Toro DO" }, usage });
    const { lookupAppellation } = await load();
    expect(await lookupAppellation(facts)).toEqual({
      ok: false, reason: "not-read", model: "claude-sonnet-5", usage: { input_tokens: 512, output_tokens: 41 },
    });
  });

  it("an unparsed output is a billed not-read", async () => {
    sdk.parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: null, usage });
    const { lookupAppellation } = await load();
    expect(await lookupAppellation(facts)).toMatchObject({ ok: false, reason: "not-read", usage: { input_tokens: 512 } });
  });

  it("thrown API errors become unbilled failures, most specific first", async () => {
    type SdkClass = (typeof import("@anthropic-ai/sdk"))["default"];
    const cases: [(A: SdkClass) => unknown, string][] = [
      [(A) => new A.APIConnectionTimeoutError(), "timeout"],
      [(A) => new A.APIUserAbortError(), "timeout"],
      [(A) => A.APIError.generate(429, undefined, "slow down", new Headers()), "busy"],
      [(A) => A.APIError.generate(529, undefined, "overloaded", new Headers()), "busy"],
      [(A) => new A.APIConnectionError({ message: "socket hang up" }), "network"],
      [(A) => A.APIError.generate(400, undefined, "bad", new Headers()), "rejected"],
      [(A) => A.APIError.generate(401, undefined, "who", new Headers()), "service"],
      // AbortSignal.timeout firing while the body is read: a DOMException, not an SDK error.
      [() => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }), "timeout"],
    ];
    for (const [make, reason] of cases) {
      const { lookupAppellation } = await load();
      // The same module instance the lookup just loaded, so `instanceof` holds.
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      sdk.parse.mockReset();
      sdk.parse.mockRejectedValue(make(Anthropic));
      expect([reason, await lookupAppellation(facts)]).toEqual([reason, { ok: false, reason, model: "claude-sonnet-5", usage: null }]);
    }
  });

  it("anything else is rethrown for the caller's catch", async () => {
    sdk.parse.mockRejectedValue(new TypeError("boom"));
    const { lookupAppellation } = await load();
    await expect(lookupAppellation(facts)).rejects.toThrow("boom");
  });
});
