import type { Database } from "@/lib/supabase/database.types";
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
