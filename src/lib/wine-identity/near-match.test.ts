import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyDraft } from "./complete";
import {
  NEAR_MATCH_SHOWN,
  draftForCandidateVintage,
  draftWithProducer,
  isSameIdentity,
  nearMatchQuery,
  nearMatchRows,
  shouldAskNearMatch,
  type NearMatchCandidate,
} from "./near-match";
import type { WineIdentityDraft } from "./types";

const MEV = { kind: "existing", id: "p-mev", name: "Marc Esteve Vives" } as const;
const macabeo = { kind: "existing", id: "g-mac", name: "Macabeo" } as const;

const nodal2021 = (): WineIdentityDraft => ({
  ...emptyDraft(),
  producer: MEV,
  wineName: "Nódal",
  vintage: { kind: "YEAR", year: 2021, tawnyYears: null, read: false },
  colour: "WHITE",
  style: "SPARKLING",
  countryId: "c-es",
  regionId: "r-cava",
  appellationId: "a-cava",
  blend: [{ grape: macabeo, percentage: null }],
});

const candidate = (over: Partial<NearMatchCandidate> = {}): NearMatchCandidate => ({
  id: "w-1",
  producerId: "p-mev",
  producerName: "Marc Esteve Vives",
  wineName: "Nodal",
  vintage: { kind: "YEAR", year: 2021, tawnyYears: null },
  colour: "WHITE",
  style: "SPARKLING",
  countryId: "c-es",
  regionId: "r-cava",
  appellationId: "a-cava",
  appellationName: "Cava DO",
  primaryGrapeId: "g-mac",
  primaryGrapeName: "Macabeo",
  producerStrength: 3,
  nameScore: 1,
  ...over,
});

describe("isSameIdentity — what find_or_create_catalog_wine would link to on its own", () => {
  it("treats an accent-only name difference as the same wine", () => {
    expect(isSameIdentity(nodal2021(), candidate())).toBe(true);
  });
  it("is false for another vintage, colour, appellation or producer", () => {
    expect(isSameIdentity(nodal2021(), candidate({ vintage: { kind: "YEAR", year: 2019, tawnyYears: null } }))).toBe(false);
    expect(isSameIdentity(nodal2021(), candidate({ colour: "ROSE" }))).toBe(false);
    expect(isSameIdentity(nodal2021(), candidate({ appellationId: "a-other" }))).toBe(false);
    expect(isSameIdentity(nodal2021(), candidate({ producerId: "p-other" }))).toBe(false);
  });
  it("never matches a pending producer", () => {
    const draft = { ...nodal2021(), producer: { kind: "pending", name: "Marc Esteve Vives" } as const };
    expect(isSameIdentity(draft, candidate())).toBe(false);
  });
});

describe("nearMatchQuery", () => {
  it("sends the existing producer id, its name, the region and the wine name", () => {
    expect(nearMatchQuery(nodal2021())).toEqual({
      producerId: "p-mev", producerName: "Marc Esteve Vives", regionId: "r-cava", wineName: "Nódal",
    });
  });
  it("sends a pending producer by name only", () => {
    const draft = { ...nodal2021(), producer: { kind: "pending", name: "Mas Esteve Vinyes" } as const };
    expect(nearMatchQuery(draft)).toEqual({
      producerId: null, producerName: "Mas Esteve Vinyes", regionId: "r-cava", wineName: "Nódal",
    });
  });
  it("is null with no producer", () => {
    expect(nearMatchQuery({ ...nodal2021(), producer: null })).toBeNull();
  });
});

describe("shouldAskNearMatch", () => {
  it("asks only for a complete identity that has not been reviewed", () => {
    expect(shouldAskNearMatch({ kind: "identity", draft: nodal2021() }, false)).toBe(true);
    expect(shouldAskNearMatch({ kind: "identity", draft: nodal2021() }, true)).toBe(false);
    expect(shouldAskNearMatch({ kind: "identity", draft: { ...nodal2021(), appellationId: null } }, false)).toBe(false);
    expect(shouldAskNearMatch({ kind: "catalog" }, false)).toBe(false);
    expect(shouldAskNearMatch({ kind: "incomplete" }, false)).toBe(false);
  });
});

describe("nearMatchRows", () => {
  it("returns null (no prompt) when a candidate is the same identity — the add links to it anyway", () => {
    expect(nearMatchRows(nodal2021(), [candidate(), candidate({ id: "w-2", wineName: "Nodal", vintage: { kind: "YEAR", year: 2019, tawnyYears: null } })])).toBeNull();
  });

  it("returns null when there are no candidates", () => {
    expect(nearMatchRows(nodal2021(), [])).toBeNull();
  });

  it("lists another vintage of the same wine with what differs and an add-as-this-vintage action", () => {
    const rows = nearMatchRows(nodal2021(), [candidate({ vintage: { kind: "YEAR", year: 2019, tawnyYears: null } })]);
    expect(rows).toHaveLength(1);
    expect(rows![0].title).toBe("Marc Esteve Vives Nodal 2019");
    expect(rows![0].meta).toBe("Cava DO · Macabeo");
    expect(rows![0].differences).toEqual(["2019, yours is 2021"]);
    expect(rows![0].addAsVintage).toBe("2021");
  });

  it("shows colour, style and grape differences without dropping the candidate", () => {
    const rows = nearMatchRows(nodal2021(), [
      candidate({ id: "w-r", colour: "ROSE", style: "STILL", primaryGrapeName: "Xarel·lo", primaryGrapeId: "g-xar" }),
    ]);
    expect(rows![0].differences).toEqual(["Rosé, yours is white", "Still, yours is sparkling", "Xarel·lo, yours is Macabeo"]);
    expect(rows![0].addAsVintage).toBeNull();
  });

  it("offers no add-as-vintage for a different wine name or producer", () => {
    const rows = nearMatchRows(nodal2021(), [
      candidate({ id: "w-o", wineName: "Ortus Blanc de Noirs", nameScore: 0.4, vintage: { kind: "YEAR", year: 2020, tawnyYears: null } }),
      candidate({ id: "w-p", producerId: "p-x", producerName: "Mas Esteve Vinyes", producerStrength: 1, vintage: { kind: "YEAR", year: 2020, tawnyYears: null } }),
    ]);
    expect(rows!.map((r) => r.addAsVintage)).toEqual([null, null]);
  });

  it("ranks the same producer and name first, then the same vintage, and caps the list", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      candidate({ id: `w-${i}`, wineName: `Cuvée ${i}`, nameScore: 0.3 + i / 100, vintage: { kind: "YEAR", year: 2010 + i, tawnyYears: null } }),
    );
    const best = candidate({ id: "w-best", vintage: { kind: "YEAR", year: 2018, tawnyYears: null } });
    const rows = nearMatchRows(nodal2021(), [...many, best])!;
    expect(rows).toHaveLength(NEAR_MATCH_SHOWN);
    expect(rows[0].candidate.id).toBe("w-best");
  });

  it("titles a nameless wine by producer and vintage", () => {
    const rows = nearMatchRows(nodal2021(), [candidate({ wineName: null, nameScore: 0.5, vintage: { kind: "NV", year: null, tawnyYears: null } })]);
    expect(rows![0].title).toBe("Marc Esteve Vives NV");
  });
});

describe("draftForCandidateVintage", () => {
  it("takes the candidate's producer, name and place and keeps the draft's vintage", () => {
    const draft = { ...nodal2021(), producer: { kind: "pending", name: "Mas Esteve Vinyes" } as const, wineName: "Ortus" };
    const next = draftForCandidateVintage(draft, candidate({ wineName: "Òrtus Blanc de Noirs", vintage: { kind: "YEAR", year: 2020, tawnyYears: null } }));
    expect(next.producer).toEqual({ kind: "existing", id: "p-mev", name: "Marc Esteve Vives" });
    expect(next.wineName).toBe("Òrtus Blanc de Noirs");
    expect(next.vintage).toEqual(draft.vintage);
    expect([next.countryId, next.regionId, next.appellationId, next.colour, next.style]).toEqual(["c-es", "r-cava", "a-cava", "WHITE", "SPARKLING"]);
    expect(next.provenance.producer).toBe("catalog-match");
  });
});

describe("draftWithProducer", () => {
  it("swaps a pending producer for the existing one the person chose", () => {
    const draft = { ...nodal2021(), producer: { kind: "pending", name: "Mas Esteve Vinyes" } as const };
    expect(draftWithProducer(draft, { id: "p-mev", name: "Marc Esteve Vives" }).producer).toEqual(MEV);
  });
});

describe("the SQL the near-match step reads (20261003100000)", () => {
  const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261003100000_catalog_near_matches.sql"), "utf8");
  it("never lists a hidden or merged wine, and runs as the caller", () => {
    const body = sql.slice(sql.indexOf("create function public.catalog_wine_near_matches"), sql.indexOf("create function public.similar_producers"));
    expect(body).toContain("security invoker");
    expect(body).toContain("and not c.blind_pending");
    expect(body).toContain("c.merged_into is null");
  });
  it("folds the identity lookup's name only for rows the caller already reads", () => {
    expect(sql).toContain("or ((not c.blind_pending or c.created_by = auth.uid())\n          and public.f_search_norm(c.wine_name) = public.f_search_norm(p->>'wine_name'))");
  });
});
