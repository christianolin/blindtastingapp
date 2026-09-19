import { describe, expect, it } from "vitest";
import {
  APPELLATION_LOOKUP_LIST_CAP,
  APPELLATION_LOOKUP_PROMPT,
  AppellationLookupSchema,
  appellationLookupText,
  coerceLookupAnswer,
  parseLookupOutput,
  type AppellationLookupFacts,
} from "./appellation-lookup-schema";

// Owner fix C (2026-09-19, spec docs/superpowers/specs/2026-09-19-scan-region-appellation.md §6.3).
const tridenteFacts: AppellationLookupFacts = {
  producer: "Bodegas Tridente",
  wineName: "Tridente",
  grapes: ["Tempranillo"],
  colour: "RED",
  style: "STILL",
  country: "Spain",
  region: "Castilla y Leon",
  labelText: "TRIDENTE TEMPRANILLO",
  appellations: ["Castilla y Leon", "Ribera del Duero DO"],
};

describe("the follow-up lookup's prompt (spec §6.3)", () => {
  it("pins the instruction word for word", () => {
    expect(APPELLATION_LOOKUP_PROMPT).toBe(
      "The JSON above describes one wine bottle photographed for a cellar app: what its label reader resolved, " +
        "and the label's own text. The label printed no appellation the app could match. " +
        "Name the one appellation from `appellations` — every appellation the app holds for this wine's region — " +
        "that this specific wine is sold under, using what you know about this producer and this wine. " +
        "A wine sold under a regional classification with no narrower denomination (a Vino de la Tierra, an IGP or IGT, " +
        "a regional GI) takes the entry named like the region itself. " +
        "Copy the name exactly as the list spells it. " +
        "Return null unless you are confident this wine carries that appellation: what the producer's other wines carry, " +
        "or what is common in the region or for the grape, is not enough.",
    );
    expect(APPELLATION_LOOKUP_LIST_CAP).toBe(300);
  });

  it("puts the facts first and the instruction last, byte for byte", () => {
    const text = appellationLookupText(tridenteFacts);
    expect(text).toBe(
      "Facts (JSON):\n" +
        '{"producer":"Bodegas Tridente","wineName":"Tridente","grapes":["Tempranillo"],"colour":"RED","style":"STILL",' +
        '"country":"Spain","region":"Castilla y Leon","labelText":"TRIDENTE TEMPRANILLO",' +
        '"appellations":["Castilla y Leon","Ribera del Duero DO"]}' +
        "\n\n" +
        APPELLATION_LOOKUP_PROMPT,
    );
    // Every list name exactly once inside the list, the instruction exactly once, last.
    const json = JSON.parse(text.slice("Facts (JSON):\n".length, text.indexOf("\n\n")));
    expect(json).toEqual(tridenteFacts);
    expect(text.split(APPELLATION_LOOKUP_PROMPT).length - 1).toBe(1);
    expect(text.endsWith(APPELLATION_LOOKUP_PROMPT)).toBe(true);
    expect(text.split('"Ribera del Duero DO"').length - 1).toBe(1);
  });

  it("the key order is fixed whatever order the facts object was built in", () => {
    const shuffled = Object.fromEntries(Object.entries(tridenteFacts).reverse()) as AppellationLookupFacts;
    expect(appellationLookupText(shuffled)).toBe(appellationLookupText(tridenteFacts));
  });

  it("the structured output is one nullable name", () => {
    expect(AppellationLookupSchema.parse({ appellation: "Castilla y Leon" })).toEqual({ appellation: "Castilla y Leon" });
    expect(AppellationLookupSchema.parse({ appellation: null })).toEqual({ appellation: null });
    expect(Object.keys(AppellationLookupSchema.shape)).toEqual(["appellation"]);
  });
});

describe("coerceLookupAnswer", () => {
  it.each([
    [{ appellation: "  Toro DO " }, "Toro DO"],
    [{ appellation: "Castilla y Leon" }, "Castilla y Leon"],
    [{ appellation: null }, null],
    [{ appellation: "   " }, null],
    [{ appellation: 5 }, null],
    [{}, null],
    [null, null],
    ["Toro DO", null],
    [[{ appellation: "Toro DO" }], null],
  ] as const)("%j → %j", (raw, answer) => expect(coerceLookupAnswer(raw)).toBe(answer));
});

describe("parseLookupOutput: the format's parse never throws", () => {
  it.each(["", "{", "[]", '{"appellation":5}', "I can't help with that.", "null", '"Toro DO"', "{}"])(
    "%j parses to null",
    (content) => expect(parseLookupOutput(content)).toBeNull(),
  );
  it("hands on an object whose appellation is a string or null", () => {
    expect(parseLookupOutput('{"appellation":"Castilla y Leon"}')).toEqual({ appellation: "Castilla y Leon" });
    expect(parseLookupOutput('{"appellation":null}')).toEqual({ appellation: null });
  });
});
