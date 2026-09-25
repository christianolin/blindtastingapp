import { describe, expect, it } from "vitest";
import { aromasToPayload, emptyNoteState, noteToPayload } from "./note-state";
import type { WsetNoteState } from "./types";

// The keys save_wset_note reads from p_note (its live body, recreated in
// supabase/migrations/20260914094500_hidden_glass_notes.sql: every
// `p_note->>'…'` / `p_note->'…'`), which record_training_attempt passes on.
// A key the client spells differently is silently dropped by the RPC, so the
// set must match exactly.
const RPC_NOTE_KEYS = [
  "id",
  "catalog_wine_id",
  "unidentified_wine_id",
  "context_kind",
  "tasting_wine_id",
  "tasted_on",
  "clarity",
  "appearance_intensity",
  "colour_hue",
  "observations",
  "condition",
  "faults",
  "nose_intensity",
  "development",
  "sweetness",
  "acidity",
  "tannin",
  "tannin_nature",
  "alcohol",
  "body",
  "mousse",
  "flavour_intensity",
  "finish",
  "quality_score",
  "price_category",
  "readiness",
  "taster_notes",
];

const RATED: WsetNoteState = {
  id: "note-1",
  tastedOn: "2026-09-24",
  clarity: "CLEAR",
  appearanceIntensity: "DEEP",
  colourHue: "GARNET",
  observations: ["LEGS_TEARS"],
  condition: "CLEAN",
  faults: [],
  noseIntensity: "MEDIUM_PLUS",
  development: "DEVELOPING",
  sweetness: "DRY",
  acidity: "MEDIUM_PLUS",
  tannin: "HIGH",
  tanninNature: ["FINE_GRAINED"],
  alcohol: "MEDIUM",
  body: "FULL",
  mousse: null,
  flavourIntensity: "MEDIUM_PLUS",
  finish: "LONG",
  qualityScore: 93,
  priceCategory: "PREMIUM",
  readiness: "NEEDS_TIME",
  tasterNotes: "cedar, pencil shavings",
  noseTermIds: ["t-blackcurrant", "t-cedar"],
  palateTermIds: ["t-cedar", "t-leather"],
};

describe("noteToPayload", () => {
  it("spells exactly the keys save_wset_note reads", () => {
    const p = noteToPayload(emptyNoteState(), { catalogWineId: null, contextKind: "TRAINING", tastingWineId: null });
    expect(Object.keys(p).sort()).toEqual([...RPC_NOTE_KEYS].sort());
  });

  it("maps every sheet field to its column", () => {
    expect(
      noteToPayload(RATED, { catalogWineId: "wine-1", contextKind: "BLIND", tastingWineId: "glass-1" }),
    ).toEqual({
      id: "note-1",
      catalog_wine_id: "wine-1",
      unidentified_wine_id: null,
      context_kind: "BLIND",
      tasting_wine_id: "glass-1",
      tasted_on: "2026-09-24",
      clarity: "CLEAR",
      appearance_intensity: "DEEP",
      colour_hue: "GARNET",
      observations: ["LEGS_TEARS"],
      condition: "CLEAN",
      faults: [],
      nose_intensity: "MEDIUM_PLUS",
      development: "DEVELOPING",
      sweetness: "DRY",
      acidity: "MEDIUM_PLUS",
      tannin: "HIGH",
      tannin_nature: ["FINE_GRAINED"],
      alcohol: "MEDIUM",
      body: "FULL",
      mousse: null,
      flavour_intensity: "MEDIUM_PLUS",
      finish: "LONG",
      quality_score: 93,
      price_category: "PREMIUM",
      readiness: "NEEDS_TIME",
      taster_notes: "cedar, pencil shavings",
    });
  });

  it("passes an unidentified wine and a null context through", () => {
    const p = noteToPayload(RATED, {
      catalogWineId: null,
      unidentifiedWineId: "unid-1",
      contextKind: null,
      tastingWineId: null,
    });
    expect(p.unidentified_wine_id).toBe("unid-1");
    expect(p.context_kind).toBeNull();
    expect(p.catalog_wine_id).toBeNull();
  });
});

describe("aromasToPayload", () => {
  it("unions nose and palate ids, each once, flagged where sensed", () => {
    expect(aromasToPayload(RATED)).toEqual([
      { term_id: "t-blackcurrant", sensed_on_nose: true, sensed_on_palate: false },
      { term_id: "t-cedar", sensed_on_nose: true, sensed_on_palate: true },
      { term_id: "t-leather", sensed_on_nose: false, sensed_on_palate: true },
    ]);
  });

  it("is empty for a note with no aromas", () => {
    expect(aromasToPayload(emptyNoteState())).toEqual([]);
  });
});
