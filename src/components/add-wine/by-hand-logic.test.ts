import { describe, expect, it } from "vitest";
import { emptyDraft } from "../../lib/wine-identity/complete";
import type { WineIdentityDraft } from "../../lib/wine-identity/types";
import { sheetMatrix } from "./matrix";
import {
  NO_GI_HINT, applyProducerRegion, blendScoredLine, byHandHeader, commonGrapesHeading, fieldChip, grapeSuggestionNote, pickProducerAdoption, regionFirstLabel, regionGrapeChipIds,
} from "./by-hand-logic";

const ctx = { attempted: false, focusField: null, readAttempted: false, producerRegionName: null } as const;
const cigliuti = { kind: "existing", id: "p", name: "Cigliuti" } as const;

describe("fieldChip (spec B.4)", () => {
  it("producer", () => {
    expect(fieldChip("producer", { ...emptyDraft(), producer: cigliuti }, { ...ctx, producerRegionName: "Piedmont" }).chip).toBe("matched · Piedmont");
    expect(fieldChip("producer", { ...emptyDraft(), producer: { kind: "pending", name: "Cigliuti" } }, ctx).chip).toBe("new producer");
    expect(fieldChip("producer", emptyDraft(), ctx).chip).toBe("required");
  });
  it("vintage", () => {
    const read: WineIdentityDraft = { ...emptyDraft(), vintage: { kind: "YEAR", year: 2017, tawnyYears: null, read: true }, provenance: { vintage: "label" } };
    expect(fieldChip("vintage", read, ctx).chip).toBe("read from the label");
    expect(fieldChip("vintage", emptyDraft(), { ...ctx, readAttempted: true }).chip).toBe("did not read");
    expect(fieldChip("vintage", emptyDraft(), ctx).chip).toBe("required");
    expect(fieldChip("vintage", emptyDraft(), { ...ctx, readAttempted: true, focusField: "vintage" }).chip).toBe("did not read — required");
  });
  it("wine name has a hint, never a required chip (D3)", () =>
    expect(fieldChip("wineName", emptyDraft(), ctx)).toEqual({ chip: null, note: "Leave blank if the label has no cuvée name" }));
  it("country and region from the producer link", () => {
    const d: WineIdentityDraft = { ...emptyDraft(), producer: cigliuti, countryId: "it", regionId: "pie", provenance: { country: "producer-region", region: "producer-region" } };
    expect(fieldChip("region", d, ctx).note).toBe("Filled from Cigliuti's region link. Change either if the bottle disagrees.");
  });
  it("appellation and grape", () => {
    expect(fieldChip("appellation", emptyDraft(), ctx).chip).toBe("you choose");
    expect(fieldChip("appellation", emptyDraft(), { ...ctx, readAttempted: true }).chip).toBe("did not read");
    expect(fieldChip("primaryGrape", emptyDraft(), ctx).chip).toBe("you confirm");
  });
});

describe("applyProducerRegion (round-1 rules kept: country and region only)", () => {
  const link = { regionId: "pie", countryId: "it" };
  it("fills both while untouched, never the appellation or a grape", () =>
    expect(applyProducerRegion(emptyDraft(), link)).toMatchObject({ countryId: "it", regionId: "pie", appellationId: null, blend: [], provenance: { country: "producer-region", region: "producer-region" } }));
  it("replaces a previous producer's link", () =>
    expect(applyProducerRegion(applyProducerRegion(emptyDraft(), { regionId: "bdx", countryId: "fr" }), link)).toMatchObject({ countryId: "it", regionId: "pie" }));
  it("never overwrites a manual or read value", () => {
    const manual: WineIdentityDraft = { ...emptyDraft(), countryId: "fr", provenance: { country: "manual" } };
    expect(applyProducerRegion(manual, link)).toMatchObject({ countryId: "fr", regionId: null });
  });
  it("no link leaves an untouched draft alone", () => expect(applyProducerRegion(emptyDraft(), null)).toEqual(emptyDraft()));
  it("a producer with no link clears the previous producer's link-filled fields", () => {
    const cleared = applyProducerRegion(applyProducerRegion(emptyDraft(), link), null);
    expect([cleared.countryId, cleared.regionId, cleared.provenance.country, cleared.provenance.region]).toEqual([null, null, undefined, undefined]);
  });
  it("changes nothing once an appellation is chosen", () => {
    const chosen: WineIdentityDraft = { ...applyProducerRegion(emptyDraft(), link), appellationId: "bbr" };
    expect(applyProducerRegion(chosen, { regionId: "bdx", countryId: "fr" })).toEqual(chosen);
    expect(applyProducerRegion(chosen, null)).toEqual(chosen);
  });
});

describe("pickProducerAdoption (byhand-1)", () => {
  const hits = [{ id: "p1", name: "Château Palmer", regionId: "bdx" }, { id: "p2", name: "Château Pape Clément", regionId: "bdx" }];
  it("adopts a folded-equal hit", () => expect(pickProducerAdoption("chateau palmer", hits)).toEqual({ adopt: hits[0] }));
  it("suggests the top hit otherwise", () => expect(pickProducerAdoption("Chateau Pal", hits)).toEqual({ suggest: hits[0] }));
  it("stays pending with no hits", () => expect(pickProducerAdoption("Domaine Nouveau", [])).toEqual({ pending: "Domaine Nouveau" }));
});

describe("grape suggestion note, blend line, headers, labels", () => {
  it("suggestion notes (B.8)", () => {
    expect(grapeSuggestionNote({ grape: "Nebbiolo", appellation: "Barbaresco DOCG", source: "place" })).toBe("Barbaresco DOCG is Nebbiolo by law — that is the appellation talking, not the producer. Change it if the bottle disagrees.");
    expect(grapeSuggestionNote({ grape: "Nebbiolo", appellation: "Langhe DOC", source: "catalog" })).toBe("Most Langhe DOC wines in the catalog are Nebbiolo. Change it if the bottle disagrees.");
  });
  it("blend scored line", () => expect(blendScoredLine(["Merlot", "Cabernet Franc", "Malbec"])).toBe("Scored as Merlot (primary) · Cabernet Franc (secondary)"));
  it("A7 and A4b headers", () => {
    const flight = sheetMatrix({ kind: "flight", tastingId: "t", tastingName: "Barolo night", revealMode: "BLIND", wineSource: "HOST_PROVIDES", position: 6 }, true);
    expect(byHandHeader({ matrix: flight, finishing: null, gaps: 0 })).toEqual({ eyebrow: "Add wine · glass 6 · by hand", title: "A wine we have never seen", badge: null, intro: null });
    expect(byHandHeader({ matrix: flight, finishing: { glass: 6 }, gaps: 1 })).toEqual({ eyebrow: "Glass 6 · already added", title: "Finish this wine", badge: "1 GAP", intro: "Filled in from your scan. Correct anything the camera got wrong." });
    expect(byHandHeader({ matrix: sheetMatrix({ kind: "cellar" }, true), finishing: { glass: null }, gaps: 2 })).toMatchObject({ eyebrow: "Cellar · by hand", badge: "2 GAPS" });
  });
  it("the appellation list label and the no-GI hint (A7, byhand-5)", () => {
    expect(regionFirstLabel("Piedmont")).toBe("Piedmont first");
    expect(NO_GI_HINT).toBe("No geographic indication on the label? In France pick Vin de France; elsewhere pick No geographic indication.");
  });
});

// Beyond the plan's pinned block: the remaining rows of the spec B.4 table and
// the edges of the rules above. Only the new exports are imported here, so S3b
// can delete the deprecated round-1 exports without touching this file.
describe("fieldChip, the rest of the B.4 table", () => {
  const afterRead = { ...ctx, readAttempted: true } as const;
  const nebbiolo = { grape: { kind: "existing", id: "neb", name: "Nebbiolo" }, percentage: null } as const;

  it("a value read by the scan reads from the label, with no note", () => {
    // The resolver's shape: its grapes carry the blend's provenance only (spec B.5 step 9).
    const d: WineIdentityDraft = {
      ...emptyDraft(), wineName: "Serraboella", colour: "RED", style: "STILL", countryId: "it", regionId: "pie", appellationId: "bbr", blend: [nebbiolo],
      provenance: { wineName: "label", colour: "label", style: "label", country: "label", region: "label", appellation: "label", blend: "label" },
    };
    for (const field of ["wineName", "colour", "style", "country", "region", "appellation", "primaryGrape"] as const) {
      expect(fieldChip(field, d, afterRead)).toEqual({ chip: "read from the label", note: null });
    }
  });
  it("the grape reads the blend's provenance when it has none of its own", () => {
    const scanned: WineIdentityDraft = { ...emptyDraft(), blend: [nebbiolo], provenance: { blend: "label" } };
    expect(fieldChip("primaryGrape", scanned, afterRead)).toEqual({ chip: "read from the label", note: null });
    expect(fieldChip("primaryGrape", { ...scanned, provenance: { blend: "catalog-match" } }, ctx)).toEqual({ chip: null, note: null });
    // A pick or a tapped suggestion stamps the grape itself, and that wins.
    expect(fieldChip("primaryGrape", { ...scanned, provenance: { blend: "label", primaryGrape: "appellation-suggestion" } }, afterRead).chip).toBe("you confirm");
  });
  it("empty colour, style, country and region are required", () => {
    for (const field of ["colour", "style", "country", "region"] as const) {
      expect(fieldChip(field, emptyDraft(), ctx)).toEqual({ chip: "required", note: null });
    }
  });
  it("a picked value that was not read carries no chip, except the appellation and grape prompts", () => {
    const d: WineIdentityDraft = {
      ...emptyDraft(), vintage: { kind: "NV", year: null, tawnyYears: null, read: false }, colour: "WHITE", countryId: "fr", appellationId: "cha", blend: [nebbiolo],
      provenance: { vintage: "manual", colour: "manual", country: "manual", appellation: "manual", primaryGrape: "appellation-suggestion" },
    };
    for (const field of ["vintage", "colour", "country"] as const) expect(fieldChip(field, d, afterRead).chip).toBeNull();
    expect(fieldChip("appellation", d, afterRead).chip).toBe("you choose");
    expect(fieldChip("primaryGrape", d, afterRead).chip).toBe("you confirm");
  });
  it("a producer with no region link reads matched", () =>
    expect(fieldChip("producer", { ...emptyDraft(), producer: cigliuti }, ctx)).toEqual({ chip: "matched", note: null }));
  it("a blank pending producer is still required", () =>
    expect(fieldChip("producer", { ...emptyDraft(), producer: { kind: "pending", name: "  " } }, ctx).chip).toBe("required"));
  it("a draft from a matched catalog wine: the producer reads matched, the other fields carry no chip", () => {
    const d: WineIdentityDraft = {
      ...emptyDraft(), producer: cigliuti, colour: "RED", countryId: "it", appellationId: "bbr", blend: [nebbiolo],
      provenance: { producer: "catalog-match", colour: "catalog-match", country: "catalog-match", appellation: "catalog-match", primaryGrape: "catalog-match", blend: "catalog-match" },
    };
    expect(fieldChip("producer", d, ctx).chip).toBe("matched");
    for (const field of ["colour", "country", "appellation", "primaryGrape"] as const) expect(fieldChip(field, d, ctx).chip).toBeNull();
  });
  it("the producer-link note needs the producer it names", () => {
    const orphan: WineIdentityDraft = { ...emptyDraft(), countryId: "it", provenance: { country: "producer-region" } };
    expect(fieldChip("country", orphan, ctx)).toEqual({ chip: null, note: null });
    const linked: WineIdentityDraft = { ...orphan, producer: cigliuti };
    expect(fieldChip("country", linked, ctx)).toEqual({ chip: null, note: "Filled from Cigliuti's region link. Change either if the bottle disagrees." });
  });
  it("unidentified (byhand-7): producer, colour and style are no longer required", () => {
    const unidentified = { ...ctx, unidentified: true, attempted: true } as const;
    for (const field of ["producer", "colour", "style"] as const) expect(fieldChip(field, emptyDraft(), unidentified).chip).toBeNull();
    expect(fieldChip("country", emptyDraft(), unidentified).chip).toBe("required");
    expect(fieldChip("appellation", emptyDraft(), unidentified).chip).toBe("you choose");
  });
  it("a Fix-focused or post-save missing field is flagged, and says 'did not read' only after a read", () => {
    expect(fieldChip("appellation", emptyDraft(), { ...ctx, focusField: "appellation" }).chip).toBe("required");
    expect(fieldChip("primaryGrape", emptyDraft(), { ...ctx, attempted: true }).chip).toBe("required");
    expect(fieldChip("producer", emptyDraft(), { ...afterRead, attempted: true }).chip).toBe("did not read — required");
    expect(fieldChip("appellation", emptyDraft(), { ...afterRead, focusField: "vintage" }).chip).toBe("did not read");
    expect(fieldChip("wineName", emptyDraft(), { ...afterRead, attempted: true })).toEqual({ chip: null, note: "Leave blank if the label has no cuvée name" });
  });
  it("a present value is never flagged, and an out-of-range year counts as missing", () => {
    const d: WineIdentityDraft = { ...emptyDraft(), countryId: "it", provenance: { country: "manual" } };
    expect(fieldChip("country", d, { ...afterRead, attempted: true, focusField: "country" })).toEqual({ chip: null, note: null });
    const tooOld: WineIdentityDraft = { ...emptyDraft(), vintage: { kind: "YEAR", year: 1850, tawnyYears: null, read: true } };
    expect(fieldChip("vintage", tooOld, { ...afterRead, focusField: "vintage" }).chip).toBe("did not read — required");
  });
});

describe("applyProducerRegion, edges", () => {
  const link = { regionId: "pie", countryId: "it" };
  const nouveau = { kind: "pending", name: "Domaine Nouveau" } as const;
  const palmer = { kind: "existing", id: "p-pal", name: "Château Palmer" } as const;
  // resolve.ts step 7: the read named the country and the producer's region link filled the region.
  const scanned: WineIdentityDraft = {
    ...emptyDraft(), producer: { kind: "existing", id: "p-las", name: "Château Lascombes" }, countryId: "fr", regionId: "bdx",
    provenance: { producer: "label", country: "label", region: "producer-region" },
  };

  it("returns the same draft when nothing changes", () => {
    const untouched = emptyDraft();
    expect(applyProducerRegion(untouched, null)).toBe(untouched);
    const linked = applyProducerRegion(emptyDraft(), link);
    expect(applyProducerRegion(linked, { ...link })).toBe(linked);
  });
  it("never overwrites a label-read region, nor fills the country above it", () => {
    const read: WineIdentityDraft = { ...emptyDraft(), regionId: "bdx", provenance: { region: "label" } };
    expect(applyProducerRegion(read, link)).toBe(read);
  });
  it("a scan's link-filled region is cleared by a producer with no link, or by a link in another country", () => {
    for (const next of [null, link]) {
      const switched = applyProducerRegion({ ...scanned, producer: nouveau }, next);
      expect(switched).toMatchObject({ countryId: "fr", regionId: null, provenance: { producer: "label", country: "label" } });
      expect("region" in switched.provenance).toBe(false);
      expect(fieldChip("region", switched, ctx)).toEqual({ chip: "required", note: null });
    }
  });
  it("a link in the kept country fills the region, and the note names the new producer (resolve.ts step 7)", () => {
    const switched = applyProducerRegion({ ...scanned, producer: palmer }, { regionId: "mar", countryId: "fr" });
    expect(switched).toMatchObject({ countryId: "fr", regionId: "mar", provenance: { country: "label", region: "producer-region" } });
    expect(fieldChip("region", switched, ctx).note).toBe("Filled from Château Palmer's region link. Change either if the bottle disagrees.");
    const manual: WineIdentityDraft = { ...emptyDraft(), countryId: "it", provenance: { country: "manual" } };
    expect(applyProducerRegion(manual, link)).toMatchObject({ countryId: "it", regionId: "pie", provenance: { country: "manual", region: "producer-region" } });
  });
  it("a hand-picked region: the country the old link filled is cleared, unless the new link names that region", () => {
    const repicked: WineIdentityDraft = { ...applyProducerRegion(emptyDraft(), link), producer: cigliuti, regionId: "lan", provenance: { country: "producer-region", region: "manual" } };
    for (const next of [{ regionId: "bdx", countryId: "fr" }, null]) {
      const switched = applyProducerRegion({ ...repicked, producer: palmer }, next);
      expect([switched.countryId, switched.regionId, "country" in switched.provenance, switched.provenance.region]).toEqual([null, "lan", false, "manual"]);
      expect(fieldChip("country", switched, ctx)).toEqual({ chip: "required", note: null });
    }
    expect(applyProducerRegion(repicked, { regionId: "lan", countryId: "it" })).toBe(repicked);
  });
  it("an explicit none provenance counts as untouched", () => {
    const none: WineIdentityDraft = { ...emptyDraft(), provenance: { country: "none", region: "none" } };
    expect(applyProducerRegion(none, link)).toMatchObject({ countryId: "it", regionId: "pie", provenance: { country: "producer-region", region: "producer-region" } });
  });
  it("keeps every other provenance key when it clears the link", () => {
    const d: WineIdentityDraft = { ...applyProducerRegion(emptyDraft(), link), vintage: { kind: "NV", year: null, tawnyYears: null, read: false } };
    const withVintage: WineIdentityDraft = { ...d, provenance: { ...d.provenance, vintage: "manual" } };
    expect(applyProducerRegion(withVintage, null).provenance).toEqual({ vintage: "manual" });
  });
});

describe("pickProducerAdoption, edges", () => {
  const hits = [{ id: "p1", name: "Château Palmer" }, { id: "p2", name: "Château Pape-Clément" }];
  it("adopts a folded-equal hit even when it is not the top hit", () =>
    expect(pickProducerAdoption("CHATEAU PAPE CLEMENT", hits)).toEqual({ adopt: hits[1] }));
  it("trims a pending name", () => expect(pickProducerAdoption("  Domaine Nouveau ", [])).toEqual({ pending: "Domaine Nouveau" }));
  it("a query with nothing to fold adopts nothing", () => expect(pickProducerAdoption("—", hits)).toEqual({ suggest: hits[0] }));
});

describe("blend line and header, edges", () => {
  it("one grape names only the primary; no grapes, no line", () => {
    expect(blendScoredLine(["Merlot"])).toBe("Scored as Merlot (primary)");
    expect(blendScoredLine([" ", "Merlot"])).toBe("Scored as Merlot (primary)");
    expect(blendScoredLine([])).toBeNull();
  });
  it("finishing with no gaps left shows no badge", () =>
    expect(byHandHeader({ matrix: sheetMatrix({ kind: "catalog" }, false), finishing: { glass: null }, gaps: 0 })).toEqual({
      eyebrow: "Catalog · by hand", title: "Finish this wine", badge: null, intro: "Filled in from your scan. Correct anything the camera got wrong.",
    }));
});

describe("commonGrapesHeading and regionGrapeChipIds (owner report 2026-09-15, L.A. Cetto Brut)", () => {
  it("heading names the region", () => expect(commonGrapesHeading("Baja California")).toBe("Common in Baja California"));

  const ids = ["cs", "temp", "chard", "chenin", "sb"];
  const colours: Record<string, "RED" | "WHITE" | null> = { cs: "RED", temp: "RED", chard: "WHITE", chenin: "WHITE", sb: "WHITE" };

  it("no colour chosen yet keeps every grape", () => expect(regionGrapeChipIds(ids, colours, null, null)).toEqual(ids));
  it("ROSE and ORANGE keep every grape", () => {
    expect(regionGrapeChipIds(ids, colours, "ROSE", "STILL")).toEqual(ids);
    expect(regionGrapeChipIds(ids, colours, "ORANGE", "STILL")).toEqual(ids);
  });
  it("RED keeps only red grapes", () => expect(regionGrapeChipIds(ids, colours, "RED", "STILL")).toEqual(["cs", "temp"]));
  it("WHITE keeps only white grapes for a still wine", () => expect(regionGrapeChipIds(ids, colours, "WHITE", "STILL")).toEqual(["chard", "chenin", "sb"]));
  it("a SPARKLING white keeps the reds too (blanc de noirs) — the Baja California case", () =>
    expect(regionGrapeChipIds(ids, colours, "WHITE", "SPARKLING")).toEqual(ids));
  it("a grape with no colour on file is never filtered out", () =>
    expect(regionGrapeChipIds([...ids, "mystery"], { ...colours, mystery: null }, "WHITE", "STILL")).toEqual(["chard", "chenin", "sb", "mystery"]));
  it("caps at five even when the shortlist is longer", () =>
    expect(regionGrapeChipIds(["a", "b", "c", "d", "e", "f"], {}, null, null)).toEqual(["a", "b", "c", "d", "e"]));
});
