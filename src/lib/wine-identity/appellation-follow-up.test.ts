// Owner fix C (2026-09-19, spec docs/superpowers/specs/2026-09-19-scan-region-appellation.md
// §6.2, §6.6, §9.2): the one billed follow-up lookup, gated and orchestrated. Pure:
// `call` and `keep` are fakes, so nothing here reaches the API or the database.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { AppellationLookupFacts, AppellationLookupOutcome } from "../label-scan/appellation-lookup-schema";
import type { LabelLookupRow } from "../label-scan/guards";
import { coerceLabelRead, type LabelRead } from "../label-scan/label-read-schema";
import {
  appellationLookupRequest, applyAppellationLookup, followUpAppellation, pickListedAppellation,
} from "./appellation-follow-up";
import { missingWineFields } from "./complete";
import { resolveLabelRead, type RefLookup } from "./resolve";
import type { WineIdentityDraft } from "./types";
import { loadReferenceSnapshot, snapshotLookup, type ReferenceSnapshot } from "./__fixtures__/snapshot-lookup";

const NOW = new Date("2026-09-19T12:00:00Z");
const fixture = (f: string) => JSON.parse(readFileSync(path.join(process.cwd(), "src/lib/label-scan/__fixtures__", f), "utf8"));

// resolve.test.ts's "owner fixes A and B" snapshot, with no catalog siblings, so the
// resolver leaves the Tridente appellation for the follow-up.
const tri = (): ReferenceSnapshot => ({
  countries: [{ id: "es", name: "Spain" }, { id: "pt", name: "Portugal" }],
  regions: [
    { id: "clm", name: "Castilla La Mancha", country_id: "es" }, { id: "cyl", name: "Castilla y Leon", country_id: "es" },
    { id: "es-none", name: "None", country_id: "es" }, { id: "dou", name: "Douro", country_id: "pt" },
  ],
  appellations: [
    { id: "clm-a", name: "Castilla La Mancha", region_id: "clm" }, { id: "cyl-a", name: "Castilla y Leon", region_id: "cyl" },
    { id: "rib", name: "Ribera del Duero DO", region_id: "cyl" }, { id: "es-none-a", name: "None", region_id: "es-none" },
  ],
  none: [{ country_id: "es", region_id: "es-none", appellation_id: "es-none-a" }],
  producers: [
    { id: "p-tri", name: "Bodegas Tridente", region_id: "cyl" }, { id: "p-unlinked", name: "Bodegas Sin Enlace", region_id: null },
  ],
  aliases: [{ id: "a-tri", producer_id: "p-tri", alias: "Tridente" }],
  grapes: [{ id: "tem", name: "Tempranillo" }, { id: "gar", name: "Garnacha" }],
  type_designations: [],
  catalog_wines: [],
});
const TRIDENTE = {
  noGeographicIndication: false, country: "Spain", region: "Castilla-La Mancha", appellation: null,
  producer: "Tridente", wineName: "Tridente", colour: "RED", style: "STILL", designation: null,
  grapes: [{ name: "Tempranillo", percentage: 100 }], rawText: "TRIDENTE TEMPRANILLO",
  vintageKind: "NV", vintageRead: false, vintageYear: null,
};
const readOf = (patch: Record<string, unknown> = {}): LabelRead =>
  coerceLabelRead({ ...fixture("vin-de-france.json"), ...TRIDENTE, ...patch });
const resolved = (read: LabelRead, lookup: RefLookup = snapshotLookup(tri())) => resolveLabelRead(read, lookup, { imageUrl: null });

const usage = { input_tokens: 512, output_tokens: 40 };
const ok = (answer: string | null): AppellationLookupOutcome => ({ ok: true, answer, model: "claude-sonnet-5", usage });

/** followUpAppellation with recording fakes. */
async function follow(
  read: LabelRead,
  draft: WineIdentityDraft,
  outcome: AppellationLookupOutcome | (() => Promise<AppellationLookupOutcome>),
  opts: { readId?: string | null; lookup?: RefLookup; keep?: (row: LabelLookupRow & { label_read_id: string }) => Promise<void> } = {},
) {
  const calls: AppellationLookupFacts[] = [];
  const kept: (LabelLookupRow & { label_read_id: string })[] = [];
  const result = await followUpAppellation({
    read, draft, lookup: opts.lookup ?? snapshotLookup(tri()), readId: opts.readId === undefined ? "read-1" : opts.readId,
    call: async (facts) => {
      calls.push(facts);
      return typeof outcome === "function" ? outcome() : outcome;
    },
    keep: opts.keep ?? (async (row) => { kept.push(row); }),
  });
  return { ...result, calls, kept };
}

describe("appellationLookupRequest: the gate (spec §6.2)", () => {
  it("1. Tridente with no catalog siblings sends exactly one request, inside the producer link's region", async () => {
    const read = readOf();
    const draft = await resolved(read);
    expect([draft.regionId, draft.provenance.region, draft.appellationId]).toEqual(["cyl", "producer-region", null]);
    const request = await appellationLookupRequest(read, draft, snapshotLookup(tri()));
    expect(request).toEqual({
      regionId: "cyl",
      rows: [{ id: "cyl-a", name: "Castilla y Leon" }, { id: "rib", name: "Ribera del Duero DO" }],
      facts: {
        producer: "Bodegas Tridente", wineName: "Tridente", grapes: ["Tempranillo"], colour: "RED", style: "STILL",
        country: "Spain", region: "Castilla y Leon", labelText: "TRIDENTE TEMPRANILLO",
        appellations: ["Castilla y Leon", "Ribera del Duero DO"],
      },
    });
    const r = await follow(read, draft, ok(null));
    expect(r.calls).toHaveLength(1);
  });

  // Review fix (2026-09-19): a correct but unprinted guess that Bodegas Tridente's
  // link confirms is `producer-region` (resolver step 7), so it asks exactly as
  // the wrong guess does — our data vouching for a region never costs the lookup.
  it("1b. a correct unprinted guess the producer's link confirms asks exactly like a wrong one", async () => {
    const wrong = readOf();
    const right = readOf({ region: "Castilla y Leon" });
    const draft = await resolved(right);
    expect([draft.regionId, draft.provenance.region, draft.appellationId]).toEqual(["cyl", "producer-region", null]);
    const request = await appellationLookupRequest(right, draft, snapshotLookup(tri()));
    expect(request).not.toBeNull();
    expect(request).toEqual(await appellationLookupRequest(wrong, await resolved(wrong), snapshotLookup(tri())));
    expect((await follow(right, draft, ok("Castilla y Leon"))).draft.appellationId).toBe("cyl-a");
  });

  // Review fix (2026-09-19): printed appellation text step 4 could not place never
  // takes the siblings' appellation (resolver step 7.6); inside a trusted region it
  // comes here instead, with the label's own text among the facts.
  it("1c. appellation text the resolver could not place goes to the lookup, not to the siblings", async () => {
    const withSibling: ReferenceSnapshot = {
      ...tri(),
      catalog_wines: [{ id: "cw-2018", producer_id: "p-tri", wine_name: "Tridente", colour: "RED", style: "STILL",
        primary_grape_id: "tem", appellation_id: "cyl-a", blind_pending: false, merged_into: null }],
    };
    const read = readOf({ appellation: "D.O. Toro", region: null, rawText: "TRIDENTE · D.O. TORO" });
    const draft = await resolved(read, snapshotLookup(withSibling));
    expect([draft.regionId, draft.provenance.region, draft.appellationId]).toEqual(["cyl", "producer-region", null]);
    const request = await appellationLookupRequest(read, draft, snapshotLookup(withSibling));
    expect([request?.regionId, request?.facts.labelText]).toEqual(["cyl", "TRIDENTE · D.O. TORO"]);
  });

  it("a tawny read asks as FORTIFIED, and a printed region is trusted", async () => {
    const read = readOf({ rawText: "TRIDENTE · CASTILLA Y LEON · TEMPRANILLO", region: "Castilla y Leon", style: "SWEET", vintageKind: "TAWNY", vintageTawnyYears: 20 });
    const draft = await resolved(read, snapshotLookup({ ...tri(), appellations: tri().appellations.filter((a) => a.id !== "cyl-a") }));
    const request = await appellationLookupRequest(read, draft, snapshotLookup({ ...tri(), appellations: tri().appellations.filter((a) => a.id !== "cyl-a") }));
    expect([draft.provenance.region, request?.facts.style, request?.rows.map((row) => row.id)]).toEqual(["label", "FORTIFIED", ["rib"]]);
  });

  it("2. a no-GI read triggers neither step 7.6 nor the follow-up", async () => {
    const read = readOf({ noGeographicIndication: true });
    const draft = await resolved(read);
    expect(await appellationLookupRequest(read, draft, snapshotLookup(tri()))).toBeNull();
    // Even with its tier appellation cleared, the no-GI flag alone refuses.
    expect(await appellationLookupRequest(read, { ...draft, appellationId: null }, snapshotLookup(tri()))).toBeNull();
    expect((await follow(read, draft, ok("Castilla y Leon"))).calls).toEqual([]);
  });

  it("3. the gate refuses every other case, and the call is never made", async () => {
    const read = readOf();
    const draft = await resolved(read);
    const lookup = snapshotLookup(tri());
    const many = (n: number): RefLookup => ({
      ...lookup,
      appellationsInRegion: async () => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `Appellation ${i}` })),
    });
    const pendingRead = readOf({ producer: "Bodegas Desconocidas" });
    const pendingDraft = await resolved(pendingRead);
    expect([pendingDraft.regionId, pendingDraft.provenance.region]).toEqual(["clm", "label"]); // unprinted, not ours (D4)

    const refused: [string, LabelRead, WineIdentityDraft, RefLookup][] = [
      ["the appellation is already set", read, { ...draft, appellationId: "rib" }, lookup],
      ["the region is null", read, { ...draft, regionId: null }, lookup],
      ["the country is null", read, { ...draft, countryId: null }, lookup],
      ["not a wine label", { ...read, isWineLabel: false }, draft, lookup],
      ["an unprinted label region (a pending producer, D4)", pendingRead, pendingDraft, lookup],
      ["a manual region", read, { ...draft, provenance: { ...draft.provenance, region: "manual" } }, lookup],
      ["neither a producer nor a wine name", { ...read, wineName: null }, { ...draft, producer: null }, lookup],
      ["no appellation in the region", read, draft, many(0)],
      ["more than the cap in the region", read, draft, many(301)],
    ];
    for (const [why, r, d, l] of refused) {
      expect([why, await appellationLookupRequest(r, d, l)]).toEqual([why, null]);
      expect([why, (await follow(r, d, ok("Castilla y Leon"), { lookup: l })).calls]).toEqual([why, []]);
    }
    // The cap itself is allowed.
    expect((await appellationLookupRequest(read, draft, many(300)))?.rows).toHaveLength(300);
    // A wine name alone, or a producer alone, is something to look up.
    expect(await appellationLookupRequest({ ...read, wineName: null }, draft, lookup)).not.toBeNull();
    expect(await appellationLookupRequest(read, { ...draft, producer: null }, lookup)).not.toBeNull();
  });

  it("3. a read that was not kept (readId null) is never looked up: no record would be possible", async () => {
    const read = readOf();
    const draft = await resolved(read);
    const inner = snapshotLookup(tri());
    const asked: string[] = [];
    const lookup: RefLookup = { ...inner, appellationsInRegion: (id) => { asked.push(id); return inner.appellationsInRegion(id); } };
    const r = await follow(read, draft, ok("Castilla y Leon"), { readId: null, lookup });
    expect([r.calls, r.kept, asked, r.draft, r.failure]).toEqual([[], [], [], draft, null]);
  });
});

describe("pickListedAppellation: our own list, exactly one fold-equal entry", () => {
  const rows = [{ id: "cyl-a", name: "Castilla y Leon" }, { id: "rib", name: "Ribera del Duero DO" }];
  it.each(["Castilla y León", "castilla y leon", "CASTILLA-Y-LEON", "  Castilla y Leon  "])("4. %j picks cyl-a", (answer) =>
    expect(pickListedAppellation(answer, rows)).toEqual(rows[0]));
  it.each(["Castilla y Leon VdlT", "Rioja DOCa", "", "   ", "—", "Ribera del Duero"])("5. %j is not in the list", (answer) =>
    expect(pickListedAppellation(answer, rows)).toBeNull());
  it("5. two entries that fold alike pick nothing", () =>
    expect(pickListedAppellation("Castilla y Leon", [...rows, { id: "cyl-b", name: "Castilla-y-León" }])).toBeNull());
  it("applyAppellationLookup sets the appellation only, marked lookup", () => {
    const d: WineIdentityDraft = {
      ...coerceDraft(), countryId: "es", regionId: "cyl", provenance: { country: "label", region: "producer-region" },
    };
    expect(applyAppellationLookup(d, rows[0])).toEqual({
      ...d, appellationId: "cyl-a", provenance: { country: "label", region: "producer-region", appellation: "lookup" },
    });
  });
});

function coerceDraft(): WineIdentityDraft {
  return {
    producer: null, wineName: null, vintage: { kind: null, year: null, tawnyYears: null, read: false }, colour: null, style: null,
    countryId: null, regionId: null, appellationId: null, blend: [], typeDesignationId: null, alcohol: null,
    description: null, imageUrl: null, provenance: {},
  };
}

describe("followUpAppellation (spec §6.6)", () => {
  const base = { label_read_id: "read-1", region_id: "cyl", candidates: 2, model: "claude-sonnet-5", ...usage };

  it("6. an answer in the list fills the appellation (lookup); region and country stay; the row is kept", async () => {
    const read = readOf();
    const draft = await resolved(read);
    const r = await follow(read, draft, ok("Castilla y Leon"));
    expect([r.draft.appellationId, r.draft.provenance.appellation, r.draft.regionId, r.draft.provenance.region,
      r.draft.countryId, r.draft.provenance.country, r.failure]).toEqual(["cyl-a", "lookup", "cyl", "producer-region", "es", "label", null]);
    expect(missingWineFields(r.draft, { now: NOW })).toEqual(["vintage"]);
    expect(r.kept).toEqual([{ ...base, outcome: "answer", answer: "Castilla y Leon", appellation_id: "cyl-a" }]);
    // The input draft is not mutated.
    expect(draft.appellationId).toBeNull();
  });

  it("7. an answer outside the list is discarded and kept as such; the draft is unchanged", async () => {
    const read = readOf();
    const draft = await resolved(read);
    const r = await follow(read, draft, ok("Toro DO"));
    expect([r.draft, r.failure]).toEqual([draft, null]);
    expect(r.kept).toEqual([{ ...base, outcome: "discarded", answer: "Toro DO", appellation_id: null }]);
  });

  it("8. a null answer is kept as no-answer; the draft is unchanged", async () => {
    const read = readOf();
    const draft = await resolved(read);
    const r = await follow(read, draft, ok(null));
    expect([r.draft, r.kept]).toEqual([draft, [{ ...base, outcome: "no-answer", answer: null, appellation_id: null }]]);
  });

  it("9. a billed not-read is kept with its usage; the draft is unchanged", async () => {
    const read = readOf();
    const draft = await resolved(read);
    const r = await follow(read, draft, { ok: false, reason: "not-read", model: "claude-sonnet-5", usage });
    expect([r.draft, r.kept]).toEqual([draft, [{ ...base, outcome: "not-read", answer: null, appellation_id: null }]]);
  });

  it("10. a timeout or a skipped lookup keeps nothing and changes nothing", async () => {
    const read = readOf();
    const draft = await resolved(read);
    for (const outcome of [
      { ok: false, reason: "timeout", model: "claude-sonnet-5", usage: null },
      { ok: false, reason: "skipped", model: null, usage: null },
    ] as AppellationLookupOutcome[]) {
      const r = await follow(read, draft, outcome);
      expect([r.calls.length, r.kept, r.draft, r.failure]).toEqual([1, [], draft, null]);
    }
  });

  it("11. a failed follow-up never fails the scan: a throwing call leaves the draft, a failed record keeps the answer", async () => {
    const read = readOf();
    const draft = await resolved(read);
    const boom = new Error("boom");
    const thrown = await follow(read, draft, async () => { throw boom; });
    expect([thrown.draft, thrown.failure, thrown.kept]).toEqual([draft, boom, []]);

    const rejected = await follow(read, draft, ok("Castilla y Leon"), { keep: async () => { throw new Error("insert failed"); } });
    expect([rejected.draft.appellationId, rejected.draft.provenance.appellation, rejected.failure]).toEqual(["cyl-a", "lookup", null]);

    const syncThrow = await follow(read, draft, ok("Castilla y Leon"), { keep: () => { throw new Error("sync"); } });
    expect([syncThrow.draft.appellationId, syncThrow.failure]).toEqual(["cyl-a", null]);

    const inner = snapshotLookup(tri());
    const brokenLookup: RefLookup = { ...inner, appellationsInRegion: async () => { throw new Error("db down"); } };
    const broken = await follow(read, draft, ok("Castilla y Leon"), { lookup: brokenLookup });
    expect([broken.draft, broken.calls, (broken.failure as Error).message]).toEqual([draft, [], "db down"]);
  });
});

// The cost pin (spec §9.2 case 12): replaying every recorded read against the
// committed snapshot, no read buys a follow-up — step 7.6 fills Tridente's
// appellation from its catalog siblings first. Only when the snapshot's
// catalog_wines is removed do the three Tridente reads (#15 both rounds and #17)
// ask, each inside Castilla y Leon. So no other recorded read would ever be billed.
describe("across the live fixtures: only Tridente, and only without its catalog siblings, would ever ask", () => {
  const LIVE_DIR = path.join(process.cwd(), "src/lib/label-scan/__fixtures__/live");
  const files = [
    ...readdirSync(LIVE_DIR).filter((f) => f.endsWith(".json")),
    ...readdirSync(path.join(LIVE_DIR, "r2")).filter((f) => f.endsWith(".json")).map((f) => `r2/${f}`),
  ].sort();
  let snap: ReferenceSnapshot;
  beforeAll(() => { snap = loadReferenceSnapshot(); });

  const asks = async (s: ReferenceSnapshot) => {
    const out: Record<string, string | null> = {};
    for (const file of files) {
      const read = coerceLabelRead(JSON.parse(readFileSync(path.join(LIVE_DIR, file), "utf8")));
      const lookup = snapshotLookup(s);
      const draft = await resolveLabelRead(read, lookup, { imageUrl: null });
      const call = vi.fn(async () => ok(null));
      const request = await appellationLookupRequest(read, draft, lookup);
      await followUpAppellation({ read, draft, lookup, readId: "r", call, keep: async () => undefined });
      expect([file, call.mock.calls.length]).toEqual([file, request === null ? 0 : 1]);
      out[file] = request === null ? null : s.regions.find((r) => r.id === request.regionId)?.name ?? "?";
    }
    return out;
  };

  it("12. with the committed catalog rows, no recorded read asks", async () => {
    expect(files.length).toBe(22);
    expect(Object.values(await asks(snap)).filter((v) => v !== null)).toEqual([]);
  });

  it("12. without them, exactly #15 (both rounds) and #17 ask, inside Castilla y Leon", async () => {
    const asked = Object.entries(await asks({ ...snap, catalog_wines: [] })).filter(([, v]) => v !== null);
    expect(asked).toEqual([
      ["r2/tridente-vintage-unread.json", "Castilla y Leon"],
      ["tridente-2020.json", "Castilla y Leon"],
      ["tridente-vintage-unread.json", "Castilla y Leon"],
    ]);
  });
});
