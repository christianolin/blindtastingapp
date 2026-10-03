import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyDraft } from "./complete";
import {
  NEAR_MATCH_SHOWN,
  draftForCandidateVintage,
  draftWithProducer,
  identityKey,
  isSameIdentity,
  namesMatch,
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
  it("never treats a non-Latin name as the same as a nameless wine, or as another non-Latin name", () => {
    // foldName keeps only [a-z0-9]: both fold to "" and must not count as equal.
    expect(isSameIdentity({ ...nodal2021(), wineName: "贺兰晴雪" }, candidate({ wineName: null }))).toBe(false);
    expect(isSameIdentity({ ...nodal2021(), wineName: "贺兰晴雪" }, candidate({ wineName: "长城干红" }))).toBe(false);
    expect(isSameIdentity({ ...nodal2021(), wineName: "Κτήμα" }, candidate({ wineName: "Κτήμα" }))).toBe(true);
  });
  it("never matches a pending producer", () => {
    const draft = { ...nodal2021(), producer: { kind: "pending", name: "Marc Esteve Vives" } as const };
    expect(isSameIdentity(draft, candidate())).toBe(false);
  });
});

describe("namesMatch — the identity lookup's name rule", () => {
  it("matches exact (case, outer spaces) and folded (accents, punctuation) names", () => {
    expect(namesMatch("Nódal", "Nodal")).toBe(true);
    expect(namesMatch("Semi-sec", "Semi Sec")).toBe(true);
    expect(namesMatch(" Ortus ", "ortus")).toBe(true);
    expect(namesMatch(null, "")).toBe(true);
    expect(namesMatch(null, null)).toBe(true);
  });
  it("never lets a name that folds to nothing take the folded half", () => {
    expect(namesMatch("贺兰晴雪", null)).toBe(false);
    expect(namesMatch("贺兰晴雪", "")).toBe(false);
    expect(namesMatch("贺兰晴雪", "长城干红")).toBe(false);
    expect(namesMatch("...", null)).toBe(false);
    expect(namesMatch("贺兰晴雪", "贺兰晴雪")).toBe(true);
  });
});

describe("identityKey — whether an Edit changed what the wine is", () => {
  it("ignores accents and case in the name, and fields outside the identity", () => {
    expect(identityKey({ ...nodal2021(), wineName: "NODAL" })).toBe(identityKey(nodal2021()));
    expect(identityKey({ ...nodal2021(), description: "Fine bubbles." })).toBe(identityKey(nodal2021()));
  });
  it("changes with the producer, name, appellation, colour or vintage", () => {
    const base = identityKey(nodal2021());
    expect(identityKey({ ...nodal2021(), wineName: "Ortus" })).not.toBe(base);
    expect(identityKey({ ...nodal2021(), producer: { kind: "pending", name: "Marc Esteve Vives" } })).not.toBe(base);
    expect(identityKey({ ...nodal2021(), appellationId: "a-other" })).not.toBe(base);
    expect(identityKey({ ...nodal2021(), colour: "ROSE" })).not.toBe(base);
    expect(identityKey({ ...nodal2021(), vintage: { kind: "YEAR", year: 2019, tawnyYears: null, read: false } })).not.toBe(base);
  });
  it("tells two non-Latin names apart", () => {
    expect(identityKey({ ...nodal2021(), wineName: "贺兰晴雪" })).not.toBe(identityKey({ ...nodal2021(), wineName: "长城干红" }));
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
    // Using it would file the bottle as the 2019: the view words it that way.
    expect(rows![0].otherVintage).toBe("2019");
  });

  it("marks no other vintage on a row in the bottle's own vintage", () => {
    const rows = nearMatchRows(nodal2021(), [candidate({ id: "w-o", wineName: "Ortus Blanc de Noirs", nameScore: 0.4 })]);
    expect(rows![0].otherVintage).toBeNull();
  });

  it("shows colour, style and grape differences without dropping the candidate", () => {
    const rows = nearMatchRows(nodal2021(), [
      candidate({ id: "w-r", colour: "ROSE", style: "STILL", primaryGrapeName: "Xarel·lo", primaryGrapeId: "g-xar" }),
    ]);
    expect(rows![0].differences).toEqual(["Rosé, yours is white", "Still, yours is sparkling", "Xarel·lo, yours is Macabeo"]);
    expect(rows![0].addAsVintage).toBeNull();
  });

  it("offers no add-as-vintage for a different wine name", () => {
    const rows = nearMatchRows(nodal2021(), [
      candidate({ id: "w-o", wineName: "Ortus Blanc de Noirs", nameScore: 0.4, vintage: { kind: "YEAR", year: 2020, tawnyYears: null } }),
    ]);
    expect(rows!.map((r) => r.addAsVintage)).toEqual([null]);
  });

  it("offers add-as-vintage under a similar producer with the same real name (the bottle moves to that producer)", () => {
    // 2026-10-02: a read resolved to the wrongly created "Mas Esteve Vinyes";
    // Marc Esteve Vives's Òrtus 2020 is the same wine.
    const draft = { ...nodal2021(), producer: { kind: "existing", id: "p-mas", name: "Mas Esteve Vinyes" } as const, wineName: "Òrtus Blanc de Noirs", vintage: { kind: "YEAR" as const, year: 2022, tawnyYears: null, read: false } };
    const rows = nearMatchRows(draft, [
      candidate({ id: "w-marc", wineName: "Ortus Blanc de Noirs", producerStrength: 1, vintage: { kind: "YEAR", year: 2020, tawnyYears: null } }),
    ]);
    expect(rows![0].addAsVintage).toBe("2022");
    expect(draftForCandidateVintage(draft, rows![0].candidate).producer).toEqual(MEV);
  });

  it("offers no add-as-vintage under a similar producer for a nameless wine", () => {
    const draft = { ...nodal2021(), producer: { kind: "existing", id: "p-x", name: "Miquel Pons" } as const, wineName: null };
    const rows = nearMatchRows(draft, [
      candidate({ id: "w-n", producerId: "p-y", producerName: "Miquel Ponsa", wineName: null, producerStrength: 1, vintage: { kind: "NV", year: null, tawnyYears: null } }),
    ]);
    expect(rows![0].addAsVintage).toBeNull();
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
  // A Windows checkout may hold the file with CRLF endings (core.autocrlf).
  const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261003100000_catalog_near_matches.sql"), "utf8").replace(/\r\n/g, "\n");
  it("never lists a hidden or merged wine, and runs as the caller", () => {
    const body = sql.slice(sql.indexOf("create function public.catalog_wine_near_matches"), sql.indexOf("create function public.similar_producers"));
    expect(body).toContain("security invoker");
    expect(body).toContain("and not c.blind_pending");
    expect(body).toContain("c.merged_into is null");
  });
  it("folds the identity lookup's name only for rows the caller already reads, and only for a name that folds to something", () => {
    expect(sql).toContain("or ((not c.blind_pending or c.created_by = auth.uid())\n          and public.f_search_norm(p->>'wine_name') <> ''\n          and public.f_search_norm(c.wine_name) = public.f_search_norm(p->>'wine_name'))");
  });
  it("offers similar producers only in the draft's region (or with no region link)", () => {
    const body = sql.slice(sql.indexOf("create function public.similar_producers"), sql.indexOf("create function public.recent_circle_catalog_wines"));
    expect(body).toContain("and (p_region_id is null or p.region_id is null or p.region_id = p_region_id)");
  });
  it("keeps anyone who added a not-yet-revealed glass in the caller's tastings out of the recent circle (rule 1)", () => {
    const body = sql.slice(sql.indexOf("create function public.recent_circle_catalog_wines"), sql.indexOf("-- Post-state, same transaction"));
    expect(body).toContain("security invoker");
    expect(body).toContain("where not w.is_revealed");
    expect(body).toContain("case when w.added_by_host then t.host_id else cp.user_id end");
    expect(body).toContain("except\n      select a.user_id from adders a where a.user_id is not null");
    expect(body).toContain("and not c.blind_pending");
  });
});
