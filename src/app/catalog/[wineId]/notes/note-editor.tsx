"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { WsetSheet, type WsetSheetHandle } from "@/components/wset/wset-sheet";
import { NOTES_ARCHIVE_HREF } from "@/lib/wset/note-saved";
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
  onDeleted,
  onSaved,
  sheetRef,
}: {
  /** Null for a hidden-glass note (blind-tasting B8): no identity until the
      glass is revealed — the save writes catalog_wine_id: null. */
  wineId: string | null;
  wine: { colour: WineColour | null; style: WineStyle | null };
  title: string;
  terms: AromaTerm[];
  initial: WsetNoteState;
  contextKind?: string | null;
  tastingWineId?: string | null;
  consumptionId?: string | null;
  embedded?: boolean;
  /** Close/exit the editor (modal close, or route back) — used by Discard. */
  onClose?: () => void;
  /** Called after the note was deleted; defaults to going to the wine page. */
  onDeleted?: () => void;
  /** Called after a successful save with the saved note id and the state that
      was saved (its id is the note's id before this save: null when this save
      created the note); a modal uses it to close itself (and skip the route
      swap the standalone page does) and to summarise the note (ledger R6). */
  onSaved?: (savedId: string, saved: WsetNoteState) => void;
  /** The open sheet's handle — a modal routes Escape and its backdrop through
      it, so they take the same dirty-aware path as Close. */
  sheetRef?: React.Ref<WsetSheetHandle>;
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
      let { data, error } = await supabase.rpc("save_wset_note", {
        p_note: pNote,
        p_aromas: pAromas,
      });
      // A hidden-glass note's hue can stop fitting mid-edit: the glass is
      // revealed (or the resolve races this very save) while a hue picked
      // under the still-hidden RED/STILL fallback no longer matches the wine
      // actually poured. wset_notes_check_hue refuses the whole write rather
      // than silently keeping a wrong colour (23514, the Postgres check-
      // violation SQLSTATE). Retry once with no hue — the same clearing the
      // reveal's own trigger applies when a save doesn't race it — so the
      // rest of the note is never lost to a race the taster can't see
      // (BT-N1 hand-off, spec §9.4/§9.5).
      if (error?.code === "23514" && pNote.colour_hue !== null) {
        ({ data, error } = await supabase.rpc("save_wset_note", {
          p_note: { ...pNote, colour_hue: null },
          p_aromas: pAromas,
        }));
      }
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
      // route instead swaps to the saved note's own URL. wineId is only ever
      // null for a hidden-glass note (blind-tasting B8), which always opens
      // through NewNoteModal (onSaved is always set there), so this branch
      // never actually runs with a null wineId.
      if (onSaved) {
        onSaved(savedId, state);
      } else if (!state.id && savedId && wineId) {
        router.replace(`/catalog/${wineId}/notes/${savedId}`);
      }
      router.refresh();
    },
    [supabase, wineId, router, contextKind, tastingWineId, consumptionId, onSaved],
  );

  // Exit the editor. In a modal the parent supplies onClose; as a full route
  // we go to the wine's page — router.back() silently does nothing when the
  // editor was opened directly (fresh tab, or after the post-save replace), so
  // the target must be deterministic. Falls back to the notes archive when
  // there is no wine yet (a hidden-glass note reached without a modal onClose
  // — not a real path today, but keeps this safe for wineId: null).
  const onDiscard = onClose ?? (() => router.push(wineId ? `/catalog/${wineId}` : NOTES_ARCHIVE_HREF));

  // Deleting only exists for a note that is already saved. RLS scopes the
  // delete to the author; aromas cascade and a cellar drink's link nulls out.
  const noteId = initial.id;
  const onDelete = noteId
    ? async () => {
        const { error } = await supabase
          .from("wset_notes")
          .delete()
          .eq("id", noteId);
        if (error) throw new Error(error.message);
        router.refresh();
        if (onDeleted) onDeleted();
        else if (onClose) onClose();
        else router.push(wineId ? `/catalog/${wineId}` : NOTES_ARCHIVE_HREF);
      }
    : undefined;

  // WsetSheet (Taste & Rate lane) still wants concrete colour/style; a
  // hidden-glass note's true "unknown" state degrades to the same RED/STILL
  // default every catalog wine with no colour/style on file already falls
  // back to elsewhere in this app. The hue and mousse rows are cosmetic here
  // — the reveal clears any hue that does not fit the wine actually poured
  // (M5's wset_notes_resolve_on_reveal), so a wrong default never sticks.
  const sheetWine = { colour: wine.colour ?? "RED", style: wine.style ?? "STILL" };

  return (
    <WsetSheet
      ref={sheetRef}
      wine={sheetWine}
      title={title}
      terms={terms}
      initial={initial}
      onSave={onSave}
      onDiscard={onDiscard}
      onDelete={onDelete}
      embedded={embedded}
    />
  );
}
