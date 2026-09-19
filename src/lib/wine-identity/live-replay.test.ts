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
// corrections and producer merges, and carries `has_wines`. It was re-exported
// again once amendment 24's round-2 follow-ups were live (2026-09-13): the curated
// alternative producer names of migration 20260914113500 ("Borges Porto",
// "Tridente"), which it carries as `aliases`; the merge of the duplicate "Tridente"
// (0d1d099c) into Bodegas Tridente; and the deletion of the orphaned "Vecchie Vigne
// Paitin" and "Gasleni Alberti". When the round-2 rows were added, each round-2
// replay equalled its live draft field for field, ids included. A row that no
// longer equals its live draft names what moved it in its `why` note: a live
// catalog change (an alternative producer name, a merge), or a later owner-approved
// resolver rule (approval 3's region conflict, approval 4's curated appellation
// synonym, the 2026-09-14 self-named-appellation rule, step 7.5, or the 2026-09-19
// owner fixes A/B: the region from the producer link when the label does not print
// the read's region, and the appellation of other vintages of the same wine, step
// 7.6). For fix B the snapshot carries `catalog_wines`: exactly the two live Bodegas
// Tridente rows (2018 and 2020), and nothing else, so no other replay row moves.
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
    why: "appellation: re-pinned from null on purpose (owner rule 2026-09-14, step 7.5) — a partial read with no appellation text, but its own rawText names 'NINGXIA' by name and Ningxia has exactly one appellation, the self-named row, so it no longer waits for 'Just the region' at Fix. Neither round-2 follow-up moved this before: approval 4's synonym needed appellation text, and approval 3 found no conflict, since the producer's region link is Ningxia, the read's own region",
    resolved: {
      country: "China", region: "Ningxia", appellation: "Ningxia",
      producer: existing("a87b88ca-70ea-4587-95f6-2ed116e958d4", "Changyu Moser XV"),
      grapes: [["existing", "Cabernet Sauvignon", 100]],
      vintage: year(2022), colour: "RED", style: "STILL", designation: null, missing: [],
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
    why: "producer: re-pinned on purpose once amendment 24's approval 2 was live — its merge deleted the duplicate 'Tridente' row 0d1d099c (linked to Castilla La Mancha), so no producer row folds to 'tridente', and its curated alternative name 'Tridente' (migration 20260914113500) finds Bodegas Tridente (7f46bd24), linked to Castilla y Leon, where amendment 21's live catalog fix (approval 2) placed the wine. region and appellation: re-pinned from null on purpose (owner fixes A and B, 2026-09-19) — the label ('TRIDENTE TEMPRANILLO') does not print the read's Castilla-La Mancha, so Bodegas Tridente's region link, Castilla y Leon, wins (fix A; approval 3 used to blank it); and the catalog's 2018 and 2020 Tridente rows (RED, STILL, Tempranillo) both name Castilla y Leon's self-named appellation, so step 7.6 takes it (fix B). region: model (still reported: the read names a region from memory). vintage: by-design (D7)",
    resolved: {
      country: "Spain", region: "Castilla y Leon", appellation: "Castilla y Leon",
      producer: existing("7f46bd24-f237-48e2-a151-ea52e66c2d09", "Bodegas Tridente"),
      grapes: [["existing", "Tempranillo", 100]],
      vintage: UNREAD, colour: "RED", style: "STILL", designation: null, missing: ["vintage"],
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
    why: "appellation: re-pinned from null on purpose — the read names the label's full origin, 'Ningxia Helan Mountain Eastern Foothills', which no reference row agrees with; owner approval 4's curated appellation synonym (region-canonical.ts), applied because the read's region resolved to Ningxia, reads it as the existing 'Ningxia' appellation (328c774b), so the draft is complete and no longer equals its live draft (appellation null). The grape percentage is unread (round 1: 100)",
    resolved: {
      country: "China", region: "Ningxia", appellation: "Ningxia",
      producer: existing("a87b88ca-70ea-4587-95f6-2ed116e958d4", "Changyu Moser XV"),
      grapes: [["existing", "Cabernet Sauvignon", null]],
      vintage: year(2022), colour: "RED", style: "STILL", designation: null, missing: [],
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
    why: "producer: re-pinned from pending on purpose once amendment 24's approval 1 was live — the approved brand rule reads 'Borges Porto', which still folds to no producer row, and the curated alternative name 'Borges Porto' (migration 20260914113500) finds the catalog's Sociedade dos Vinhos Borges (6aaef358), so the draft no longer equals its live draft (producer pending). Never Madeira's 'Borges' or Porto's 'Borges & Irmao': no alternative name leads to either. designation: unlike round 1's 'Vintage', 'Vintage Port' folds equal to its reference row",
    resolved: {
      country: "Portugal", region: "Porto", appellation: "Porto DOC",
      producer: existing("6aaef358-1645-4811-bd99-daa63c585391", "Sociedade dos Vinhos Borges"),
      // "Tinta Roriz" is Tempranillo's Portuguese synonym (grape-canonical.ts).
      grapes: [["existing", "Touriga Nacional", null], ["existing", "Touriga Franca", null], ["existing", "Tempranillo", null], ["existing", "Tinta Barroca", null]],
      vintage: year(2004), colour: "RED", style: "FORTIFIED", designation: "Vintage Port", missing: [],
    },
  },
  {
    entry: 15, file: "r2/tridente-vintage-unread.json", labelReadId: "06c355b5-2e23-43e1-8b81-c3a918000ff6",
    why: "region: model (reported) — the label prints only 'TRIDENTE / TEMPRANILLO', yet the read still names Castilla-La Mancha (confidence medium) despite the approved null-region instruction. producer: re-pinned on purpose for round 1's reason — once amendment 24's approval 2 was live, its merge had deleted 0d1d099c and 'Tridente' finds Bodegas Tridente (7f46bd24) through its curated alternative name (migration 20260914113500). region and appellation: re-pinned from null on purpose for round 1's reasons (owner fixes A and B, 2026-09-19) — the unprinted Castilla-La Mancha gives way to the producer's link, Castilla y Leon, and the catalog's other Tridente vintages name Castilla y Leon's self-named appellation. So the draft no longer equals its live draft (producer 0d1d099c, region Castilla La Mancha). vintage: by-design (D7)",
    resolved: {
      country: "Spain", region: "Castilla y Leon", appellation: "Castilla y Leon",
      producer: existing("7f46bd24-f237-48e2-a151-ea52e66c2d09", "Bodegas Tridente"),
      grapes: [["existing", "Tempranillo", 100]],
      vintage: UNREAD, colour: "RED", style: "STILL", designation: null, missing: ["vintage"],
    },
  },

  // ── Sassicaia live-bug pin (2026-09-13): sassicaia-2022.json ────────────────────
  // Not part of L1's 15-entry test set — pins the fix for the appellation-prefix-
  // designation bug (migration 20260914114217_appellation_prefix_designations.sql).
  // Before the migration, appellation a4522526 was named "DOC Bolgheri Sassicaia"
  // (designation as a prefix): stripDesignationSuffix (fold.ts) only strips a
  // trailing designation word, so it folded to "docbolgherisassicaia", never equal
  // to the read's own base "bolgherisassicaia", and step 4.3 (resolve.ts) rejected
  // the row outright — draft.appellationId stayed null and missingWineFields
  // returned ["appellation"], even though search_appellations found the row and
  // the read said "Bolgheri Sassicaia DOC" correctly. The migration renamed the row
  // to "Bolgheri Sassicaia DOC" (suffix form), so it now folds to "bolgherisassicaia"
  // and agrees.
  {
    entry: 16, file: "sassicaia-2022.json", labelReadId: "68585aa8-bd59-4521-bbc9-53a4baaddfcc",
    why: "appellation: was null before 20260914114217 renamed a4522526 from the prefix form \"DOC Bolgheri Sassicaia\" to the suffix form \"Bolgheri Sassicaia DOC\", which now agrees with the read at resolve.ts step 4.3",
    resolved: {
      country: "Italy", region: "Toscana", appellation: "Bolgheri Sassicaia DOC",
      producer: existing("f72e1db7-85c7-408f-99c9-87084768148a", "Tenuta San Guido"),
      grapes: [["existing", "Cabernet Sauvignon", 85], ["existing", "Cabernet Franc", 15]],
      vintage: year(2022), colour: "RED", style: "STILL", designation: null, missing: [],
    },
  },

  // ── Tridente live-bug pin (2026-09-19): tridente-2020.json ──────────────────────
  // The owner's report ("the scanner didnt find region and appellation"): a brand-only
  // front label, "TRIDENTE 2020 TEMPRANILLO", read as Castilla-La Mancha from memory
  // with no appellation. Live, owner approval 3 blanked the region and both fields had
  // to be typed by hand. Owner fixes A and B (spec 2026-09-19-scan-region-appellation.md).
  {
    entry: 17, file: "tridente-2020.json", labelReadId: "a9e27e42-2557-486d-843f-e7c57e2e5484",
    why: "region and appellation: the live draft had neither (owner approval 3 blanked the unprinted Castilla-La Mancha). Fix A: the label does not print the read's region, so Bodegas Tridente's region link, Castilla y Leon, wins. Fix B: the catalog's 2018 and 2020 Tridente rows (RED, STILL, Tempranillo) both name Castilla y Leon's self-named appellation, so step 7.6 takes it. region: model (still reported)",
    resolved: {
      country: "Spain", region: "Castilla y Leon", appellation: "Castilla y Leon",
      producer: existing("7f46bd24-f237-48e2-a151-ea52e66c2d09", "Bodegas Tridente"),
      grapes: [["existing", "Tempranillo", 100]],
      vintage: year(2020), colour: "RED", style: "STILL", designation: null, missing: [],
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

  it("round 1 covers the 15 test-set entries plus the live-bug pins #16 and #17; round 2 re-reads exactly the approved #2, #4, #7, #12 and #15", () => {
    expect(CASES.filter((c) => !isRound2(c)).map((c) => c.entry)).toEqual([...Array.from({ length: 15 }, (_, i) => i + 1), 16, 17]);
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

  it("#4 round 1's rawText names Ningxia, so step 7.5 now resolves its self-named appellation; #15 takes the producer link's region (fix A) and its other vintages' appellation (fix B), never step 7.5 (both rounds)", async () => {
    // Owner rule 2026-09-14 (step 7.5): a region-level read with no appellation
    // text becomes the region's self-named appellation only when the label's own
    // rawText names the region by name and names no OTHER appellation of it.
    // Ningxia has exactly one appellation, the self-named row, and this read's
    // rawText names "NINGXIA", so it no longer waits for 'Just the region' at Fix.
    const ningxia = await replay(read("changyu-moser-xv-2022.json"));
    expect([read("changyu-moser-xv-2022.json").appellation, selfNamedIn(ningxia.regionId)]).toEqual([null, ["Ningxia"]]);
    expect([nameOf(snap.appellations, ningxia.appellationId), ningxia.provenance.appellation]).toEqual(["Ningxia", "label"]);

    // #15: fix A replaces the unprinted Castilla-La Mancha with the producer's link,
    // Castilla y Leon (`producer-region`), so step 7.5, which needs a `label` region,
    // never runs (D7). Fix B's step 7.6 then takes the appellation both catalog
    // vintages name, Castilla y Leon's self-named row (`catalog-sibling`). Without
    // those catalog rows the appellation stays missing, for Fix or the follow-up
    // lookup (fix C) to fill.
    const spain = snap.countries.find((c) => c.name === "Spain")!.id;
    const regionIn = (name: string) => snap.regions.find((r) => r.country_id === spain && r.name === name)?.id ?? null;
    const noCatalog = { ...snap, catalog_wines: [] };
    for (const file of ["tridente-vintage-unread.json", "r2/tridente-vintage-unread.json"]) {
      const d = await replay(read(file));
      expect([file, read(file).appellation, nameOf(snap.appellations, d.appellationId), d.provenance.appellation,
        d.regionId, d.provenance.region, selfNamedIn(regionIn("Castilla y Leon"))])
        .toEqual([file, null, "Castilla y Leon", "catalog-sibling", regionIn("Castilla y Leon"), "producer-region", ["Castilla y Leon"]]);

      const alone = await resolveLabelRead(read(file), snapshotLookup(noCatalog), { imageUrl: null });
      expect([file, alone.appellationId, alone.regionId, alone.provenance.region, missingWineFields(alone, { now: NOW })])
        .toEqual([file, null, regionIn("Castilla y Leon"), "producer-region", ["vintage", "appellation"]]);
    }
  });

  it("#4 round 2 names the label's full origin, which no reference row agrees with; only owner approval 4's curated synonym reads it as Ningxia's own appellation, inside region Ningxia", async () => {
    const reread = read("r2/changyu-moser-xv-2022.json");
    expect(reread.appellation).toBe("Ningxia Helan Mountain Eastern Foothills");
    expect(snap.appellations.filter((a) => foldName(stripDesignationSuffix(a.name)) === foldName(reread.appellation!))).toEqual([]);

    const d = await replay(reread);
    expect([nameOf(snap.regions, d.regionId), selfNamedIn(d.regionId), d.appellationId, d.provenance.appellation])
      .toEqual(["Ningxia", ["Ningxia"], "328c774b-dc53-4cfc-b95d-7003ea470b6b", "label"]);

    // The synonym needs the read's own region. With none, step 7 still fills Ningxia
    // from the producer's link, but the appellation is left for Fix.
    const unplaced = await replay({ ...reread, region: null });
    expect([unplaced.appellationId, nameOf(snap.regions, unplaced.regionId), unplaced.provenance.region])
      .toEqual([null, "Ningxia", "producer-region"]);
  });

  it("#15 under fix A: 'Tridente' reaches Bodegas Tridente, linked to Castilla y Leon, so the read's unprinted Castilla-La Mancha gives way to the link; a printed one would stay (both rounds)", async () => {
    // The live rows since amendment 24's approval 2: its merge deleted the duplicate
    // "Tridente" (0d1d099c, linked to the read's own Castilla La Mancha), so no producer
    // row folds to "tridente", and its curated alternative name leads to Bodegas
    // Tridente, linked to Castilla y Leon in the same country.
    const bodegasTridente = "7f46bd24-f237-48e2-a151-ea52e66c2d09";
    const spain = snap.countries.find((c) => c.name === "Spain")!.id;
    const link = snap.regions.find((r) => r.id === snap.producers.find((p) => p.id === bodegasTridente)?.region_id);
    expect([link?.name, link?.country_id]).toEqual(["Castilla y Leon", spain]);
    expect([
      snap.producers.filter((p) => foldName(p.name) === "tridente"),
      (snap.aliases ?? []).filter((a) => foldName(a.alias) === "tridente").map((a) => a.producer_id),
    ]).toEqual([[], [bodegasTridente]]);

    for (const file of ["tridente-vintage-unread.json", "r2/tridente-vintage-unread.json"]) {
      // The read's region resolves on its own: with no producer to link, it stays.
      const unlinked = await replay({ ...read(file), producer: null });
      expect([file, nameOf(snap.regions, unlinked.regionId), unlinked.provenance.region]).toEqual([file, "Castilla La Mancha", "label"]);

      const d = await replay(read(file));
      expect([file, d.producer, d.countryId, nameOf(snap.regions, d.regionId), d.provenance.region])
        .toEqual([file, existing(bodegasTridente, "Bodegas Tridente"), spain, "Castilla y Leon", "producer-region"]);

      // The control: a label that prints the region keeps it, and step 7.5 then
      // takes that region's self-named appellation.
      const printed = await replay({ ...read(file), rawText: "TRIDENTE · CASTILLA-LA MANCHA" });
      expect([file, nameOf(snap.regions, printed.regionId), printed.provenance.region,
        nameOf(snap.appellations, printed.appellationId), printed.provenance.appellation])
        .toEqual([file, "Castilla La Mancha", "label", "Castilla La Mancha", "label"]);
    }
  });

  it("#7 turns on the model's no-GI flag: read as a GI, the same label's rawText names Mendoza, so step 7.5 resolves its self-named appellation too, matching round 2's explicit read", async () => {
    const flagged = await replay(read("el-enemigo-2019.json"));
    const none = snap.none.find((n) => n.country_id === flagged.countryId)!;
    expect([flagged.regionId, flagged.appellationId, flagged.provenance.region]).toEqual([none.region_id, none.appellation_id, "label"]);

    // Owner rule 2026-09-14 (step 7.5): the rawText ("Mendoza · Argentina") names
    // the region, and Mendoza has exactly one appellation (the self-named row),
    // so this no longer waits for 'Just the region' at Fix either.
    const asGi = await replay({ ...read("el-enemigo-2019.json"), noGeographicIndication: false });
    expect([nameOf(snap.regions, asGi.regionId), asGi.provenance.region, nameOf(snap.appellations, asGi.appellationId), asGi.provenance.appellation, missingWineFields(asGi, { now: NOW })])
      .toEqual(["Mendoza", "label", "Mendoza", "label", []]);
    expect(selfNamedIn(asGi.regionId)).toEqual(["Mendoza"]);

    // Round 2, under the approved instructions: the flag is false and the appellation
    // reads "Mendoza", so step 4 agrees on that self-named row from the label.
    const reread = await replay(read("r2/el-enemigo-2019.json"));
    expect([nameOf(snap.regions, reread.regionId), nameOf(snap.appellations, reread.appellationId), reread.provenance.appellation, missingWineFields(reread, { now: NOW })])
      .toEqual(["Mendoza", "Mendoza", "label", []]);
  });

  it("near-miss producers are in the snapshot, so each pending or existing outcome is the resolver's choice, not a missing row", async () => {
    const folded = (key: string) => snap.producers.filter((p) => foldName(p.name) === key).map((p) => p.name).sort();
    /** The producers the curated alternative names folding to `key` lead to (20260914113500). */
    const aliased = (key: string) => (snap.aliases ?? []).filter((a) => foldName(a.alias) === key).map((a) => nameOf(snap.producers, a.producer_id)).sort();
    /** The same read against the same rows with no alternative names: what the printed name reaches on its own. */
    const withoutAliases = async (file: string) => (await resolveLabelRead(read(file), snapshotLookup({ ...snap, aliases: [] }), { imageUrl: null })).producer;
    // The export asks for every folded key below, for has_wines on every producer row, and for every alternative name.
    expect(snap.producers.every((p) => typeof p.has_wines === "boolean")).toBe(true);
    // #2: since amendment 21's live merge (745fc108 and b50dfcdf into 266af94b) one row folds to "jmboillot".
    // Round 1's "Jean-Marc Boillot" stays pending: an initials rule would also turn a "Jean-Michel Boillot"
    // into J.M. Boillot. Round 2's printed "J.M. Boillot" finds the row.
    expect(folded("jmboillot")).toEqual(["J.M. Boillot"]);
    expect((await replay(read("jean-marc-boillot-vintage-unread.json"))).producer).toEqual(pending("Jean-Marc Boillot"));
    expect((await replay(read("r2/j-m-boillot-vintage-unread.json"))).producer)
      .toEqual(existing("266af94b-186b-465c-bea3-f4e9c0215f0a", "J.M. Boillot"));
    // #3 and #5: amendment 24's approval 6 deleted the orphaned misread producers amendment 21's catalog fix
    // left without wines; both reads name the estates (the replay rows above).
    expect([folded("vecchievignepaitin"), folded("gaslenialberti")]).toEqual([[], []]);
    // #12: the live rename left no row under the bundled name and one under the company name, which round 1's
    // read finds. No read becomes Madeira's "Borges" (H.M. Borges) or Porto's "Borges & Irmao" — stripping
    // "Sociedade dos Vinhos" would land on the Madeira house. Round 2's brand "Borges Porto" still folds to no
    // producer row: since amendment 24's approval 1 its curated alternative name leads to the company, no
    // alternative name leads to either Borges house, and on its own the brand stays pending.
    expect([folded("borges"), folded("borgesirmao"), folded("borgessociedadedosvinhosborgessa"), folded("sociedadedosvinhosborges"), folded("borgesporto")])
      .toEqual([["Borges"], ["Borges & Irmao"], [], ["Sociedade dos Vinhos Borges"], []]);
    expect([aliased("borgesporto"), (snap.aliases ?? []).filter((a) => ["Borges", "Borges & Irmao"].includes(nameOf(snap.producers, a.producer_id) ?? ""))])
      .toEqual([["Sociedade dos Vinhos Borges"], []]);
    for (const file of ["sociedade-dos-vinhos-borges-2004.json", "r2/borges-porto-2004.json"]) {
      expect([file, (await replay(read(file))).producer]).toEqual([file, existing("6aaef358-1645-4811-bd99-daa63c585391", "Sociedade dos Vinhos Borges")]);
    }
    expect(await withoutAliases("r2/borges-porto-2004.json")).toEqual(pending("Borges Porto"));
    // #13: the live merge deleted the "Vidal Fleury" twin (9f9c976f); one row folds to "vidalfleury".
    expect(folded("vidalfleury")).toEqual(["Vidal-Fleury"]);
    // #15: both rounds read "Tridente". Since amendment 24's approval 2 merged the duplicate "Tridente" (0d1d099c)
    // away, no producer row folds to "tridente", and its curated alternative name leads to "Bodegas Tridente"
    // (Castilla y Leon, the catalog's producer since the live fix). Title words are still never stripped: on its
    // own, "Tridente" stays pending.
    expect([folded("tridente"), folded("bodegastridente"), aliased("tridente")]).toEqual([[], ["Bodegas Tridente"], ["Bodegas Tridente"]]);
    for (const file of ["tridente-vintage-unread.json", "r2/tridente-vintage-unread.json"]) {
      expect([file, (await replay(read(file))).producer, await withoutAliases(file)])
        .toEqual([file, existing("7f46bd24-f237-48e2-a151-ea52e66c2d09", "Bodegas Tridente"), pending("Tridente")]);
    }
  });
});
