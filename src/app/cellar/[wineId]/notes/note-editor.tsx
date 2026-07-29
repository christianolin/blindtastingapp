"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { WsetSheet } from "@/components/wset/wset-sheet";
import type {
  WsetNoteState,
  AromaTerm,
  WineColour,
  WineStyle,
} from "@/lib/wset/types";

// Client wrapper: owns the save side-effect so WsetSheet stays presentational.
// Maps camelCase sheet state to the RPC's snake_case columns and builds the
// aroma payload (union of nose + palate ids, each flagged where sensed).
export function NoteEditor({
  wineId,
  wine,
  title,
  terms,
  initial,
}: {
  wineId: string;
  wine: { colour: WineColour; style: WineStyle };
  title: string;
  terms: AromaTerm[];
  initial: WsetNoteState;
}) {
  const router = useRouter();
  const supabase = createClient();

  const onSave = useCallback(
    async (state: WsetNoteState) => {
      const pNote = {
        id: state.id,
        catalog_wine_id: wineId,
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
      const ids = [...new Set([...state.noseTermIds, ...state.palateTermIds])];
      const pAromas = ids.map((termId) => ({
        term_id: termId,
        sensed_on_nose: state.noseTermIds.includes(termId),
        sensed_on_palate: state.palateTermIds.includes(termId),
      }));
      const { data, error } = await supabase.rpc("save_wset_note", {
        p_note: pNote,
        p_aromas: pAromas,
      });
      if (error) throw new Error(error.message);
      const savedId = data as unknown as string;
      if (!state.id && savedId) {
        router.replace(`/cellar/${wineId}/notes/${savedId}`);
      }
      router.refresh();
    },
    [supabase, wineId, router],
  );

  return (
    <WsetSheet wine={wine} title={title} terms={terms} initial={initial} onSave={onSave} />
  );
}
