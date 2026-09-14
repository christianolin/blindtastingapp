import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { coerceLabelRead } from "../label-scan/label-read-schema";
import { APPELLATION_SYNONYMS } from "../label-scan/region-canonical";
import { missingWineFields } from "./complete";
import { foldName, stripDesignationSuffix } from "./fold";
import { resolveLabelRead } from "./resolve";
import { loadReferenceSnapshot, snapshotLookup, type ReferenceSnapshot } from "./__fixtures__/snapshot-lookup";

const NOW = new Date("2026-09-12T12:00:00Z");
let snap: ReferenceSnapshot;
beforeAll(() => { snap = loadReferenceSnapshot(); });
const fixture = (f: string) => JSON.parse(readFileSync(path.join(process.cwd(), "src/lib/label-scan/__fixtures__", f), "utf8"));
const resolve = (f: string, patch: Record<string, unknown> = {}, s?: ReferenceSnapshot) =>
  resolveLabelRead(coerceLabelRead({ ...fixture(f), ...patch }), snapshotLookup(s ?? snap), { imageUrl: null });
const stripped = (name: string) => foldName(stripDesignationSuffix(name));
const country = (folded: string) => snap.countries.find((c) => foldName(c.name) === folded)!;
const appName = (id: string | null) => snap.appellations.find((a) => a.id === id)?.name ?? "";

describe("resolveLabelRead against the reference snapshot (spec G.2)", () => {
  it("produttori-barbaresco-2018 is complete", async () => {
    const d = await resolve("produttori-barbaresco-2018.json");
    expect(stripped(appName(d.appellationId))).toBe("barbaresco");
    expect(d.countryId).toBe(country("italy").id);
    expect(d.producer).toMatchObject({ kind: "existing" });
    expect(d.blend[0].grape).toMatchObject({ kind: "existing", name: "Nebbiolo" });
    expect(d.vintage).toEqual({ kind: "YEAR", year: 2018, tawnyYears: null, read: true });
    expect(missingWineFields(d, { now: NOW })).toEqual([]);
  });
  it("cigliuti without a vintage misses only the vintage", async () => {
    const d = await resolve("cigliuti-barbaresco-no-vintage.json");
    expect(d.vintage).toEqual({ kind: null, year: null, tawnyYears: null, read: false });
    expect(missingWineFields(d, { now: NOW })).toEqual(["vintage"]);
  });
  it("vin-de-france takes France's national tier, Vin de France, not None (spec §B.5)", async () => {
    const d = await resolve("vin-de-france.json");
    const vdfRegion = snap.regions.find((r) => r.country_id === country("france").id && foldName(r.name) === "vindefrance")!;
    const vdfApp = snap.appellations.find((a) => a.region_id === vdfRegion.id && foldName(a.name) === "vindefrance")!;
    expect(d).toMatchObject({ countryId: country("france").id, regionId: vdfRegion.id, appellationId: vdfApp.id });
  });
  it.each([
    ["France", "Southern Rhône", "rhone"], ["France", "Northern Rhone", "rhone"], ["Portugal", "Douro Valley", "douro"],
    ["Germany", "Mosel-Saar-Ruwer", "mosel"], ["France", "Burgundy", "bourgogne"], ["Italy", "Piedmont", "piemonte"], ["Italy", "Tuscany", "toscana"],
    // The map's keys are only lowercased, so each accented synonym is a second key (spec §B.5).
    ["France", "Southern Rhone", "rhone"], ["France", "Northern Rhône", "rhone"],
  ] as const)("%s · %s resolves to its stored region (RC3)", async (countryName, region, target) => {
    const d = await resolve("produttori-barbaresco-2018.json", { country: countryName, region, appellation: null, producer: null });
    const stored = snap.regions.find((r) => r.id === d.regionId);
    expect([stored?.country_id, stored && foldName(stored.name)]).toEqual([country(foldName(countryName)).id, target]);
  });
  it("keeps Grand Cru", async () =>
    expect(stripped(appName((await resolve("saint-emilion-grand-cru.json")).appellationId))).toBe("saintemiliongrandcru"));
  it("tawny carries its age and is FORTIFIED", async () => {
    const d = await resolve("tawny-port-20.json");
    expect([d.vintage.kind, d.vintage.tawnyYears, d.style]).toEqual(["TAWNY", 20, "FORTIFIED"]);
  });
  it("Bourgogne Aligoté finds the LWIN spelling", async () =>
    expect(stripped(appName((await resolve("bourgogne-aligote.json")).appellationId))).toBe("bourgognealigote"));
  it("Rioja resolves in Spain", async () => expect((await resolve("rioja-spain.json")).countryId).toBe(country("spain").id));
  it("Domaine Leflaive stays pending; a bare title word never looks anything up", async () => {
    expect((await resolve("domaine-leflaive-puligny.json")).producer).toEqual({ kind: "pending", name: "Domaine Leflaive" });
    expect((await resolve("domaine-leflaive-puligny.json", { producer: "Domaine" })).producer).toEqual({ kind: "pending", name: "Domaine" });
  });
  it("a region-only read sets the region and leaves the appellation missing", async () => {
    const d = await resolve("produttori-barbaresco-2018.json", { appellation: null, region: "Piedmont" });
    expect(d.regionId).not.toBeNull();
    expect(d.appellationId).toBeNull();
    expect(missingWineFields(d, { now: NOW })).toContain("appellation");
  });
});

describe("resolver rules on synthetic snapshots", () => {
  const synthetic = (): ReferenceSnapshot => ({
    countries: [{ id: "fr", name: "France" }],
    regions: [{ id: "rh", name: "Rhône", country_id: "fr" }, { id: "bg", name: "Bourgogne", country_id: "fr" }],
    appellations: [
      ...Array.from({ length: 26 }, (_, i) => ({ id: `x${i}`, name: `Côtes du Rhône Villages ${i} AOC`, region_id: "rh" })),
      { id: "a1", name: "Côtes du Rhône AOC", region_id: "rh" }, { id: "a2", name: "Côtes du Rhône AOP", region_id: "rh" },
    ],
    none: [], grapes: [{ id: "g", name: "Grenache" }], type_designations: [],
    producers: [{ id: "p", name: "Domaine Test", region_id: "bg" }],
  });
  it("a crowded query retries in the region and picks nothing when two rows agree", async () => {
    const d = await resolve("vin-de-france.json", { noGeographicIndication: false, appellation: "Côtes du Rhône AOC", region: "Rhône", producer: null }, synthetic());
    expect(d.appellationId).toBeNull();
  });
  it("a producer region link fills the region, never the appellation or a grape", async () => {
    const d = await resolve("vin-de-france.json", { noGeographicIndication: false, appellation: null, region: null, producer: "Domaine Test", grapes: [] }, synthetic());
    expect(d).toMatchObject({ regionId: "bg", appellationId: null, blend: [] });
    expect(d.provenance.region).toBe("producer-region");
  });
});

describe("punctuation, no-GI, cross-country links, designations, grapes (spec §B.5, §G.2)", () => {
  const fr = (): ReferenceSnapshot => ({
    countries: [{ id: "fr", name: "France" }, { id: "it", name: "Italy" }],
    regions: [
      { id: "bg", name: "Bourgogne", country_id: "fr" }, { id: "pv", name: "Provence", country_id: "fr" },
      { id: "vdf", name: "Vin de France", country_id: "fr" }, { id: "nfr", name: "None", country_id: "fr" },
      { id: "pie", name: "Piemonte", country_id: "it" },
    ],
    appellations: [
      { id: "pm", name: "Puligny-Montrachet AOC", region_id: "bg" },
      { id: "cap", name: "Coteaux d'Aix-en-Provence AOC", region_id: "pv" },
      { id: "vdfa", name: "Vin de France", region_id: "vdf" }, { id: "nfra", name: "None", region_id: "nfr" },
    ],
    none: [{ country_id: "fr", region_id: "nfr", appellation_id: "nfra" }],
    producers: [{ id: "ti", name: "Tenuta Italiana", region_id: "pie" }],
    grapes: [{ id: "syr", name: "Syrah" }, { id: "pn", name: "Pinot Noir" }],
    type_designations: [{ id: "gc-any", name: "Grand Cru", country_id: null }, { id: "gc-fr", name: "Grand Cru", country_id: "fr" }],
  });
  const plain = { noGeographicIndication: false, appellation: null, region: null, producer: null, designation: null, grapes: [] };
  it("a trailing Premier Cru falls back to the hyphenated base appellation", async () => {
    const d = await resolve("vin-de-france.json", { ...plain, appellation: "Puligny-Montrachet Premier Cru AOC", region: "Bourgogne" }, fr());
    expect([d.appellationId, d.regionId]).toEqual(["pm", "bg"]);
  });
  it("an apostrophe and hyphens still match through the search pattern", async () =>
    expect((await resolve("vin-de-france.json", { ...plain, appellation: "Coteaux d'Aix-en-Provence AOC" }, fr())).appellationId).toBe("cap"));
  it("L'Envolee: no-GI France resolves to Vin de France, by flag and by text", async () => {
    for (const patch of [{ noGeographicIndication: true }, { appellation: "Vin de France", region: "Vin de France" }]) {
      const d = await resolve("vin-de-france.json", { ...plain, producer: "L'Envolee", grapes: [{ name: "Pinot Noir", percentage: null }], ...patch }, fr());
      expect([d.regionId, d.appellationId]).toEqual(["vdf", "vdfa"]);
    }
  });
  it("a producer linked to another country never sets the region (RC10)", async () => {
    const d = await resolve("vin-de-france.json", { ...plain, producer: "Tenuta Italiana" }, fr());
    expect([d.countryId, d.regionId, d.producer]).toEqual(["fr", null, { kind: "existing", id: "ti", name: "Tenuta Italiana" }]);
  });
  it("a designation prefers the draft's country", async () =>
    expect((await resolve("vin-de-france.json", { ...plain, designation: "Grand Cru" }, fr())).typeDesignationId).toBe("gc-fr"));
  it("grapes canonicalise to an existing grape; an unknown name stays pending", async () =>
    expect((await resolve("vin-de-france.json", { ...plain, grapes: [{ name: "Shiraz", percentage: 60 }, { name: "Mystery Noir", percentage: 40 }] }, fr())).blend).toEqual([
      { grape: { kind: "existing", id: "syr", name: "Syrah" }, percentage: 60 },
      { grape: { kind: "pending", name: "Mystery Noir" }, percentage: 40 },
    ]));
});

// Added after review, beyond the plan's verbatim block above: regression cover
// for the two step-by-step rules the plan's cases left unexercised (spec §B.5
// steps 4.4, 4.5, 4.7 and 8), each of which a wrong implementation passed.
describe("the country and region filters, the cru retry trigger and a foreign designation (spec §B.5)", () => {
  const two = (): ReferenceSnapshot => ({
    countries: [{ id: "fr", name: "France" }, { id: "it", name: "Italy" }],
    regions: [
      { id: "bx", name: "Bordeaux", country_id: "fr" }, { id: "bg", name: "Bourgogne", country_id: "fr" },
      { id: "pie", name: "Piemonte", country_id: "it" },
    ],
    appellations: [
      // One folded base name, "saintemilion", in three regions across two countries.
      { id: "sefr", name: "Saint-Émilion AOC", region_id: "bx" },
      { id: "sebg", name: "Saint-Emilion AOC", region_id: "bg" },
      { id: "seit", name: "Saint-Emilion AOC", region_id: "pie" },
      // Only the cru-stripped base exists here, so the retry has somewhere to land.
      { id: "pm", name: "Puligny-Montrachet AOC", region_id: "bg" },
    ],
    none: [], producers: [], grapes: [],
    type_designations: [{ id: "res-es", name: "Reserva", country_id: "es" }],
  });
  const plain = { noGeographicIndication: false, appellation: null, region: null, producer: null, designation: null, grapes: [] };

  it("step 4.4 keeps only the read country's rows, so France's row wins over Italy's", async () => {
    const d = await resolve("vin-de-france.json", { ...plain, country: "France", appellation: "Saint-Émilion AOC", region: "Bordeaux" }, two());
    expect([d.appellationId, d.regionId, d.countryId]).toEqual(["sefr", "bx", "fr"]);
  });
  it("step 4.5 narrows two same-country rows to the region candidate", async () => {
    const d = await resolve("vin-de-france.json", { ...plain, country: "France", appellation: "Saint-Émilion AOC", region: "Bourgogne" }, two());
    expect([d.appellationId, d.regionId]).toEqual(["sebg", "bg"]);
  });
  it("two same-country rows and no region candidate pick nothing (no first hit, RC4)", async () => {
    const d = await resolve("vin-de-france.json", { ...plain, country: "France", appellation: "Saint-Émilion AOC" }, two());
    expect(d.appellationId).toBeNull();
  });
  it("step 4.7 does not retry when rows agreed and only the country filter emptied them", async () => {
    // The Grand Cru row agrees with the base but sits in France, so step 4.4
    // empties the set. "None agree" is step 4.3's test, which already ran BEFORE
    // that filter, so the retry must not fire — otherwise the cru-stripped base
    // finds Italy's plain Saint-Emilion and the resolver hands back a row for a
    // wine whose own appellation text it could not place (RC4: never guess).
    const snap = two();
    snap.appellations.push({ id: "segc", name: "Saint-Émilion Grand Cru AOC", region_id: "bx" });
    const d = await resolve("vin-de-france.json", { ...plain, country: "Italy", appellation: "Saint-Émilion Grand Cru AOC" }, snap);
    expect([d.appellationId, d.regionId]).toEqual([null, null]);
  });
  it("step 4.7 still retries when no reference row agreed at all", async () => {
    const d = await resolve("vin-de-france.json", { ...plain, country: "France", appellation: "Puligny-Montrachet Grand Cru AOC", region: "Bourgogne" }, two());
    expect([d.appellationId, d.regionId]).toEqual(["pm", "bg"]);
  });
  it("step 8 leaves a designation scoped to another country null", async () => {
    const d = await resolve("vin-de-france.json", { ...plain, country: "France", designation: "Reserva" }, two());
    expect(d.typeDesignationId).toBeNull();
    expect(d.provenance.typeDesignation).toBeUndefined();
  });
  it("a no-GI read outside France takes that country's None pair, and both rows are in the snapshot", async () => {
    // Italy has no NATIONAL_TIER_REGION_NAMES region, so step 2 falls back to the
    // per-country None pair (20260829263700). The snapshot must carry both halves
    // of the pair for every country whose regions it covers, or the ids resolve to
    // nothing for F6 and L1, which share this fixture.
    const d = await resolve("produttori-barbaresco-2018.json", { noGeographicIndication: true, appellation: null, region: null });
    const pair = snap.none.find((n) => n.country_id === country("italy").id)!;
    expect([d.regionId, d.appellationId]).toEqual([pair.region_id, pair.appellation_id]);
    expect(snap.regions.find((r) => r.id === d.regionId)?.name).toBe("None");
    expect(appName(d.appellationId)).toBe("None");
  });
  it("every None pair whose region the snapshot covers has its appellation row too", () => {
    const regionIds = new Set(snap.regions.map((r) => r.id));
    const appellationIds = new Set(snap.appellations.map((a) => a.id));
    const covered = snap.none.filter((n) => regionIds.has(n.region_id));
    expect(covered.length).toBe(6); // France, Italy, Spain, Portugal, Argentina, Germany (§G.2)
    expect(covered.filter((n) => !appellationIds.has(n.appellation_id))).toEqual([]);
  });
  it("a folded producer collision resolves to the region-linked row, not the region-less one (spec §B.7)", async () => {
    // With the region known (step 6 passes it), ties go to that region first.
    // 20260912101530 (applied live) fixed the SQL, which used to sort a
    // region-less duplicate first; see snapshot-lookup.ts.
    const snap = two();
    snap.producers = [
      { id: "p-null", name: "Château Lascombes", region_id: null },
      { id: "p-bx", name: "Chateau Lascombes", region_id: "bx" },
    ];
    const d = await resolve("vin-de-france.json", { ...plain, country: "France", region: "Bordeaux", producer: "Chateau Lascombes" }, snap);
    expect(d.producer).toEqual({ kind: "existing", id: "p-bx", name: "Chateau Lascombes" });

    // With no region the first sort key is false for every row, live and here
    // alike, so the linked row wins and step 7 fills the region from its link.
    // Step 7 is not what the live defect breaks.
    const unplaced = await resolve("vin-de-france.json", { ...plain, country: "France", producer: "Chateau Lascombes" }, snap);
    expect([unplaced.producer, unplaced.regionId, unplaced.provenance.region]).toEqual([
      { kind: "existing", id: "p-bx", name: "Chateau Lascombes" }, "bx", "producer-region",
    ]);
  });

  // Two rules the plan's cases assert only by their result, which is the same
  // whether or not the rule holds. These watch the lookup itself instead.
  const spy = (s: ReferenceSnapshot) => {
    const inner = snapshotLookup(s);
    const calls: { producer: string[]; search: string[] } = { producer: [], search: [] };
    return {
      calls,
      lookup: {
        ...inner,
        producerByFoldedName: (name: string, regionId: string | null) => {
          calls.producer.push(name);
          return inner.producerByFoldedName(name, regionId);
        },
        searchAppellations: (words: string, regionId?: string) => {
          calls.search.push(regionId === undefined ? words : `${words} @${regionId}`);
          return inner.searchAppellations(words, regionId);
        },
      },
    };
  };

  it("a bare title word is never sent to the producer lookup at all (scan-3)", async () => {
    const snap = two();
    snap.producers = [{ id: "p-dom", name: "Domaine", region_id: "bg" }];
    const titled = spy(snap);
    const d = await resolveLabelRead(
      coerceLabelRead({ ...fixture("domaine-leflaive-puligny.json"), producer: "Domaine" }),
      titled.lookup,
      { imageUrl: null },
    );
    // Even with a real producer row literally named "Domaine" to be found, the
    // title-only name must stay pending because no lookup is made.
    expect(titled.calls.producer).toEqual([]);
    expect(d.producer).toEqual({ kind: "pending", name: "Domaine" });

    const named = spy(snap);
    await resolveLabelRead(coerceLabelRead(fixture("domaine-leflaive-puligny.json")), named.lookup, { imageUrl: null });
    expect(named.calls.producer).toEqual(["Domaine Leflaive"]);
    expect(named.calls.search.length).toBeGreaterThan(0); // both spies are live
  });

  it("a region-level read never becomes the region's own same-named appellation (RC5)", async () => {
    // "Bourgogne" exists here as BOTH a region and an appellation, which is the
    // shape the deleted unpaged self-named lookup used to exploit. A read with a
    // region and no appellation must still leave the appellation null, and must
    // not search for one.
    const snap = two();
    snap.appellations.push({ id: "bga", name: "Bourgogne AOC", region_id: "bg" });
    const watched = spy(snap);
    const d = await resolveLabelRead(
      coerceLabelRead({ ...fixture("vin-de-france.json"), ...plain, country: "France", region: "Bourgogne" }),
      watched.lookup,
      { imageUrl: null },
    );
    expect([d.regionId, d.appellationId]).toEqual(["bg", null]);
    expect(watched.calls.search).toEqual([]);
    expect(missingWineFields(d, { now: NOW })).toContain("appellation");
  });

  // Step 4.2's region-scoped retry. The crowded case above cannot prove it: its two
  // agreeing rows sort ahead of the 26 "Villages" rows, so it picks nothing with or
  // without the retry. Here only the scoped search can reach the right row.
  it("step 4.2 retries a truncated search inside the region candidate", async () => {
    const s = two();
    s.regions.push({ id: "rh", name: "Rhône", country_id: "fr" });
    s.appellations.push(
      // 26 rows outside the region that match the pattern and sort first (a digit
      // sorts before a letter), so the unscoped search stops at 25 of them.
      ...Array.from({ length: 26 }, (_, i) => ({ id: `f${i}`, name: `Côtes du Rhône ${i} AOC`, region_id: "bg" })),
      { id: "cdr", name: "Côtes du Rhône AOC", region_id: "rh" },
    );
    const watched = spy(s);
    const d = await resolveLabelRead(
      coerceLabelRead({ ...fixture("vin-de-france.json"), ...plain, country: "France", region: "Rhône", appellation: "Côtes du Rhône AOC" }),
      watched.lookup,
      { imageUrl: null },
    );
    expect(watched.calls.search).toEqual(["cotes du rhone", "cotes du rhone @rh"]);
    expect([d.appellationId, d.regionId]).toEqual(["cdr", "rh"]);
  });

  it("step 4.2 never narrows an uncrowded search to the region candidate", async () => {
    // The read's region can be wrong. Under 25 hits the search stays unscoped, and
    // the one agreeing row sets the region itself (step 4.8).
    const watched = spy(two());
    const d = await resolveLabelRead(
      coerceLabelRead({ ...fixture("vin-de-france.json"), ...plain, country: "France", region: "Bordeaux", appellation: "Puligny-Montrachet AOC" }),
      watched.lookup,
      { imageUrl: null },
    );
    expect(watched.calls.search).toEqual(["puligny montrachet"]);
    expect([d.appellationId, d.regionId]).toEqual(["pm", "bg"]);
  });

  it("step 1 leaves a country the reference table lacks null, and places nothing under it", async () => {
    const d = await resolve("produttori-barbaresco-2018.json", { country: "Atlantis", appellation: null, producer: null });
    expect([d.countryId, d.regionId, d.appellationId]).toEqual([null, null, null]);
    expect(d.provenance.country).toBeUndefined();
  });

  it("step 4.6 prefers the row whose suffix is equivalent to the read's", async () => {
    const s = two();
    s.appellations.push(
      { id: "cb-aoc", name: "Collines Basses AOC", region_id: "bg" },
      { id: "cb-igp", name: "Collines Basses IGP", region_id: "bg" },
    );
    const picks = await Promise.all(
      ["Collines Basses AOC", "Collines Basses AOP", "Collines Basses IGP"].map(async (appellation) =>
        [appellation, (await resolve("vin-de-france.json", { ...plain, country: "France", region: "Bourgogne", appellation }, s)).appellationId]),
    );
    // aoc ≡ aop, so the AOP read picks the AOC row; the IGP read picks its own row.
    expect(picks).toEqual([["Collines Basses AOC", "cb-aoc"], ["Collines Basses AOP", "cb-aoc"], ["Collines Basses IGP", "cb-igp"]]);
  });

  it("step 12 makes a TAWNY read FORTIFIED whatever style the read gave", async () => {
    // The tawny fixture already says FORTIFIED, so the case above cannot tell
    // normaliseDraft from a plain copy of the read.
    for (const style of ["SWEET", null]) {
      const d = await resolve("tawny-port-20.json", { style });
      expect([style, d.vintage.kind, d.vintage.tawnyYears, d.style]).toEqual([style, "TAWNY", 20, "FORTIFIED"]);
    }
  });

  // The field chips (§B.4) are driven by provenance alone, so every step that
  // places a value from the read must mark it "label" (§B.5 steps 1, 2, 4.8, 5,
  // 6, 8-11; D8: a scan-read value is read from the label, not an inference).
  it("a full read marks every value it placed as read from the label", async () => {
    const d = await resolveLabelRead(
      coerceLabelRead(fixture("produttori-barbaresco-2018.json")),
      snapshotLookup(snap),
      { imageUrl: "https://example.test/label.jpg" },
    );
    expect(d.provenance).toMatchObject({
      country: "label", region: "label", appellation: "label", producer: "label", blend: "label",
      vintage: "label", colour: "label", style: "label", wineName: "label", alcohol: "label", description: "label",
    });
    expect(d.provenance.typeDesignation).toBeUndefined(); // the read had no designation
    expect(d.imageUrl).toBe("https://example.test/label.jpg"); // step 11
  });

  it("the no-GI, region-only, pending-producer and designation steps mark provenance too; unread fields carry none", async () => {
    const noGi = await resolve("vin-de-france.json");
    expect([noGi.provenance.region, noGi.provenance.appellation]).toEqual(["label", "label"]);

    const regionOnly = await resolve("produttori-barbaresco-2018.json", { appellation: null, region: "Piedmont" });
    expect([regionOnly.provenance.region, regionOnly.provenance.appellation]).toEqual(["label", undefined]);

    expect((await resolve("domaine-leflaive-puligny.json")).provenance.producer).toBe("label");

    const s = two();
    s.type_designations.push({ id: "gc", name: "Grand Cru", country_id: null });
    const designated = await resolve("vin-de-france.json", { ...plain, country: "France", designation: "Grand Cru" }, s);
    expect([designated.typeDesignationId, designated.provenance.typeDesignation]).toEqual(["gc", "label"]);

    const cigliuti = await resolve("cigliuti-barbaresco-no-vintage.json");
    expect([cigliuti.provenance.vintage, cigliuti.provenance.alcohol]).toEqual([undefined, undefined]);
  });

  // A premier cru read against a stored premier cru row. normaliseCru spells every
  // premier cru "premier cru", but stored names use "Premier Cru" or "1er Cru", and
  // search_appellations' ILIKE cannot match one spelling against the other. If step
  // 4.2 sent "premier cru", a stored "1er Cru" row would never come back: step 4.7
  // would strip the qualifier and pick the plain base appellation with provenance
  // "label", a silently wrong FK (RC4). So the search sends "cru" in its place, and
  // step 4.3 still compares normaliseCru forms, which keeps the pick exact.
  it.each([
    "Puligny-Montrachet 1er Cru", "Puligny-Montrachet Premier Cru", "Puligny-Montrachet 1er Cru AOC", "PULIGNY-MONTRACHET PREMIER CRU AOC",
  ])("%s resolves to the stored \"1er Cru\" row, never to the base appellation", async (appellation) => {
    const premier = snap.appellations.find((a) => a.name === "Puligny-Montrachet 1er Cru")!;
    const d = await resolve("domaine-leflaive-puligny.json", { appellation });
    expect([appName(d.appellationId), d.appellationId, d.regionId, d.provenance.appellation]).toEqual([
      "Puligny-Montrachet 1er Cru", premier.id, premier.region_id, "label",
    ]);
  });

  it("a base read beside a stored 1er Cru row still resolves to the base row", async () => {
    const d = await resolve("domaine-leflaive-puligny.json");
    expect(appName(d.appellationId)).toBe("Puligny-Montrachet AOC");
  });

  it("a 1er Cru read finds a stored \"Premier Cru\" spelling in one search, with no retry to the base", async () => {
    const s = two();
    s.appellations.push(
      { id: "chab", name: "Chablis AOC", region_id: "bg" },
      { id: "chab-gc", name: "Chablis Grand Cru", region_id: "bg" },
      { id: "chab-pc", name: "Chablis Premier Cru", region_id: "bg" },
    );
    for (const appellation of ["Chablis 1er Cru", "Chablis Premier Cru AOC"]) {
      const watched = spy(s);
      const d = await resolveLabelRead(
        coerceLabelRead({ ...fixture("vin-de-france.json"), ...plain, country: "France", region: "Bourgogne", appellation }),
        watched.lookup,
        { imageUrl: null },
      );
      expect([appellation, watched.calls.search, d.appellationId]).toEqual([appellation, ["chablis cru"], "chab-pc"]);
    }
  });

  it("two stored spellings of one premier cru both agree, so nothing is picked and the base is never tried", async () => {
    const s = two();
    s.appellations.push(
      { id: "chab", name: "Chablis AOC", region_id: "bg" },
      { id: "chab-1er", name: "Chablis 1er Cru", region_id: "bg" },
      { id: "chab-pc", name: "Chablis Premier Cru", region_id: "bg" },
    );
    const d = await resolve("vin-de-france.json", { ...plain, country: "France", region: "Bourgogne", appellation: "Chablis Premier Cru" }, s);
    expect([d.appellationId, d.regionId]).toEqual([null, "bg"]);
  });

  it("step 6 passes the draft's region, so a folded collision goes to the row in that region", async () => {
    // Both rows are region-linked, and the Bordeaux row wins every later tie-break
    // (same name, lower id), so only the region argument can pick Bourgogne's row.
    const s = two();
    s.producers = [
      { id: "a-bx", name: "Domaine Dupont", region_id: "bx" },
      { id: "b-bg", name: "Domaine Dupont", region_id: "bg" },
    ];
    const inBourgogne = await resolve("vin-de-france.json", { ...plain, country: "France", region: "Bourgogne", producer: "DOMAINE DUPONT" }, s);
    const inBordeaux = await resolve("vin-de-france.json", { ...plain, country: "France", region: "Bordeaux", producer: "DOMAINE DUPONT" }, s);
    expect([inBourgogne.producer, inBordeaux.producer]).toEqual([
      { kind: "existing", id: "b-bg", name: "Domaine Dupont" },
      { kind: "existing", id: "a-bx", name: "Domaine Dupont" },
    ]);
  });

  // Single rules the F5 re-review's mutants still survived (spec §B.5 steps 1, 2,
  // 4.5, 4.7, 4.8, 7 and 9).
  it("step 1 maps a local country name through canonicalCountryName", async () => {
    const d = await resolve("produttori-barbaresco-2018.json", { country: "Italia", region: null, appellation: null, producer: null });
    expect([d.countryId, d.provenance.country]).toEqual([country("italy").id, "label"]);
  });

  it("step 2 skips steps 3-5, so a no-GI read that also names a region and an appellation keeps the national tier", async () => {
    // coerceLabelRead already nulls the appellation of a no-GI read (its rule 5), so
    // the read is built directly: this tests the resolver's own skip.
    const read = { ...coerceLabelRead(fixture("vin-de-france.json")), region: "Bourgogne", appellation: "Puligny-Montrachet AOC" };
    const d = await resolveLabelRead(read, snapshotLookup(snap), { imageUrl: null });
    const vdfRegion = snap.regions.find((r) => r.country_id === country("france").id && foldName(r.name) === "vindefrance")!;
    const vdfApp = snap.appellations.find((a) => a.region_id === vdfRegion.id && foldName(a.name) === "vindefrance")!;
    expect([d.regionId, d.appellationId]).toEqual([vdfRegion.id, vdfApp.id]);
  });

  it("step 4.5 keeps only the region candidate's rows, even when that leaves none", async () => {
    const s = two();
    s.regions.push({ id: "pv", name: "Provence", country_id: "fr" });
    s.appellations.push(
      { id: "cb-bx", name: "Collines Basses AOC", region_id: "bx" },
      { id: "cb-bg", name: "Collines Basses IGP", region_id: "bg" },
    );
    // A filter that kept both rows when none sit in Provence would let step 4.6's
    // suffix preference pick cb-bx.
    const d = await resolve("vin-de-france.json", { ...plain, country: "France", region: "Provence", appellation: "Collines Basses AOC" }, s);
    expect([d.appellationId, d.regionId]).toEqual([null, "pv"]);
  });

  it("step 4.7 strips a cru qualifier once, never twice", async () => {
    const d = await resolve("vin-de-france.json", { ...plain, country: "France", region: "Bourgogne", appellation: "Puligny-Montrachet Grand Cru Premier Cru AOC" }, two());
    expect([d.appellationId, d.regionId]).toEqual([null, "bg"]);
  });

  it("step 4.8 fills the country from the one agreeing row when the read had none", async () => {
    const d = await resolve("vin-de-france.json", { ...plain, country: null, appellation: "Puligny-Montrachet AOC" }, two());
    expect([d.appellationId, d.regionId, d.countryId, d.provenance.country]).toEqual(["pm", "bg", "fr", "label"]);
  });

  it("step 7 fills an empty country from the producer's linked region", async () => {
    const s = two();
    s.producers = [{ id: "p-bx", name: "Chateau Lascombes", region_id: "bx" }];
    const d = await resolve("vin-de-france.json", { ...plain, country: null, producer: "Chateau Lascombes" }, s);
    expect([d.regionId, d.countryId, d.provenance.region, d.provenance.country]).toEqual(["bx", "fr", "producer-region", "producer-region"]);
  });

  it("step 9 keeps the canonical name on a pending grape", async () => {
    const d = await resolve("vin-de-france.json", { ...plain, grapes: [{ name: "Garnacha", percentage: 100 }] }, two());
    expect(d.blend).toEqual([{ grape: { kind: "pending", name: "Grenache" }, percentage: 100 }]);
  });
});

// Owner approval 1b (2026-09-13). Step 8 still tries folded equality first. Only
// when that picks nothing does it try a reference designation's bracketed short
// form ("LBV" → "Late Bottled Vintage (LBV)") or its name without the bracket
// ("Grosses Gewächs" → "Grosses Gewächs (GG)"). The country rule is unchanged: a
// candidate is a row in the draft's country or a row with no country. Two or more
// candidates pick nothing (never a first hit).
describe("step 8: a designation's bracketed short form, or its name without the bracket (owner approval 1b)", () => {
  // Shaped like the live table (checked read-only 2026-09-13): names are UNIQUE,
  // and exactly these four active rows carry a bracket.
  const des = (): ReferenceSnapshot => ({
    countries: [{ id: "pt", name: "Portugal" }, { id: "de", name: "Germany" }, { id: "at", name: "Austria" }, { id: "fr", name: "France" }],
    regions: [], appellations: [], none: [], producers: [], grapes: [],
    type_designations: [
      { id: "vp", name: "Vintage Port", country_id: "pt" },
      { id: "lbv", name: "Late Bottled Vintage (LBV)", country_id: "pt" },
      { id: "gg", name: "Grosses Gewächs (GG)", country_id: "de" },
      { id: "ba", name: "Beerenauslese (BA)", country_id: "de" },
      { id: "tba", name: "Trockenbeerenauslese (TBA)", country_id: "de" },
      { id: "brut", name: "Brut", country_id: null },
    ],
  });
  const plain = { noGeographicIndication: false, appellation: null, region: null, producer: null, designation: null, grapes: [] };
  const pick = async (country: string | null, designation: string, s: ReferenceSnapshot = des()) => {
    const d = await resolve("vin-de-france.json", { ...plain, country, designation }, s);
    return [d.typeDesignationId, d.provenance.typeDesignation ?? null];
  };

  it.each([
    ["Portugal", "LBV", "lbv"],
    ["Portugal", "lbv", "lbv"],
    ["Portugal", "Late Bottled Vintage", "lbv"],
    ["Germany", "GG", "gg"],
    ["Germany", "Grosses Gewächs", "gg"],
    ["Germany", "Großes Gewächs", "gg"],
    ["Germany", "BA", "ba"],
    ["Germany", "TBA", "tba"],
    ["Germany", "Beerenauslese", "ba"],
    ["Germany", "Trockenbeerenauslese", "tba"],
  ] as const)("%s · %s resolves by the bracket and is read from the label", async (country, designation, id) =>
    expect(await pick(country, designation)).toEqual([id, "label"]));

  it("folded equality runs first, so a row literally named by the short form wins over the bracket", async () => {
    expect(await pick("Portugal", "Late Bottled Vintage (LBV)")).toEqual(["lbv", "label"]);
    const s = des();
    s.type_designations.push({ id: "lbv-plain", name: "LBV", country_id: "pt" });
    expect(await pick("Portugal", "LBV", s)).toEqual(["lbv-plain", "label"]);
  });

  it("'Vintage' alone stays unresolved: it is neither a short form nor a name without its bracket", async () => {
    // #12's stored read says "Vintage"; the rows are "Vintage Port" and "Late Bottled Vintage (LBV)".
    expect(await pick("Portugal", "Vintage")).toEqual([null, null]);
    expect(await pick("Portugal", "Bottled Vintage")).toEqual([null, null]);
    expect(await pick("Germany", "Gewächs")).toEqual([null, null]);
    expect(await pick("Germany", "Auslese")).toEqual([null, null]);
  });

  it("a short form shared by two rows stays unresolved", async () => {
    const s = des();
    s.type_designations.push({ id: "gg2", name: "Gran Gusto (GG)", country_id: "de" });
    expect(await pick("Germany", "GG", s)).toEqual([null, null]);
    // A row with no country is a candidate in every country, so it collides too.
    const t = des();
    t.type_designations.push({ id: "gg-any", name: "Gold Grade (GG)", country_id: null });
    expect(await pick("Germany", "GG", t)).toEqual([null, null]);
  });

  it("a name without its bracket shared by two rows stays unresolved", async () => {
    const s = des();
    s.type_designations.push({ id: "lbv-unf", name: "Late Bottled Vintage (Unfiltered)", country_id: "pt" });
    expect(await pick("Portugal", "Late Bottled Vintage", s)).toEqual([null, null]);
    expect(await pick("Portugal", "LBV", s)).toEqual(["lbv", "label"]);
  });

  it("the country rule still holds: another country's row is never a candidate", async () => {
    expect(await pick("France", "LBV")).toEqual([null, null]);
    expect(await pick(null, "GG")).toEqual([null, null]);
    // So a short form another country's row shares does not block this country's row.
    const s = des();
    s.type_designations.push({ id: "ba-at", name: "Bergauslese (BA)", country_id: "at" });
    expect(await pick("Austria", "BA", s)).toEqual(["ba-at", "label"]);
    expect(await pick("Germany", "BA", s)).toEqual(["ba", "label"]);
  });

  it("a bracket must close the name: a bracket elsewhere, or two, is no short form", async () => {
    const s = des();
    s.type_designations.push(
      { id: "mid", name: "Alpha (AL) Reserve", country_id: "pt" },
      { id: "two", name: "Beta (BE) (BT)", country_id: "pt" },
    );
    for (const designation of ["AL", "Alpha Reserve", "BE", "BT", "Beta"]) {
      expect([designation, ...(await pick("Portugal", designation, s))]).toEqual([designation, null, null]);
    }
  });
});

// Owner approval 3 (2026-09-13): "a blank is safer than a wrong answer that looks
// right". A read with no appellation text places its region from its region field
// alone (step 5). When the producer it found (step 6) is an existing row linked to
// ANOTHER region of the SAME country, that region is left empty for the user — so
// it is listed as missing — and step 7 does not refill it from the link. Every
// other path keeps today's behaviour.
describe("a read-only region that disagrees with the producer's region link is left blank (owner approval 3)", () => {
  const es = (): ReferenceSnapshot => ({
    countries: [{ id: "es", name: "Spain" }, { id: "pt", name: "Portugal" }],
    regions: [
      { id: "clm", name: "Castilla La Mancha", country_id: "es" },
      { id: "cyl", name: "Castilla y Leon", country_id: "es" },
      { id: "es-none", name: "None", country_id: "es" },
      { id: "dou", name: "Douro", country_id: "pt" },
    ],
    appellations: [
      { id: "clm-a", name: "Castilla La Mancha", region_id: "clm" },
      { id: "rib", name: "Ribera del Duero DO", region_id: "cyl" },
      { id: "es-none-a", name: "None", region_id: "es-none" },
    ],
    none: [{ country_id: "es", region_id: "es-none", appellation_id: "es-none-a" }],
    producers: [
      { id: "p-cyl", name: "Bodegas Norte", region_id: "cyl" },
      { id: "p-clm", name: "Bodegas Sur", region_id: "clm" },
      { id: "p-unlinked", name: "Bodegas Sin Enlace", region_id: null },
      { id: "p-pt", name: "Quinta Lusa", region_id: "dou" },
    ],
    grapes: [{ id: "tem", name: "Tempranillo" }],
    type_designations: [],
  });
  // "Castilla-La Mancha" resolves through Spain's region synonyms (step 3).
  const read = {
    noGeographicIndication: false, country: "Spain", region: "Castilla-La Mancha", appellation: null,
    producer: null, designation: null, grapes: [{ name: "Tempranillo", percentage: 100 }],
  };
  const placed = async (patch: Record<string, unknown>) => {
    const d = await resolve("vin-de-france.json", { ...read, ...patch }, es());
    return {
      producer: d.producer, countryId: d.countryId, regionId: d.regionId, appellationId: d.appellationId,
      region: d.provenance.region ?? null, missing: missingWineFields(d, { now: NOW }),
    };
  };

  it("the read's region is dropped and listed as missing, and step 7 does not refill it from the link", async () => {
    expect(await placed({ producer: "Bodegas Norte" })).toEqual({
      producer: { kind: "existing", id: "p-cyl", name: "Bodegas Norte" },
      countryId: "es", regionId: null, appellationId: null, region: null,
      missing: ["region", "appellation"],
    });
  });

  // Step 7.5 (owner rule 2026-09-14) is gated on `provenance.region === "label"`
  // specifically so this blanking (above) keeps winning: the region here is no
  // longer "the region the read itself named" once step 7 clears it, even though
  // "Castilla La Mancha" both names a real region and has a self-named
  // appellation (clm-a) that the label's own rawText names by mention alone.
  it("the self-named fallback (step 7.5) does not refill the region owner approval 3 blanked, even when rawText names it", async () => {
    expect(await placed({
      producer: "Bodegas Norte",
      rawText: "BODEGAS NORTE · CASTILLA-LA MANCHA · 100% TEMPRANILLO",
    })).toEqual({
      producer: { kind: "existing", id: "p-cyl", name: "Bodegas Norte" },
      countryId: "es", regionId: null, appellationId: null, region: null,
      missing: ["region", "appellation"],
    });
  });

  it.each([
    ["a producer linked to the read's own region", "Bodegas Sur", { kind: "existing", id: "p-clm", name: "Bodegas Sur" }],
    ["a pending producer", "Bodegas Desconocidas", { kind: "pending", name: "Bodegas Desconocidas" }],
    ["a bare title word", "Bodegas", { kind: "pending", name: "Bodegas" }],
    ["a producer with no region link", "Bodegas Sin Enlace", { kind: "existing", id: "p-unlinked", name: "Bodegas Sin Enlace" }],
    ["a producer linked to another country", "Quinta Lusa", { kind: "existing", id: "p-pt", name: "Quinta Lusa" }],
  ] as const)("%s keeps the read's region, as today", async (_case, producer, choice) => {
    expect(await placed({ producer })).toEqual({
      producer: choice, countryId: "es", regionId: "clm", appellationId: null, region: "label", missing: ["appellation"],
    });
  });

  it("a read with appellation text keeps its region: the resolved appellation's, or the read's own when no row agreed", async () => {
    // Ribera del Duero sits in Castilla y Leon; the producer's link is Castilla La Mancha.
    expect(await placed({ appellation: "Ribera del Duero DO", producer: "Bodegas Sur" }))
      .toMatchObject({ regionId: "cyl", appellationId: "rib", region: "label", missing: [] });
    // The blank case's region and producer, but the read carried appellation text no row agrees with.
    expect(await placed({ appellation: "Vino de la Tierra de Castilla", producer: "Bodegas Norte" }))
      .toMatchObject({ regionId: "clm", appellationId: null, region: "label", missing: ["appellation"] });
  });

  it("a no-geographic-indication read keeps its country's tier beside a producer linked elsewhere in the country", async () => {
    expect(await placed({ noGeographicIndication: true, producer: "Bodegas Norte" }))
      .toMatchObject({ regionId: "es-none", appellationId: "es-none-a", region: "label", missing: [] });
  });

  it("step 7 still fills the region from the link when the read named no region, or one that resolves to nothing", async () => {
    for (const region of [null, "Atlantis"]) {
      expect([region, await placed({ region, producer: "Bodegas Norte" })]).toMatchObject([
        region, { regionId: "cyl", region: "producer-region", missing: ["appellation"] },
      ]);
    }
  });
});

// Owner approval 4 (2026-09-13): a curated appellation synonym, not a heuristic.
// Round 2's #4 read names the label's full origin, "Ningxia Helan Mountain Eastern
// Foothills", which the catalog stores as region Ningxia's own appellation
// "Ningxia". The synonym is tried only when no reference row agreed with the
// read's own text (steps 4.3 and 4.7), only when the read's region resolved to the
// synonym's region, and its target must be exactly one row in that region. A read
// with no appellation text never reaches it (step 5 still holds).
describe("step 4: a curated appellation synonym (owner approval 4)", () => {
  const cn = (): ReferenceSnapshot => ({
    countries: [{ id: "cn", name: "China" }, { id: "fr", name: "France" }],
    regions: [{ id: "nx", name: "Ningxia", country_id: "cn" }, { id: "sd", name: "Shandong", country_id: "cn" }],
    appellations: [{ id: "nx-a", name: "Ningxia", region_id: "nx" }, { id: "sd-a", name: "Shandong", region_id: "sd" }],
    none: [], producers: [], grapes: [], type_designations: [],
  });
  const read = { noGeographicIndication: false, country: "China", region: "Ningxia", appellation: null, producer: null, designation: null, grapes: [] };
  const pick = async (patch: Record<string, unknown>, s?: ReferenceSnapshot) => {
    const d = await resolve("vin-de-france.json", { ...read, ...patch }, s);
    return [d.appellationId, d.regionId, d.provenance.appellation ?? null];
  };
  const FULL = "Ningxia Helan Mountain Eastern Foothills";

  it.each([FULL, FULL.toUpperCase(), "Ningxia Helan Mountain East", "Helan Mountain Eastern Foothills"])(
    "%s, read in region Ningxia, is the snapshot's Ningxia appellation, read from the label",
    async (appellation) => {
      const ningxia = snap.appellations.find((a) => a.id === "328c774b-dc53-4cfc-b95d-7003ea470b6b")!;
      expect(ningxia.name).toBe("Ningxia");
      expect(await pick({ appellation })).toEqual([ningxia.id, ningxia.region_id, "label"]);
    },
  );

  it("every curated synonym names exactly one stored appellation in its own region, and resolves to it", async () => {
    const entries = Object.entries(APPELLATION_SYNONYMS).flatMap(([countryName, regions]) =>
      Object.entries(regions).flatMap(([regionName, spellings]) =>
        Object.entries(spellings).map(([spelling, target]) => ({ countryName, regionName, spelling, target }))));
    expect(entries.map((e) => e.spelling).sort()).toEqual(
      ["helan mountain eastern foothills", "ningxia helan mountain east", "ningxia helan mountain eastern foothills"],
    );
    for (const { countryName, regionName, spelling, target } of entries) {
      const c = snap.countries.find((row) => row.name === countryName);
      const r = snap.regions.find((row) => row.country_id === c?.id && row.name === regionName);
      const rows = snap.appellations.filter((row) => row.region_id === r?.id && row.name === target);
      expect([spelling, rows.length]).toEqual([spelling, 1]);
      expect([spelling, ...(await pick({ country: countryName, region: regionName, appellation: spelling }))])
        .toEqual([spelling, rows[0].id, r!.id, "label"]);
    }
  });

  it("never outside the synonym's region: another region, no region, or a region the read's country lacks", async () => {
    expect(await pick({ appellation: FULL }, cn())).toEqual(["nx-a", "nx", "label"]); // the control
    expect(await pick({ appellation: FULL, region: "Shandong" }, cn())).toEqual([null, "sd", null]);
    expect(await pick({ appellation: FULL, region: null }, cn())).toEqual([null, null, null]);
    expect(await pick({ appellation: FULL, country: "France" }, cn())).toEqual([null, null, null]);
  });

  it("a partial string is no synonym", async () => {
    for (const appellation of ["Helan Mountain", "Ningxia Helan", "Eastern Foothills", "Ningxia Helan Mountain Eastern", "Mountain Eastern Foothills"]) {
      expect([appellation, ...(await pick({ appellation }, cn()))]).toEqual([appellation, null, "nx", null]);
    }
  });

  it("a read that matched an appellation row keeps it, and rows that agreed but tie are not replaced by the synonym", async () => {
    const own = cn();
    own.appellations.push({ id: "helan", name: "Helan Mountain Eastern Foothills", region_id: "nx" });
    expect(await pick({ appellation: "Helan Mountain Eastern Foothills" }, own)).toEqual(["helan", "nx", "label"]);

    // Both rows agree with the read (a designation suffix is stripped), so step 4.9
    // picks nothing — the read matched rows, and only could not tell them apart.
    const tied = cn();
    tied.appellations.push(
      { id: "helan-gi", name: "Helan Mountain Eastern Foothills GI", region_id: "nx" },
      { id: "helan-pgi", name: "Helan Mountain Eastern Foothills PGI", region_id: "nx" },
    );
    expect(await pick({ appellation: "Helan Mountain Eastern Foothills" }, tied)).toEqual([null, "nx", null]);
  });

  it("the synonym's target must be the one row in the read's region", async () => {
    const moved = cn();
    moved.appellations = [{ id: "nx-a", name: "Ningxia", region_id: "sd" }, { id: "sd-a", name: "Shandong", region_id: "sd" }];
    expect(await pick({ appellation: FULL }, moved)).toEqual([null, "nx", null]);
  });

  it("a region-level read in Ningxia never becomes the self-named appellation, and never searches (spec §B.5 step 5)", async () => {
    const inner = snapshotLookup(snap);
    const searched: string[] = [];
    const d = await resolveLabelRead(
      coerceLabelRead({ ...fixture("vin-de-france.json"), ...read }),
      {
        ...inner,
        searchAppellations: (words: string, regionId?: string) => {
          searched.push(words);
          return inner.searchAppellations(words, regionId);
        },
      },
      { imageUrl: null },
    );
    expect([d.appellationId, snap.regions.find((r) => r.id === d.regionId)?.name, searched]).toEqual([null, "Ningxia", []]);
    expect(missingWineFields(d, { now: NOW })).toContain("appellation");
  });
});

// Owner rule 2026-09-14 (step 7.5, added after step 7 so owner approval 3's
// region-conflict blanking still wins — see the "does not refill" case above).
// Real-world trigger: a scanned L.A. Cetto Brut read country Mexico, region Baja
// California, appellation null, rawText "CETTO BRUT Sparkling Wine BAJA
// CALIFORNIA PRODUCED AND BOTTLED BY... WINE FROM MEXICO" — the region resolved
// but the appellation stayed empty, and the owner had to pick "Baja California"
// (the region's self-named row) by hand. A read that names only its region (no
// appellation text, not no-GI) may now resolve to that self-named row, but only
// when the label's own rawText names the region by name and names no OTHER
// appellation of it — never a guess from the region alone.
describe("step 7.5: a self-named appellation confirmed by the label's own rawText (owner rule 2026-09-14)", () => {
  const mx = (): ReferenceSnapshot => ({
    countries: [{ id: "mx", name: "Mexico" }, { id: "it", name: "Italy" }],
    regions: [
      { id: "bc", name: "Baja California", country_id: "mx" },
      { id: "mx-none", name: "None", country_id: "mx" },
      { id: "pie", name: "Piemonte", country_id: "it" },
    ],
    appellations: [
      { id: "bc-a", name: "Baja California", region_id: "bc" },
      { id: "mx-none-a", name: "None", region_id: "mx-none" },
      { id: "pie-a", name: "Piemonte", region_id: "pie" },
      { id: "barolo", name: "Barolo DOCG", region_id: "pie" },
    ],
    none: [{ country_id: "mx", region_id: "mx-none", appellation_id: "mx-none-a" }],
    producers: [], grapes: [], type_designations: [],
  });
  const plain = { noGeographicIndication: false, appellation: null, producer: null, designation: null, grapes: [] };

  it("the Cetto case: a region-only read whose rawText names the region resolves to its self-named appellation", async () => {
    const d = await resolve("vin-de-france.json", {
      ...plain, country: "Mexico", region: "Baja California",
      rawText: "CETTO BRUT Sparkling Wine BAJA CALIFORNIA PRODUCED AND BOTTLED BY... WINE FROM MEXICO",
    }, mx());
    expect([d.regionId, d.appellationId, d.provenance.appellation]).toEqual(["bc", "bc-a", "label"]);
    expect(missingWineFields(d, { now: NOW })).not.toContain("appellation");
  });

  it("rawText naming another appellation of the same region leaves the appellation null (a missed Barolo stays blank, not Piemonte)", async () => {
    const d = await resolve("vin-de-france.json", {
      ...plain, country: "Italy", region: "Piedmont",
      rawText: "AZIENDA AGRICOLA · BAROLO · PIEMONTE · ITALIA",
    }, mx());
    expect([d.regionId, d.appellationId]).toEqual(["pie", null]);
    expect(missingWineFields(d, { now: NOW })).toContain("appellation");
  });

  it("rawText that never names the region at all leaves the appellation null", async () => {
    const d = await resolve("vin-de-france.json", {
      ...plain, country: "Mexico", region: "Baja California",
      rawText: "CETTO BRUT · SPARKLING WINE",
    }, mx());
    expect([d.regionId, d.appellationId]).toEqual(["bc", null]);
  });

  it("a no-GI read is unchanged: it takes the country's None pair, never the region's self-named row, even when rawText names the region", async () => {
    const d = await resolve("vin-de-france.json", {
      noGeographicIndication: true, appellation: null, region: null, producer: null, designation: null, grapes: [],
      country: "Mexico",
      rawText: "CETTO BRUT Sparkling Wine BAJA CALIFORNIA PRODUCED AND BOTTLED BY... WINE FROM MEXICO",
    }, mx());
    expect([d.regionId, d.appellationId]).toEqual(["mx-none", "mx-none-a"]);
  });
});

describe("a prefix-named designation row never agrees until renamed to the suffix form (20260914114217, Sassicaia/Etna live-bug fix)", () => {
  // Same failure class pinned live for Sassicaia in live-replay.test.ts (#16), here
  // in isolation for Etna DOC (09a2296a-b7be-4d0b-b904-3e95a30e7295): it is not
  // named by any live read fixture, so it never entered the committed reference
  // snapshot, and is pinned here against a synthetic one instead. Before the
  // migration this row was named "DOC Etna" — designation as a prefix.
  // stripDesignationSuffix (fold.ts) strips only a TRAILING designation word, so
  // "DOC Etna" folds to "docetna", never equal to a suffix-spelled read's base
  // "etna" — even though search_appellations (step 4.2) still finds the row by
  // substring, step 4.3's fold comparison rejects it. The migration renamed it to
  // "Etna DOC" (suffix form, matching Sicilia's other Etna rows), so it now agrees.
  const sicily = (name: string): ReferenceSnapshot => ({
    countries: [{ id: "it", name: "Italy" }],
    regions: [{ id: "sic", name: "Sicilia", country_id: "it" }],
    appellations: [{ id: "09a2296a-b7be-4d0b-b904-3e95a30e7295", name, region_id: "sic" }],
    none: [], producers: [], grapes: [], type_designations: [],
  });
  const read = {
    noGeographicIndication: false, country: "Italy", region: "Sicilia", appellation: "Etna DOC",
    producer: null, designation: null, grapes: [],
  };

  it("the old prefix-named row \"DOC Etna\" is found by search but never agrees with an \"Etna DOC\" read", async () => {
    const d = await resolve("vin-de-france.json", read, sicily("DOC Etna"));
    expect(d.appellationId).toBeNull();
    expect(missingWineFields(d, { now: NOW })).toContain("appellation");
  });

  it("renamed to the suffix form \"Etna DOC\", the same read resolves to it, and appellation is no longer missing", async () => {
    const d = await resolve("vin-de-france.json", read, sicily("Etna DOC"));
    expect(d.appellationId).toBe("09a2296a-b7be-4d0b-b904-3e95a30e7295");
    expect(missingWineFields(d, { now: NOW })).not.toContain("appellation");
  });
});
