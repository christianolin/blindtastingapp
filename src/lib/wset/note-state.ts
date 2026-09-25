import type { Database } from "@/lib/supabase/database.types";
import type { NoteContextKind } from "./queries";
import type { WsetNoteState } from "./types";

type NoteRow = Database["public"]["Tables"]["wset_notes"]["Row"];
type AromaRow = { term_id: string; sensed_on_nose: boolean; sensed_on_palate: boolean };

// A blank sheet: every scale unrated, arrays empty, tasted today.
export function emptyNoteState(): WsetNoteState {
  return {
    id: null,
    tastedOn: new Date().toISOString().slice(0, 10),
    clarity: null,
    appearanceIntensity: null,
    colourHue: null,
    observations: [],
    condition: null,
    faults: [],
    noseIntensity: null,
    development: null,
    noseTermIds: [],
    sweetness: null,
    acidity: null,
    tannin: null,
    tanninNature: [],
    alcohol: null,
    body: null,
    mousse: null,
    flavourIntensity: null,
    finish: null,
    palateTermIds: [],
    qualityScore: null,
    priceCategory: null,
    readiness: null,
    tasterNotes: "",
  };
}

// Rehydrate a saved note (+ its aroma rows) back into sheet state.
export function noteStateFromRow(row: NoteRow, aromas: AromaRow[]): WsetNoteState {
  return {
    id: row.id,
    tastedOn: row.tasted_on,
    clarity: row.clarity,
    appearanceIntensity: row.appearance_intensity,
    colourHue: row.colour_hue,
    observations: row.observations ?? [],
    condition: row.condition,
    faults: row.faults ?? [],
    noseIntensity: row.nose_intensity,
    development: row.development,
    noseTermIds: aromas.filter((a) => a.sensed_on_nose).map((a) => a.term_id),
    sweetness: row.sweetness,
    acidity: row.acidity,
    tannin: row.tannin,
    tanninNature: row.tannin_nature ?? [],
    alcohol: row.alcohol,
    body: row.body,
    mousse: row.mousse,
    flavourIntensity: row.flavour_intensity,
    finish: row.finish,
    palateTermIds: aromas.filter((a) => a.sensed_on_palate).map((a) => a.term_id),
    qualityScore: row.quality_score,
    priceCategory: row.price_category,
    readiness: row.readiness,
    tasterNotes: row.taster_notes ?? "",
  };
}

// The p_note payload save_wset_note reads (and record_training_attempt passes
// on), built from sheet state: camelCase state to the RPC's snake_case keys.
// The one place those keys are spelled on the client: NoteEditor and the
// training room both call it (training-room spec §7.2). A null contextKind
// keeps an existing note's context on update and means OPEN on insert (the
// RPC's coalesce); unidentifiedWineId defaults to null, which the RPC reads
// the same as an absent key.
export function noteToPayload(
  state: WsetNoteState,
  ids: {
    catalogWineId: string | null;
    unidentifiedWineId?: string | null;
    contextKind: NoteContextKind | null;
    tastingWineId: string | null;
  },
): Record<string, unknown> {
  return {
    id: state.id,
    catalog_wine_id: ids.catalogWineId,
    unidentified_wine_id: ids.unidentifiedWineId ?? null,
    context_kind: ids.contextKind,
    tasting_wine_id: ids.tastingWineId,
    tasted_on: state.tastedOn,
    clarity: state.clarity,
    appearance_intensity: state.appearanceIntensity,
    colour_hue: state.colourHue,
    observations: state.observations,
    condition: state.condition,
    faults: state.faults,
    nose_intensity: state.noseIntensity,
    development: state.development,
    sweetness: state.sweetness,
    acidity: state.acidity,
    tannin: state.tannin,
    tannin_nature: state.tanninNature,
    alcohol: state.alcohol,
    body: state.body,
    mousse: state.mousse,
    flavour_intensity: state.flavourIntensity,
    finish: state.finish,
    quality_score: state.qualityScore,
    price_category: state.priceCategory,
    readiness: state.readiness,
    taster_notes: state.tasterNotes,
  };
}

// The p_aromas payload: the union of nose and palate term ids (nose order
// first, each id once), each flagged where it was sensed.
export function aromasToPayload(
  state: WsetNoteState,
): { term_id: string; sensed_on_nose: boolean; sensed_on_palate: boolean }[] {
  const ids = [...new Set([...state.noseTermIds, ...state.palateTermIds])];
  return ids.map((termId) => ({
    term_id: termId,
    sensed_on_nose: state.noseTermIds.includes(termId),
    sensed_on_palate: state.palateTermIds.includes(termId),
  }));
}
