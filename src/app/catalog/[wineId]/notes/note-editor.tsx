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
  contextKind = null,
  tastingWineId = null,
  consumptionId = null,
  embedded = false,
  onClose,
  onSaved,
}: {
  wineId: string;
  wine: { colour: WineColour; style: WineStyle };
  title: string;
  terms: AromaTerm[];
  initial: WsetNoteState;
  contextKind?: string | null;
  tastingWineId?: string | null;
  consumptionId?: string | null;
  embedded?: boolean;
  /** Close/exit the editor (modal close, or route back) — used by Discard. */
  onClose?: () => void;
  /** Called after a successful save (with the saved note id); a modal uses it
      to close itself (and skip the route swap the standalone page does). */
  onSaved?: (savedId?: string) => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  const onSave = useCallback(
    async (state: WsetNoteState) => {
      const pNote = {
        id: state.id,
        catalog_wine_id: wineId,
        context_kind: contextKind,
        tasting_wine_id: tastingWineId,
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
      // Back-link a cellar drink to the note it produced (owner-only via RLS).
      if (consumptionId && savedId) {
        await supabase
          .from("cellar_consumptions")
          .update({ wset_note_id: savedId })
          .eq("id", consumptionId);
      }
      // A modal (Taste & Rate) closes itself after saving; the standalone
      // route instead swaps to the saved note's own URL.
      if (onSaved) {
        onSaved(savedId);
      } else if (!state.id && savedId) {
        router.replace(`/catalog/${wineId}/notes/${savedId}`);
      }
      router.refresh();
    },
    [supabase, wineId, router, contextKind, tastingWineId, consumptionId, onSaved],
  );

  // Exit the editor. In a modal the parent supplies onClose; as a full route
  // we go to the wine's page — router.back() silently does nothing when the
  // editor was opened directly (fresh tab, or after the post-save replace), so
  // the target must be deterministic.
  const onDiscard = onClose ?? (() => router.push(`/catalog/${wineId}`));

  return (
    <WsetSheet
      wine={wine}
      title={title}
      terms={terms}
      initial={initial}
      onSave={onSave}
      onDiscard={onDiscard}
      embedded={embedded}
    />
  );
}
