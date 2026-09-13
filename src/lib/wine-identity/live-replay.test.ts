// Live label reads, replayed (plan L1, spec §G.5 "Afterwards"). Every fixture in
// src/lib/label-scan/__fixtures__/live is one stored `label_reads.read`, copied
// unchanged and checked byte for byte against the database:
// - `live/*.json`: round 1, L1's claude-sonnet-5 read of each of the 15 test-set
//   photos (2026-09-12);
// - `live/r2/*.json`: round 2, the owner-approved re-reads of #2, #4, #7, #12 and
//   #15 under the approved reader instructions (11d4c3f; plan amendment 21,
//   2026-09-13), named like round 1 from the read's own producer and vintage.
// Each one resolves here against the committed reference snapshot at zero API
// cost. The snapshot was re-exported after amendment 21's live catalog
// corrections and producer merges, and carries `has_wines`. When the round-2 rows
// were added, each round-2 replay equalled its live draft field for field, ids
// included; a round-1 row that no longer equals L1's live draft names the live
// change that moved it in its `why` note.
//
// A changed row below is a changed resolver outcome for a real label: change one
// only on purpose, with the reason beside it. The `why` notes carry L1b's
// classification of each miss the live run reported (resolver / model /
// expectation / by-design / write-time); none was a resolver miss.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { coerceLabelRead, type LabelRead } from "../label-scan/label-read-schema";
import { missingWineFields } from "./complete";
import { foldName, stripDesignationSuffix } from "./fold";
import { resolveLabelRead } from "./resolve";
import type { WineIdentityDraft } from "./types";
import { loadReferenceSnapshot, snapshotLookup, type ReferenceSnapshot } from "./__fixtures__/snapshot-lookup";

const NOW = new Date("2026-09-13T12:00:00Z");
const LIVE_DIR = path.join(process.cwd(), "src/lib/label-scan/__fixtures__/live");
/** Round 2's re-reads sit one directory down; a case's `file` is relative to LIVE_DIR. */
const ROUND2_DIR = "r2";

let snap: ReferenceSnapshot;
beforeAll(() => { snap = loadReferenceSnapshot(); });

const rawFixture = (file: string): unknown => JSON.parse(readFileSync(path.join(LIVE_DIR, file), "utf8"));
const replay = (read: LabelRead) => resolveLabelRead(read, snapshotLookup(snap), { imageUrl: null });
const nameOf = (rows: { id: string; name: string }[], id: string | null) => rows.find((row) => row.id === id)?.name ?? null;
/** justTheRegionOption's rule (spec §C.5 A7, plan F13): the region's appellation whose
    name minus one designation suffix folds to the region's own name. */
const selfNamedIn = (regionId: string | null) => {
  const region = snap.regions.find((row) => row.id === regionId);
  return region
    ? snap.appellations.filter((a) => a.region_id === region.id && foldName(stripDesignationSuffix(a.name)) === foldName(region.name)).map((a) => a.name)
    : [];
};

type Grape = [kind: "existing" | "pending", name: string, percentage: number | null];
type Resolved = {
  country: string | null;
  region: string | null;
  appellation: string | null;
  producer: WineIdentityDraft["producer"];
  grapes: Grape[];
  vintage: WineIdentityDraft["vintage"];
  colour: WineIdentityDraft["colour"];
  style: WineIdentityDraft["style"];
  designation: string | null;
  missing: string[];
};

function summary(d: WineIdentityDraft): Resolved {
  return {
    country: nameOf(snap.countries, d.countryId),
    region: nameOf(snap.regions, d.regionId),
    appellation: nameOf(snap.appellations, d.appellationId),
    producer: d.producer,
    grapes: d.blend.map((row): Grape => [row.grape.kind, row.grape.name, row.percentage]),
    vintage: d.vintage,
    colour: d.colour,
    style: d.style,
    designation: nameOf(snap.type_designations, d.typeDesignationId),
    missing: missingWineFields(d, { now: NOW }),
  };
}

const UNREAD = { kind: null, year: null, tawnyYears: null, read: false } as const;
const year = (y: number) => ({ kind: "YEAR" as const, year: y, tawnyYears: null, read: true });
const existing = (id: string, name: string) => ({ kind: "existing" as const, id, name });
const pending = (name: string) => ({ kind: "pending" as const, name });

type Case = { entry: number; file: string; labelReadId: string; why?: string; resolved: Resolved };

const CASES: Case[] = [
  // ── Round 1 (2026-09-12): live/*.json ─────────────────────────────────────────
  {
    entry: 1, file: "saint-georges-2012.json", labelReadId: "8bc1018a-4b85-4ad7-a118-ceeca4ea177b",
    why: "appellation: expectation — the label prints SAINT-EMILION GRAND CRU; the catalog row said Saint-Émilion AOC until amendment 21's live catalog fix (approval 2) set Saint-Émilion Grand Cru AOC",
    resolved: {
      country: "France", region: "Bordeaux", appellation: "Saint-Émilion Grand Cru AOC",
      producer: existing("373cbe79-d827-4f15-9970-2d5209be198d", "Château Saint Georges"),
      grapes: [["existing", "Merlot", 70], ["existing", "Cabernet Franc", 25], ["existing", "Cabernet Sauvignon", 5]],
      vintage: year(2012), colour: "RED", style: "STILL", designation: "Grand Cru Classé", missing: [],
    },
  },
  {
    entry: 2, file: "jean-marc-boillot-vintage-unread.json", labelReadId: "d1d3ffe8-428f-4076-93f3-244ee186a3d5",
    why: "producer: model — the bottler line's full name, not the printed J.M. Boillot; no initials rule (see below). The approved producer instruction fixed the read: round 2 reads 'J.M. Boillot'. vintage: by-design (D7)",
    resolved: {
      country: "France", region: "Bourgogne", appellation: "Bourgogne AOC",
      producer: pending("Jean-Marc Boillot"),
      grapes: [["existing", "Chardonnay", 100]],
      vintage: UNREAD, colour: "WHITE", style: "STILL", designation: null, missing: ["vintage"],
    },
  },
  {
    entry: 3, file: "paitin-2015.json", labelReadId: "ebd6e94c-cd32-448b-997d-65168d568164",
    why: "producer: expectation — the catalog producer was 'Vecchie Vigne Paitin', a cuvée name, until amendment 21's live catalog fix (approval 2) moved the wine to Paitin, the estate the read names",
    resolved: {
      country: "Italy", region: "Piemonte", appellation: "Barbaresco DOCG",
      producer: existing("c5b25ba2-5fa4-4bc7-9820-cf7b924fe190", "Paitin"),
      grapes: [["existing", "Nebbiolo", 100]],
      vintage: year(2015), colour: "RED", style: "STILL", designation: "Riserva", missing: [],
    },
  },
  {
    entry: 4, file: "changyu-moser-xv-2022.json", labelReadId: "c5a02c1d-6cd4-4651-8b00-2a0baa6e7657",
    why: "appellation: write-time — a partial read; 'Just the region' (Ningxia) is picked at Fix, never defaulted here (spec §B.5 step 5)",
    resolved: {
      country: "China", region: "Ningxia", appellation: null,
      producer: existing("a87b88ca-70ea-4587-95f6-2ed116e958d4", "Changyu Moser XV"),
      grapes: [["existing", "Cabernet Sauvignon", 100]],
      vintage: year(2022), colour: "RED", style: "STILL", designation: null, missing: ["appellation"],
    },
  },
  {
    entry: 5, file: "badia-di-morrona-vintage-unread.json", labelReadId: "e022491a-eb82-496d-b669-222d51619531",
    why: "producer: expectation — the catalog producer was 'Gasleni Alberti', the owning family misspelt, until amendment 21's live catalog fix (approval 2) moved the wine to Badia di Morrona, the estate the read names. vintage: by-design (D7)",
    resolved: {
      country: "Italy", region: "Toscana", appellation: "Toscana IGT",
      producer: existing("22c8b23c-b49f-4136-80d1-207c48746970", "Badia di Morrona"),
      grapes: [["existing", "Sangiovese", null], ["existing", "Merlot", null]],
      vintage: UNREAD, colour: "RED", style: "STILL", designation: null, missing: ["vintage"],
    },
  },
  {
    entry: 6, file: "ampelos-2021.json", labelReadId: "2973f668-a942-4bf6-8bb3-b54b1c289dd1",
    why: "producer and appellation: expectation — the label prints 'ampelos' and 'sta. rita hills'; the catalog row said Ampelos Vineyard, California AVA until amendment 21's live catalog fix (approval 2) set Ampelos, Sta. Rita Hills AVA",
    resolved: {
      country: "United States", region: "California", appellation: "Sta. Rita Hills AVA",
      producer: existing("a2e0f8f0-69c6-45cd-b635-56b0e67015b6", "Ampelos"),
      grapes: [["existing", "Syrah", 50], ["existing", "Grenache", 50]],
      vintage: year(2021), colour: "RED", style: "STILL", designation: null, missing: [],
    },
  },
  {
    entry: 7, file: "el-enemigo-2019.json", labelReadId: "1919c1bf-4874-4b82-8274-1d039175a39f",
    why: "region and appellation: model — the read flags noGeographicIndication for a label printing 'Mendoza · Argentina', so step 2 takes Argentina's None pair. The approved instruction fixed the read: round 2 resolves Mendoza",
    resolved: {
      country: "Argentina", region: "None", appellation: "None",
      producer: existing("db803410-9cdd-4322-b53d-43b408a23b06", "El Enemigo"),
      grapes: [["existing", "Cabernet Franc", null]],
      vintage: year(2019), colour: "RED", style: "STILL", designation: null, missing: [],
    },
  },
  {
    entry: 8, file: "de-flandry-2023.json", labelReadId: "47377ac0-3329-48fc-be0e-5e7e56f30396",
    resolved: {
      country: "France", region: "Languedoc", appellation: "Limoux AOC",
      producer: existing("34673de2-4ac0-4855-8e28-d9e89cdd2995", "Château de Flandry"),
      grapes: [["existing", "Chardonnay", 100]],
      vintage: year(2023), colour: "WHITE", style: "STILL", designation: null, missing: [],
    },
  },
  {
    entry: 9, file: "rocca-alata-2018.json", labelReadId: "13b04b85-89bb-4560-8934-06712214cc4c",
    resolved: {
      country: "Italy", region: "Veneto", appellation: "Valpolicella Ripasso DOC",
      producer: existing("78aca61f-bb0e-4396-b4fd-0dcc5a52c32e", "Rocca Alata"),
      grapes: [["existing", "Corvina", null], ["existing", "Rondinella", null], ["existing", "Molinara", null]],
      vintage: year(2018), colour: "RED", style: "STILL", designation: null, missing: [],
    },
  },
  {
    entry: 10, file: "vignelaure-2007.json", labelReadId: "e9e16890-9ef8-40a2-8e6e-7b989a0fe89f",
    resolved: {
      country: "France", region: "Provence", appellation: "Coteaux d'Aix-en-Provence AOC",
      producer: existing("2445418f-b499-4a61-9a97-8d7476ffd27c", "Chateau Vignelaure"),
      grapes: [["existing", "Cabernet Sauvignon", null], ["existing", "Syrah", null], ["existing", "Grenache", null]],
      vintage: year(2007), colour: "RED", style: "STILL", designation: null, missing: [],
    },
  },
  {
    entry: 11, file: "unknown-2021.json", labelReadId: "ad1a14df-27d8-4299-9528-3c4dd4b1f0e5",
    why: "producer: expectation — L'Envolée is the cuvée (read into wineName); the front label names no producer",
    resolved: {
      country: "France", region: "Vin de France", appellation: "Vin de France",
      producer: null,
      grapes: [["existing", "Pinot Noir", 100]],
      vintage: year(2021), colour: "RED", style: "STILL", designation: null, missing: ["producer"],
    },
  },
  {
    entry: 12, file: "sociedade-dos-vinhos-borges-2004.json", labelReadId: "2ab36f41-f7b5-467c-9f24-9f48ad5cbacb",
    why: "producer: re-pinned from pending on purpose — amendment 21's live rename of catalog producer 6aaef358 ('Borges (Sociedade dos Vinhos Borges, S.A.)' → 'Sociedade dos Vinhos Borges', approval 2) makes the read's printed company name fold equal to it. designation 'Vintage' finds no row: the reference row is 'Vintage Port', and the short-form rule (approval 1b) matches neither it nor 'Late Bottled Vintage (LBV)'",
    resolved: {
      country: "Portugal", region: "Porto", appellation: "Porto DOC",
      producer: existing("6aaef358-1645-4811-bd99-daa63c585391", "Sociedade dos Vinhos Borges"),
      // "Tinta Roriz" is Tempranillo's Portuguese synonym (grape-canonical.ts).
      grapes: [["existing", "Touriga Nacional", null], ["existing", "Touriga Franca", null], ["existing", "Tempranillo", null], ["existing", "Tinta Barroca", null]],
      vintage: year(2004), colour: "RED", style: "FORTIFIED", designation: null, missing: [],
    },
  },
  {
    entry: 13, file: "vidal-fleury-2020.json", labelReadId: "828c9403-1a51-4e9e-a752-b105ae2c0708",
    why: "producer hit by name on 'Vidal-Fleury' (58116bac), the copy holding the catalog wine. Since amendment 21's live merge deleted its 'Vidal Fleury' twin (9f9c976f), it is the only row folding to 'vidalfleury', so no tie-break decides it any more",
    resolved: {
      country: "France", region: "Rhône", appellation: "Ventoux AOC",
      producer: existing("58116bac-f5d6-43fa-bc89-8a32147049f9", "Vidal-Fleury"),
      grapes: [["existing", "Grenache", null], ["existing", "Syrah", null]],
      vintage: year(2020), colour: "RED", style: "STILL", designation: null, missing: [],
    },
  },
  {
    entry: 14, file: "georges-duboeuf-2022.json", labelReadId: "8e407742-d481-4c5a-8b55-add576d89183",
    resolved: {
      country: "France", region: "Beaujolais", appellation: "Beaujolais-Villages AOC",
      producer: existing("3e01b802-336e-4d19-864d-a8bf4466e271", "Georges Duboeuf"),
      grapes: [["existing", "Gamay", 100]],
      vintage: year(2022), colour: "RED", style: "STILL", designation: null, missing: [],
    },
  },
  {
    entry: 15, file: "tridente-vintage-unread.json", labelReadId: "b0c61af8-724b-47a5-a7da-67a1bfff9946",
    why: "appellation: write-time ('Just the region' at Fix). vintage: by-design (D7). region: model (reported) — amendment 21's live catalog fix (approval 2) placed the wine in Castilla y Leon under Bodegas Tridente; the read's Castilla-La Mancha still resolves as read, and its 'Tridente' still finds the duplicate row 0d1d099c, which was not approved for deletion",
    resolved: {
      country: "Spain", region: "Castilla La Mancha", appellation: null,
      producer: existing("0d1d099c-3ee0-4601-99ee-d0d4f5ffd194", "Tridente"),
      grapes: [["existing", "Tempranillo", 100]],
      vintage: UNREAD, colour: "RED", style: "STILL", designation: null, missing: ["vintage", "appellation"],
    },
  },

  // ── Round 2 (2026-09-13): live/r2/*.json, the approved re-reads after 11d4c3f ────
  {
    entry: 2, file: "r2/j-m-boillot-vintage-unread.json", labelReadId: "c956fc33-6124-4a8a-81d3-608b20183a4d",
    why: "producer: the approved brand rule reads the printed 'J.M. Boillot', which finds 266af94b, since amendment 21's live merge the only row folding to 'jmboillot'. vintage: by-design (D7) — the read says NV with vintageRead false",
    resolved: {
      country: "France", region: "Bourgogne", appellation: "Bourgogne AOC",
      producer: existing("266af94b-186b-465c-bea3-f4e9c0215f0a", "J.M. Boillot"),
      grapes: [["existing", "Chardonnay", 100]],
      vintage: UNREAD, colour: "WHITE", style: "STILL", designation: null, missing: ["vintage"],
    },
  },
  {
    entry: 4, file: "r2/changyu-moser-xv-2022.json", labelReadId: "27655b40-e13c-4832-8055-37a3fdff627b",
    why: "appellation: the read names the label's full origin, 'Ningxia Helan Mountain Eastern Foothills', not 'Ningxia'; no reference row agrees, so it still waits for 'Just the region' (Ningxia) at Fix (reported). The grape percentage is now unread (round 1: 100)",
    resolved: {
      country: "China", region: "Ningxia", appellation: null,
      producer: existing("a87b88ca-70ea-4587-95f6-2ed116e958d4", "Changyu Moser XV"),
      grapes: [["existing", "Cabernet Sauvignon", null]],
      vintage: year(2022), colour: "RED", style: "STILL", designation: null, missing: ["appellation"],
    },
  },
  {
    entry: 7, file: "r2/el-enemigo-2019.json", labelReadId: "5813406a-eb24-49fe-b14f-4eaf057578b8",
    why: "region and appellation: the approved noGeographicIndication and appellation instructions read the flag false and the appellation 'Mendoza', so step 4 agrees on Mendoza's self-named row — round 1's None pair is gone",
    resolved: {
      country: "Argentina", region: "Mendoza", appellation: "Mendoza",
      producer: existing("db803410-9cdd-4322-b53d-43b408a23b06", "El Enemigo"),
      grapes: [["existing", "Cabernet Franc", null]],
      vintage: year(2019), colour: "RED", style: "STILL", designation: null, missing: [],
    },
  },
  {
    entry: 12, file: "r2/borges-porto-2004.json", labelReadId: "8fb4d4d3-c2fd-4a24-9acf-ce46d0e48f2a",
    why: "producer: the approved brand rule reads 'Borges Porto', which folds to no producer, so it stays pending — never Madeira's 'Borges' or Porto's 'Borges & Irmao', and not the catalog's 'Sociedade dos Vinhos Borges' (for the owner). designation: 'Vintage Port' now folds equal to its reference row",
    resolved: {
      country: "Portugal", region: "Porto", appellation: "Porto DOC",
      producer: pending("Borges Porto"),
      // "Tinta Roriz" is Tempranillo's Portuguese synonym (grape-canonical.ts).
      grapes: [["existing", "Touriga Nacional", null], ["existing", "Touriga Franca", null], ["existing", "Tempranillo", null], ["existing", "Tinta Barroca", null]],
      vintage: year(2004), colour: "RED", style: "FORTIFIED", designation: "Vintage Port", missing: [],
    },
  },
  {
    entry: 15, file: "r2/tridente-vintage-unread.json", labelReadId: "06c355b5-2e23-43e1-8b81-c3a918000ff6",
    why: "region: model (reported) — the label prints only 'TRIDENTE / TEMPRANILLO', yet the read still names Castilla-La Mancha (confidence medium) despite the approved null-region instruction. Otherwise the same draft as round 1: appellation write-time, vintage by-design (D7)",
    resolved: {
      country: "Spain", region: "Castilla La Mancha", appellation: null,
      producer: existing("0d1d099c-3ee0-4601-99ee-d0d4f5ffd194", "Tridente"),
      grapes: [["existing", "Tempranillo", 100]],
      vintage: UNREAD, colour: "RED", style: "STILL", designation: null, missing: ["vintage", "appellation"],
    },
  },
];

const isRound2 = (c: Case) => c.file.startsWith(`${ROUND2_DIR}/`);

describe("the live fixtures (plan L1)", () => {
  it("every fixture has exactly one replay row, and every row a fixture", () => {
    const dirs = readdirSync(LIVE_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    expect(dirs).toEqual([ROUND2_DIR]);
    const files = [
      ...readdirSync(LIVE_DIR).filter((f) => f.endsWith(".json")),
      ...readdirSync(path.join(LIVE_DIR, ROUND2_DIR)).filter((f) => f.endsWith(".json")).map((f) => `${ROUND2_DIR}/${f}`),
    ].sort();
    expect(CASES.map((c) => c.file).sort()).toEqual(files);
    expect(new Set(CASES.map((c) => c.labelReadId)).size).toBe(CASES.length);
  });

  it("round 1 covers the 15 test-set entries; round 2 re-reads exactly the approved #2, #4, #7, #12 and #15", () => {
    expect(CASES.filter((c) => !isRound2(c)).map((c) => c.entry)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(CASES.filter(isRound2).map((c) => c.entry)).toEqual([2, 4, 7, 12, 15]);
  });

  it.each(CASES.map((c) => [c.file, c] as const))("%s is a stored read: coerceLabelRead leaves it unchanged", (_file, c) => {
    const raw = rawFixture(c.file);
    expect(coerceLabelRead(raw)).toEqual(raw);
  });
});

describe("resolveLabelRead replays each live read against the snapshot (spec §G.5)", () => {
  it.each(CASES.map((c) => [`#${c.entry} ${c.file}`, c] as const))("%s", async (_name, c) => {
    const draft = await replay(coerceLabelRead(rawFixture(c.file)));
    expect(summary(draft)).toEqual(c.resolved);
  });
});

describe("what the live misses turn on", () => {
  const read = (file: string) => coerceLabelRead(rawFixture(file));

  it("a partial read's appellation waits for 'Just the region' at Fix: the region has one, and the resolver never picks it (#4, #15, both rounds)", async () => {
    // Spec §B.5 step 5 and D8: a region-level read never becomes the region's
    // self-named appellation; the user picks it explicitly (§C.5 A7, plan F13).
    // Round 2's #4 names an appellation no reference row agrees with, which ends the same way.
    for (const [file, self] of [
      ["changyu-moser-xv-2022.json", "Ningxia"],
      ["r2/changyu-moser-xv-2022.json", "Ningxia"],
      ["tridente-vintage-unread.json", "Castilla La Mancha"],
      ["r2/tridente-vintage-unread.json", "Castilla La Mancha"],
    ] as const) {
      const d = await replay(read(file));
      expect([file, d.appellationId, d.provenance.appellation, selfNamedIn(d.regionId)]).toEqual([file, null, undefined, [self]]);
    }
  });

  it("#7 turns on the model's no-GI flag: read as a GI, the same label resolves to Mendoza and waits for 'Just the region'; round 2's read names the appellation too", async () => {
    const flagged = await replay(read("el-enemigo-2019.json"));
    const none = snap.none.find((n) => n.country_id === flagged.countryId)!;
    expect([flagged.regionId, flagged.appellationId, flagged.provenance.region]).toEqual([none.region_id, none.appellation_id, "label"]);

    const asGi = await replay({ ...read("el-enemigo-2019.json"), noGeographicIndication: false });
    expect([nameOf(snap.regions, asGi.regionId), asGi.provenance.region, asGi.appellationId, missingWineFields(asGi, { now: NOW })])
      .toEqual(["Mendoza", "label", null, ["appellation"]]);
    expect(selfNamedIn(asGi.regionId)).toEqual(["Mendoza"]);

    // Round 2, under the approved instructions: the flag is false and the appellation
    // reads "Mendoza", so step 4 agrees on that self-named row from the label.
    const reread = await replay(read("r2/el-enemigo-2019.json"));
    expect([nameOf(snap.regions, reread.regionId), nameOf(snap.appellations, reread.appellationId), reread.provenance.appellation, missingWineFields(reread, { now: NOW })])
      .toEqual(["Mendoza", "Mendoza", "label", []]);
  });

  it("near-miss producers are in the snapshot, so each pending or existing outcome is the resolver's choice, not a missing row", async () => {
    const folded = (key: string) => snap.producers.filter((p) => foldName(p.name) === key).map((p) => p.name).sort();
    // The export asks for every folded key below, and for has_wines on every producer row.
    expect(snap.producers.every((p) => typeof p.has_wines === "boolean")).toBe(true);
    // #2: since amendment 21's live merge (745fc108 and b50dfcdf into 266af94b) one row folds to "jmboillot".
    // Round 1's "Jean-Marc Boillot" stays pending: an initials rule would also turn a "Jean-Michel Boillot"
    // into J.M. Boillot. Round 2's printed "J.M. Boillot" finds the row.
    expect(folded("jmboillot")).toEqual(["J.M. Boillot"]);
    expect((await replay(read("jean-marc-boillot-vintage-unread.json"))).producer).toEqual(pending("Jean-Marc Boillot"));
    expect((await replay(read("r2/j-m-boillot-vintage-unread.json"))).producer)
      .toEqual(existing("266af94b-186b-465c-bea3-f4e9c0215f0a", "J.M. Boillot"));
    // #12: the live rename left no row under the bundled name and one under the company name, which round 1's
    // read now finds. No read becomes Madeira's "Borges" (H.M. Borges) or Porto's "Borges & Irmao" — stripping
    // "Sociedade dos Vinhos" would land on the Madeira house — and round 2's brand "Borges Porto" folds to no row.
    expect([folded("borges"), folded("borgesirmao"), folded("borgessociedadedosvinhosborgessa"), folded("sociedadedosvinhosborges"), folded("borgesporto")])
      .toEqual([["Borges"], ["Borges & Irmao"], [], ["Sociedade dos Vinhos Borges"], []]);
    expect((await replay(read("sociedade-dos-vinhos-borges-2004.json"))).producer)
      .toEqual(existing("6aaef358-1645-4811-bd99-daa63c585391", "Sociedade dos Vinhos Borges"));
    expect((await replay(read("r2/borges-porto-2004.json"))).producer).toEqual(pending("Borges Porto"));
    // #13: the live merge deleted the "Vidal Fleury" twin (9f9c976f); one row folds to "vidalfleury".
    expect(folded("vidalfleury")).toEqual(["Vidal-Fleury"]);
    // #15: "Bodegas Tridente" (Castilla y Leon, the catalog's producer since the live fix) is never reached
    // from "Tridente": title words are never stripped. Both rounds read "Tridente".
    expect(folded("bodegastridente")).toEqual(["Bodegas Tridente"]);
    for (const file of ["tridente-vintage-unread.json", "r2/tridente-vintage-unread.json"]) {
      expect((await replay(read(file))).producer).toEqual(existing("0d1d099c-3ee0-4601-99ee-d0d4f5ffd194", "Tridente"));
    }
  });
});
