import { describe, expect, it } from "vitest";
import { fixtureAllowed, isOwnStagingPath, labelReadRow } from "./guards";
import { coerceLabelRead } from "./label-read-schema";

const me = "d3ee0f40-a6c0-40f6-9c45-9fc068fcc556";
describe("isOwnStagingPath (spec §A.5 step 2)", () => {
  it.each([
    [`catalog/staging/${me}/scan-1789151878445-duytuv9ox3a.jpg`, true],
    ["catalog/staging/430f8450-5ef7-4733-b38b-fb6f96b640e1/scan-1.jpg", false],
    [`catalog/staging/${me}/../other/scan-1.jpg`, false],
    [`catalog/staging/${me}/scan-1.png`, false],
    [`https://x.supabase.co/storage/v1/object/public/wine-images/catalog/staging/${me}/scan-1.jpg`, false],
  ])("%s → %s", (p, ok) => expect(isOwnStagingPath(p, me)).toBe(ok));
  it("escapes the user id", () => expect(isOwnStagingPath("catalog/staging/aXb/scan-1.jpg", "a.b")).toBe(false));
});
it("fixtureAllowed only outside production, and only with the variable (spec §A.6)", () => {
  expect(fixtureAllowed({ NODE_ENV: "development", LABEL_READ_FIXTURE: "x.json" })).toBe(true);
  expect(fixtureAllowed({ NODE_ENV: "production", LABEL_READ_FIXTURE: "x.json" })).toBe(false);
  expect(fixtureAllowed({ NODE_ENV: "development" })).toBe(false);
});

describe("labelReadRow: every billed read is kept (spec §A.5 step 5, §A.7)", () => {
  // The row copies the outcome's model; the real id lives only in extract.ts.
  const model = "reader-model";
  const usage = { input_tokens: 3812, output_tokens: 402 };
  const read = coerceLabelRead({ isWineLabel: true, producer: "Produttori del Barbaresco", confidence: "high", rawText: "…" });
  const notALabel = coerceLabelRead({ isWineLabel: false, rawText: "A cat on a sofa." });

  it("keeps a read with its model and tokens", () => {
    expect(labelReadRow({ ok: true, read, model, usage })).toEqual({
      outcome: "ok",
      read,
      model,
      input_tokens: 3812,
      output_tokens: 402,
    });
  });

  it("keeps a not-a-label read together with its read", () => {
    expect(labelReadRow({ ok: false, reason: "not-a-label", read: notALabel, model, usage })).toEqual({
      outcome: "not-a-label",
      read: notALabel,
      model,
      input_tokens: 3812,
      output_tokens: 402,
    });
  });

  it("keeps a billed not-read (a refusal, a max_tokens stop, an unparsed output) with no read", () => {
    const runaway = { input_tokens: 3900, output_tokens: 16000 };
    expect(labelReadRow({ ok: false, reason: "not-read", model, usage: runaway })).toEqual({
      outcome: "not-read",
      read: null,
      model,
      input_tokens: 3900,
      output_tokens: 16000,
    });
  });

  it("keeps a fixture replay under model fixture with zero tokens (spec §A.6)", () => {
    const zero = { input_tokens: 0, output_tokens: 0 };
    expect(labelReadRow({ ok: true, read, model: "fixture", usage: zero })).toEqual({
      outcome: "ok",
      read,
      model: "fixture",
      input_tokens: 0,
      output_tokens: 0,
    });
  });

  it.each(["not-read", "busy", "network", "rejected", "service"] as const)(
    "stores nothing for a %s failure no response was billed for",
    (reason) => {
      expect(labelReadRow({ ok: false, reason, model, usage: null })).toBeNull();
    },
  );
});
