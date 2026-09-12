import { describe, expect, it } from "vitest";
import { emptyDraft } from "./complete";
import { describeMissing, describeUnread, readDisplay, vintageLabel } from "./describe";
import type { WineIdentityDraft } from "./types";

it.each([
  [[], "", ""],
  [["vintage"], "needs a vintage", "no vintage read"],
  [["vintage", "primaryGrape"], "needs a vintage and a grape", "no vintage or grape read"],
  [["producer", "vintage", "primaryGrape"], "needs a producer, a vintage and a grape", "no producer, vintage or grape read"],
  [["appellation"], "needs an appellation", "no appellation read"],
] as const)("%j", (fields, missing, unread) => {
  expect(describeMissing(fields)).toBe(missing);
  expect(describeUnread(fields)).toBe(unread);
});

it.each([
  [{ kind: "YEAR", year: 2018, tawnyYears: null, read: true }, "2018"],
  [{ kind: "NV", year: null, tawnyYears: null, read: false }, "NV"],
  [{ kind: "TAWNY", year: null, tawnyYears: 20, read: true }, "20 years"],
  [{ kind: null, year: null, tawnyYears: null, read: false }, ""],
] as const)("vintageLabel %j → %s", (v, label) => expect(vintageLabel(v)).toBe(label));

describe("readDisplay (spec A.5)", () => {
  const draft: WineIdentityDraft = { ...emptyDraft(), producer: { kind: "existing", id: "p", name: "Produttori del Barbaresco" }, vintage: { kind: "YEAR", year: 2018, tawnyYears: null, read: true } };
  const names = { producer: "Produttori del Barbaresco", appellation: "Barbaresco DOCG", region: "Piedmont", country: "Italy", primaryGrape: "Nebbiolo" };
  it("uses the appellation without its designation when there is no wine name", () =>
    expect(readDisplay(draft, names)).toEqual({ title: "Produttori del Barbaresco, Barbaresco 2018", meta: "Barbaresco DOCG · Piedmont · Italy · Nebbiolo", newProducer: false }));
  it("prefers the wine name and flags a pending producer", () => {
    const r = readDisplay({ ...draft, producer: { kind: "pending", name: "Cigliuti" }, wineName: "Serraboella" }, { ...names, producer: "Cigliuti" });
    expect([r.title, r.newProducer]).toEqual(["Cigliuti, Serraboella 2018", true]);
  });
  it("leaves out parts with no value", () =>
    expect(readDisplay(emptyDraft(), { producer: null, appellation: null, region: "Bourgogne", country: "France", primaryGrape: null })).toEqual({ title: "", meta: "Bourgogne · France", newProducer: false }));
});
