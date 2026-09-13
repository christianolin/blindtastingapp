// Live label reads, replayed (plan L1, spec §G.5 "Afterwards"). Every fixture in
// src/lib/label-scan/__fixtures__/live is one stored `label_reads.read` from L1's
// claude-sonnet-5 run (2026-09-13), copied unchanged and checked against the
// database. Each one resolves here against the committed reference snapshot at
// zero API cost. When this file was written, all 15 replays equalled the live
// drafts field for field, ids included.
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
  {
    entry: 1, file: "saint-georges-2012.json", labelReadId: "8bc1018a-4b85-4ad7-a118-ceeca4ea177b",
    why: "appellation: expectation — the label prints SAINT-EMILION GRAND CRU; the catalog row says Saint-Émilion AOC",
    resolved: {
      country: "France", region: "Bordeaux", appellation: "Saint-Émilion Grand Cru AOC",
      producer: existing("373cbe79-d827-4f15-9970-2d5209be198d", "Château Saint Georges"),
      grapes: [["existing", "Merlot", 70], ["existing", "Cabernet Franc", 25], ["existing", "Cabernet Sauvignon", 5]],
      vintage: year(2012), colour: "RED", style: "STILL", designation: "Grand Cru Classé", missing: [],
    },
  },
  {
    entry: 2, file: "jean-marc-boillot-vintage-unread.json", labelReadId: "d1d3ffe8-428f-4076-93f3-244ee186a3d5",
    why: "producer: model — the bottler line's full name, not the printed J.M. Boillot; no initials rule (see below). vintage: by-design (D7)",
    resolved: {
      country: "France", region: "Bourgogne", appellation: "Bourgogne AOC",
      producer: pending("Jean-Marc Boillot"),
      grapes: [["existing", "Chardonnay", 100]],
      vintage: UNREAD, colour: "WHITE", style: "STILL", designation: null, missing: ["vintage"],
    },
  },
  {
    entry: 3, file: "paitin-2015.json", labelReadId: "ebd6e94c-cd32-448b-997d-65168d568164",
    why: "producer: expectation — the catalog producer 'Vecchie Vigne Paitin' is the cuvée; Paitin is the estate",
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
    why: "producer: expectation — the catalog's 'Gasleni Alberti' is the owning family, misspelt; the estate is Badia di Morrona. vintage: by-design (D7)",
    resolved: {
      country: "Italy", region: "Toscana", appellation: "Toscana IGT",
      producer: existing("22c8b23c-b49f-4136-80d1-207c48746970", "Badia di Morrona"),
      grapes: [["existing", "Sangiovese", null], ["existing", "Merlot", null]],
      vintage: UNREAD, colour: "RED", style: "STILL", designation: null, missing: ["vintage"],
    },
  },
  {
    entry: 6, file: "ampelos-2021.json", labelReadId: "2973f668-a942-4bf6-8bb3-b54b1c289dd1",
    why: "producer and appellation: expectation — the label prints 'ampelos' and 'sta. rita hills'; the catalog row says Ampelos Vineyard, California AVA",
    resolved: {
      country: "United States", region: "California", appellation: "Sta. Rita Hills AVA",
      producer: existing("a2e0f8f0-69c6-45cd-b635-56b0e67015b6", "Ampelos"),
      grapes: [["existing", "Syrah", 50], ["existing", "Grenache", 50]],
      vintage: year(2021), colour: "RED", style: "STILL", designation: null, missing: [],
    },
  },
  {
    entry: 7, file: "el-enemigo-2019.json", labelReadId: "1919c1bf-4874-4b82-8274-1d039175a39f",
    why: "region and appellation: model — the read flags noGeographicIndication for a label printing 'Mendoza · Argentina', so step 2 takes Argentina's None pair",
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
    why: "producer: expectation — the catalog name bundles brand and legal entity; the read's printed company name stays a new producer. designation 'Vintage' finds no row: the reference row is 'Vintage Port' (reported, not changed)",
    resolved: {
      country: "Portugal", region: "Porto", appellation: "Porto DOC",
      producer: pending("Sociedade dos Vinhos Borges"),
      // "Tinta Roriz" is Tempranillo's Portuguese synonym (grape-canonical.ts).
      grapes: [["existing", "Touriga Nacional", null], ["existing", "Touriga Franca", null], ["existing", "Tempranillo", null], ["existing", "Tinta Barroca", null]],
      vintage: year(2004), colour: "RED", style: "FORTIFIED", designation: null, missing: [],
    },
  },
  {
    entry: 13, file: "vidal-fleury-2020.json", labelReadId: "828c9403-1a51-4e9e-a752-b105ae2c0708",
    why: "producer hit by name on 'Vidal-Fleury', the copy holding the catalog wine: the exact spelling wins the folded tie (20260914112500, owner approval 3)",
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
    why: "appellation: write-time ('Just the region' at Fix). vintage: by-design (D7). The region itself is doubtful: Tridente is Vino de la Tierra de Castilla y León (reported)",
    resolved: {
      country: "Spain", region: "Castilla La Mancha", appellation: null,
      producer: existing("0d1d099c-3ee0-4601-99ee-d0d4f5ffd194", "Tridente"),
      grapes: [["existing", "Tempranillo", 100]],
      vintage: UNREAD, colour: "RED", style: "STILL", designation: null, missing: ["vintage", "appellation"],
    },
  },
];

describe("the live fixtures (plan L1)", () => {
  it("every fixture has exactly one replay row, and every row a fixture", () => {
    const files = readdirSync(LIVE_DIR).filter((f) => f.endsWith(".json")).sort();
    expect(CASES.map((c) => c.file).sort()).toEqual(files);
    expect(new Set(CASES.map((c) => c.labelReadId)).size).toBe(CASES.length);
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

  it("a partial read's appellation waits for 'Just the region' at Fix: the region has one, and the resolver never picks it (#4, #15)", async () => {
    // Spec §B.5 step 5 and D8: a region-level read never becomes the region's
    // self-named appellation; the user picks it explicitly (§C.5 A7, plan F13).
    for (const [file, self] of [["changyu-moser-xv-2022.json", "Ningxia"], ["tridente-vintage-unread.json", "Castilla La Mancha"]] as const) {
      const d = await replay(read(file));
      expect([file, d.appellationId, d.provenance.appellation, selfNamedIn(d.regionId)]).toEqual([file, null, undefined, [self]]);
    }
  });

  it("#7 turns on the model's no-GI flag: read as a GI, the same label resolves to Mendoza and waits for 'Just the region'", async () => {
    const flagged = await replay(read("el-enemigo-2019.json"));
    const none = snap.none.find((n) => n.country_id === flagged.countryId)!;
    expect([flagged.regionId, flagged.appellationId, flagged.provenance.region]).toEqual([none.region_id, none.appellation_id, "label"]);

    const asGi = await replay({ ...read("el-enemigo-2019.json"), noGeographicIndication: false });
    expect([nameOf(snap.regions, asGi.regionId), asGi.provenance.region, asGi.appellationId, missingWineFields(asGi, { now: NOW })])
      .toEqual(["Mendoza", "label", null, ["appellation"]]);
    expect(selfNamedIn(asGi.regionId)).toEqual(["Mendoza"]);
  });

  it("near-miss producers are in the snapshot, so each pending or twin outcome is the resolver's choice, not a missing row", async () => {
    const folded = (key: string) => snap.producers.filter((p) => foldName(p.name) === key).map((p) => p.name).sort();
    // #2: three rows fold to "jmboillot". "Jean-Marc Boillot" stays pending: an
    // initials rule would also turn a "Jean-Michel Boillot" into J.M. Boillot.
    expect(folded("jmboillot")).toEqual(["J. M. Boillot", "J. M.Boillot", "J.M. Boillot"]);
    expect((await replay(read("jean-marc-boillot-vintage-unread.json"))).producer).toEqual(pending("Jean-Marc Boillot"));
    // #12: the company name never becomes Madeira's "Borges" (H.M. Borges), Porto's
    // "Borges & Irmao", or the catalog's bundled name — stripping "Sociedade dos
    // Vinhos" would land on the Madeira house.
    expect([folded("borges"), folded("borgesirmao"), folded("borgessociedadedosvinhosborgessa")])
      .toEqual([["Borges"], ["Borges & Irmao"], ["Borges (Sociedade dos Vinhos Borges, S.A.)"]]);
    expect((await replay(read("sociedade-dos-vinhos-borges-2004.json"))).producer).toEqual(pending("Sociedade dos Vinhos Borges"));
    // #13: two Rhône-linked rows fold to "vidalfleury"; the exact spelling picks "Vidal-Fleury".
    expect(folded("vidalfleury")).toEqual(["Vidal Fleury", "Vidal-Fleury"]);
    // #15: "Bodegas Tridente" (Castilla y Leon) is never reached from "Tridente": title words are never stripped.
    expect(folded("bodegastridente")).toEqual(["Bodegas Tridente"]);
    expect((await replay(read("tridente-vintage-unread.json"))).producer).toEqual(existing("0d1d099c-3ee0-4601-99ee-d0d4f5ffd194", "Tridente"));
  });
});
