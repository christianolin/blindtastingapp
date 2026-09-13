// Curated alternative producer names (owner approvals 1 and 2 after L1 round 2,
// 2026-09-13; migration 20260914113500_producer_aliases). snapshotLookup mirrors
// find_producer_by_folded_name's fallback:
//   - a producer row whose name folds equal to the query always wins, and the
//     existing order (region, exact spelling, holds wines, region link, name, id)
//     still decides among producer rows;
//   - only when no producer row folds equal does the lookup return the producer of
//     the alias whose folded name equals the query's, whatever the region;
//   - a snapshot without `aliases` has none.
// The rows mirror the live ones the approvals name: "Borges Porto" → 'Sociedade dos
// Vinhos Borges' (6aaef358), and no plain "Borges" alias, because 'Borges' is the
// Madeira house (25612e68); "Tridente" → 'Bodegas Tridente' (7f46bd24), while the
// duplicate 'Tridente' row (0d1d099c) still wins until the approved merge deletes it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceLabelRead } from "../label-scan/label-read-schema";
import { resolveLabelRead } from "./resolve";
import { snapshotLookup, type ReferenceSnapshot } from "./__fixtures__/snapshot-lookup";

type Producer = ReferenceSnapshot["producers"][number];
type Alias = { id: string; producer_id: string; alias: string };

const SOCIEDADE: Producer = { id: "6aaef358", name: "Sociedade dos Vinhos Borges", region_id: "porto", has_wines: true };
const BORGES_MADEIRA: Producer = { id: "25612e68", name: "Borges", region_id: "madeira" };
const BORGES_IRMAO: Producer = { id: "8830840e", name: "Borges & Irmao", region_id: "porto" };
const BODEGAS_TRIDENTE: Producer = { id: "7f46bd24", name: "Bodegas Tridente", region_id: "cyl", has_wines: true };
const TRIDENTE_DUPLICATE: Producer = { id: "0d1d099c", name: "Tridente", region_id: "clm" };
const ALIASES: Alias[] = [
  { id: "alias-borges-porto", producer_id: SOCIEDADE.id, alias: "Borges Porto" },
  { id: "alias-tridente", producer_id: BODEGAS_TRIDENTE.id, alias: "Tridente" },
];

/** Live as of 2026-09-13, and after approval 2's merge deletes the duplicate. */
const LIVE: Producer[] = [SOCIEDADE, BORGES_MADEIRA, BORGES_IRMAO, BODEGAS_TRIDENTE, TRIDENTE_DUPLICATE];
const MERGED: Producer[] = LIVE.filter((p) => p.id !== TRIDENTE_DUPLICATE.id);

const snapshot = (producers: Producer[], aliases?: Alias[]): ReferenceSnapshot => ({
  countries: [{ id: "pt", name: "Portugal" }, { id: "es", name: "Spain" }],
  regions: [
    { id: "porto", name: "Porto", country_id: "pt" },
    { id: "madeira", name: "Madeira", country_id: "pt" },
    { id: "cyl", name: "Castilla y Leon", country_id: "es" },
    { id: "clm", name: "Castilla La Mancha", country_id: "es" },
  ],
  appellations: [],
  none: [],
  producers,
  ...(aliases === undefined ? {} : { aliases }),
  grapes: [],
  type_designations: [],
});

const find = (s: ReferenceSnapshot, name: string, regionId: string | null) => snapshotLookup(s).producerByFoldedName(name, regionId);
const pick = async (s: ReferenceSnapshot, name: string, regionId: string | null) => (await find(s, name, regionId))?.id ?? null;

describe("producer aliases in the folded lookup (20260914113500)", () => {
  it("a printed brand that folds to no producer finds the producer its alias names, with that producer's own name and region link", async () => {
    expect(await find(snapshot(LIVE, ALIASES), "Borges Porto", null))
      .toEqual({ id: SOCIEDADE.id, name: "Sociedade dos Vinhos Borges", regionId: "porto" });
  });

  it.each(["BORGES PORTO", "borges porto", "  Bórges-Pórto ", "Borges\tPorto", "Borges–Porto", "BorgesPorto", "Borges  Porto"])(
    "%j folds equal to the 'Borges Porto' alias",
    async (query) => {
      expect(await pick(snapshot(LIVE, ALIASES), query, null)).toBe(SOCIEDADE.id);
    },
  );

  it("the region never filters or reorders an alias hit", async () => {
    for (const regionId of [null, "porto", "madeira", "cyl"]) {
      expect(await pick(snapshot(LIVE, ALIASES), "Borges Porto", regionId)).toBe(SOCIEDADE.id);
    }
  });

  it("there is no plain 'Borges' alias: 'Borges' still finds the Madeira house wherever the label was read", async () => {
    for (const regionId of [null, "porto", "madeira"]) {
      expect(await pick(snapshot(LIVE, ALIASES), "Borges", regionId)).toBe(BORGES_MADEIRA.id);
      expect(await pick(snapshot(LIVE, ALIASES), " BORGES", regionId)).toBe(BORGES_MADEIRA.id);
    }
    expect(await pick(snapshot(LIVE, ALIASES), "Borges & Irmão", "porto")).toBe(BORGES_IRMAO.id);
  });

  it("a producer row always beats an alias: 'Tridente' finds the duplicate row while it exists, even in Bodegas Tridente's region", async () => {
    for (const regionId of [null, "clm", "cyl"]) {
      expect(await pick(snapshot(LIVE, ALIASES), "Tridente", regionId)).toBe(TRIDENTE_DUPLICATE.id);
      expect(await pick(snapshot(LIVE, ALIASES), "TRIDENTE ", regionId)).toBe(TRIDENTE_DUPLICATE.id);
    }
  });

  it("once the duplicate row is gone the alias takes over; without it the name would stay pending", async () => {
    for (const regionId of [null, "clm", "cyl"]) {
      expect(await find(snapshot(MERGED, ALIASES), "Tridente", regionId))
        .toEqual({ id: BODEGAS_TRIDENTE.id, name: "Bodegas Tridente", regionId: "cyl" });
    }
    expect(await pick(snapshot(MERGED), "Tridente", "clm")).toBeNull();
  });

  it("among producer rows the existing order still decides; an alias never joins the tie-break", async () => {
    // Two copies fold to "tridente"; the "Tridente" alias points at a third producer.
    const copies: Producer[] = [
      { id: "tri-clm", name: "Tri-dente", region_id: "clm" },
      { id: "tri-cyl", name: "TRI DENTE", region_id: "cyl", has_wines: true },
    ];
    const cases = [
      ["Tridente", "clm", "tri-clm"], // the given region
      ["Tridente", "cyl", "tri-cyl"], // the given region, where the alias's producer also is
      ["Tri-dente", null, "tri-clm"], // the exact spelling beats held wines
      ["Tridente", null, "tri-cyl"], // held wines
    ] as const;
    for (const [query, regionId, expected] of cases) {
      expect(await pick(snapshot([...MERGED, ...copies], ALIASES), query, regionId)).toBe(expected);
      expect(await pick(snapshot([...MERGED, ...copies]), query, regionId)).toBe(expected);
    }
  });

  it("an absent or empty aliases list means none, and aliases change nothing for a name a producer row matches", async () => {
    for (const s of [snapshot(LIVE), snapshot(LIVE, [])]) {
      expect(await pick(s, "Borges Porto", null)).toBeNull();
      expect(await pick(s, "Tridente", "cyl")).toBe(TRIDENTE_DUPLICATE.id);
    }
    const matched = [["Borges", "porto"], ["Sociedade dos Vinhos Borges", null], ["Bodegas Tridente", "clm"], ["Tridente", "cyl"]] as const;
    for (const [query, regionId] of matched) {
      expect(await pick(snapshot(LIVE, ALIASES), query, regionId)).toBe(await pick(snapshot(LIVE), query, regionId));
    }
  });

  it("a name that folds to nothing, or to no producer and no alias, finds nothing", async () => {
    for (const query of ["", "  ", " – ", "Guigal", "Borges Portugal", "Porto", "Tridentes"]) {
      expect(await pick(snapshot(MERGED, ALIASES), query, "porto")).toBeNull();
    }
  });

  it("a snapshot whose alias names a producer it does not carry is broken, not a miss", async () => {
    const withoutTarget = snapshot(LIVE.filter((p) => p.id !== SOCIEDADE.id), ALIASES);
    await expect(find(withoutTarget, "Borges Porto", null)).rejects.toThrow(/6aaef358/);
  });

  it("two aliases that fold equal are a broken snapshot (the unique index on the folded name forbids them)", async () => {
    const twins = [...ALIASES, { id: "alias-borges-porto-2", producer_id: BORGES_IRMAO.id, alias: "BORGES-PORTO" }];
    await expect(find(snapshot(LIVE, twins), "Borges Porto", null)).rejects.toThrow(/fold equal/);
  });

  // The recorded round-1 and round-2 reads (committed fixtures), resolved against these
  // synthetic rows: the resolver takes the alias's producer, under that producer's name.
  describe("the recorded reads of #12 and #15", () => {
    const LIVE_DIR = path.join(process.cwd(), "src/lib/label-scan/__fixtures__/live");
    const producerOf = async (file: string, s: ReferenceSnapshot) =>
      (await resolveLabelRead(coerceLabelRead(JSON.parse(readFileSync(path.join(LIVE_DIR, file), "utf8"))), snapshotLookup(s), { imageUrl: null }))
        .producer;

    it("#12 round 2's 'Borges Porto' becomes Sociedade dos Vinhos Borges, never Madeira's Borges", async () => {
      expect(await producerOf("r2/borges-porto-2004.json", snapshot(LIVE, ALIASES)))
        .toEqual({ kind: "existing", id: SOCIEDADE.id, name: "Sociedade dos Vinhos Borges" });
      expect(await producerOf("r2/borges-porto-2004.json", snapshot(LIVE))).toEqual({ kind: "pending", name: "Borges Porto" });
    });

    it.each(["tridente-vintage-unread.json", "r2/tridente-vintage-unread.json"])(
      "#15 %s keeps the duplicate while it exists and becomes Bodegas Tridente after the merge",
      async (file) => {
        expect(await producerOf(file, snapshot(LIVE, ALIASES))).toEqual({ kind: "existing", id: TRIDENTE_DUPLICATE.id, name: "Tridente" });
        expect(await producerOf(file, snapshot(MERGED, ALIASES))).toEqual({ kind: "existing", id: BODEGAS_TRIDENTE.id, name: "Bodegas Tridente" });
        expect(await producerOf(file, snapshot(MERGED))).toEqual({ kind: "pending", name: "Tridente" });
      },
    );
  });
});
