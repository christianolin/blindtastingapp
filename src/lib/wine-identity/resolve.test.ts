import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { coerceLabelRead } from "../label-scan/label-read-schema";
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
    // The contract find_producer_by_folded_name owes step 7: ties go to the given
    // region first. See snapshot-lookup.ts — the live SQL currently inverts this
    // first tie-break (a NULL region_id sorts first under DESC), so until the
    // follow-up migration lands, this passes here and fails in production.
    const snap = two();
    snap.producers = [
      { id: "p-null", name: "Château Lascombes", region_id: null },
      { id: "p-bx", name: "Chateau Lascombes", region_id: "bx" },
    ];
    const d = await resolve("vin-de-france.json", { ...plain, country: "France", region: "Bordeaux", producer: "Chateau Lascombes" }, snap);
    expect(d.producer).toEqual({ kind: "existing", id: "p-bx", name: "Chateau Lascombes" });
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
});
