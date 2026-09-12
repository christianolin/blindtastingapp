import { describe, expect, it } from "vitest";
import { emptyDraft } from "./complete";
import { pickConfidentMatch, type CatalogCandidate } from "./match";
import type { WineIdentityDraft } from "./types";

const draft = (o: Partial<WineIdentityDraft> = {}): WineIdentityDraft => ({
  ...emptyDraft(), producer: { kind: "existing", id: "p-cig", name: "Cigliuti" }, wineName: "Serraboella",
  appellationId: "a-bbr", colour: "RED", style: "STILL", vintage: { kind: "YEAR", year: 2017, tawnyYears: null, read: true }, ...o,
});
const cand = (o: Partial<CatalogCandidate> = {}): CatalogCandidate => ({
  id: "c1", wineName: "Serraboella", appellationId: "a-bbr", colour: "RED", vintageKind: "YEAR", vintageYear: 2017, vintageTawnyYears: null, ...o,
});

describe("pickConfidentMatch (scan-1)", () => {
  it("matches the same vintage of a one-identity producer", () =>
    expect(pickConfidentMatch(draft({ wineName: null }), [cand({ wineName: null }), cand({ id: "c2", wineName: null, vintageYear: 2016 })])?.id).toBe("c1"));
  it.each<[string, WineIdentityDraft, CatalogCandidate[]]>([
    ["another vintage only", draft(), [cand({ vintageYear: 2016 })]],
    ["an unread vintage", draft({ vintage: { kind: "YEAR", year: 2017, tawnyYears: null, read: false } }), [cand()]],
    ["a colour disagreement", draft({ colour: "WHITE" }), [cand()]],
    ["two survivors", draft({ wineName: null, appellationId: null }), [cand({ wineName: null }), cand({ id: "c2", wineName: null })]],
    ["a pending producer", draft({ producer: { kind: "pending", name: "Cigliuti" } }), [cand()]],
  ])("null for %s", (_l, d, cs) => expect(pickConfidentMatch(d, cs)).toBeNull());
  it("compares the tawny age", () => {
    const t = draft({ vintage: { kind: "TAWNY", year: null, tawnyYears: 20, read: true }, colour: null, wineName: null });
    const tawny = (years: number) => cand({ wineName: null, vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: years });
    expect(pickConfidentMatch(t, [tawny(10)])).toBeNull();
    expect(pickConfidentMatch(t, [tawny(20)])?.id).toBe("c1");
  });
  it("a producer with several wines needs the cuvée and the appellation", () => {
    const cs = [cand(), cand({ id: "c2", wineName: null, appellationId: "a-langhe" })];
    expect(pickConfidentMatch(draft(), cs)?.id).toBe("c1");
    expect(pickConfidentMatch(draft({ wineName: null }), cs)).toBeNull();
    expect(pickConfidentMatch(draft({ appellationId: "a-other" }), cs)).toBeNull();
  });
});
