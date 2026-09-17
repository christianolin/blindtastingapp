"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import {
  fetchCatalogWine,
  fetchHiddenNoteState,
  catalogWineTitle,
} from "@/lib/wset/queries";
import { emptyNoteState } from "@/lib/wset/note-state";
import { noteSavedReport } from "@/lib/wset/note-saved";
import type { NoteSummary } from "@/lib/wset/note-summary";
import { HIDDEN_NOTE_HINT, hiddenNoteTitle } from "@/lib/wset/hidden-note";
import { makeT } from "@/lib/wset/i18n";
import { useWsetLang } from "@/lib/wset/wset-lang";
import type {
  AromaTerm,
  WineColour,
  WineStyle,
  WsetNoteState,
} from "@/lib/wset/types";
import { NoteEditor } from "@/app/catalog/[wineId]/notes/note-editor";
import { useNoteSavedStep } from "@/components/note-saved-sheet";
import type { WsetSheetHandle } from "@/components/wset/wset-sheet";

/**
 * What NewNoteModal opens on. `catalog` is every existing caller (a catalog
 * wine, optionally scored into a tasting/OPEN board — unchanged); `hidden-glass`
 * is a note on a tasting glass that has not been revealed yet (blind-tasting
 * B8) — no catalog wine to load, since the note carries no identity until the
 * reveal resolves it. `wineId` stays the modal's older prop so every existing
 * caller keeps compiling untouched; `target` takes precedence when given.
 */
export type NoteTarget =
  | {
      kind: "catalog";
      wineId: string;
      tastingWineId?: string | null;
      contextKind?: string | null;
    }
  | {
      kind: "hidden-glass";
      tastingWineId: string;
      tastingName: string;
      glassLabel: string;
      /** Reopening an already-started hidden note, instead of a blank one. */
      noteId?: string;
    };

type Data = {
  /** Null only for a still-unresolved hidden-glass note. */
  wineId: string | null;
  wine: { colour: WineColour | null; style: WineStyle | null };
  title: string;
  /** True while this is a genuinely still-hidden glass's note — the render
      builds the localized hint text itself (`makeT(lang)`) rather than the
      load effect baking one language's copy into state, so toggling EN/DA
      never has to refetch anything (BT-N1 review round 1). */
  hidden: boolean;
  terms: AromaTerm[];
  initial: WsetNoteState;
  contextKind: string | null;
  tastingWineId: string | null;
};

/** What a save hands back (Taste & Rate ledger R6): the note's id and its summary. */
export type NoteSaved = { savedId: string; summary: NoteSummary };

// Taste & Rate opens the WSET note as a popup — full-screen on phones, a centred
// card on desktop — instead of navigating to the /catalog note page. It renders
// the very same editor the note route uses, so save/discard behave identically;
// the wine + aroma vocabulary are fetched on open. After a save it reports to
// the provider's after-save step (R6), which shows "Note saved" as this modal
// closes — on every path that opens it, after the first save of a new note.
export function NewNoteModal({
  wineId,
  unidentifiedWineId,
  target,
  onClose,
  cellarConsume = null,
  consumptionId = null,
  tastingWineId = null,
  contextKind = null,
  onSaved,
}: {
  /** @deprecated pass `target: { kind: "catalog", wineId, … }` instead — kept
      so every caller that predates the hidden-glass target still compiles. */
  wineId?: string;
  /** BT-R5 (S13c): the record glass's "Rate it" on a wine with no catalog
      match — the plain-prop alternative to `wineId`, for a caller that mounts
      this modal directly instead of going through the add-wine provider's
      note state (which only ever carries a `catalogWineId`). Ignored when
      `target` or `wineId` is given. The save still writes `catalog_wine_id:
      null` (like a hidden-glass note); `wset_notes_glass_resolve_on_write`
      resolves `unidentified_wine_id` from this glass's own answer key at
      write time, since a record glass is always fully revealed. */
  unidentifiedWineId?: string;
  target?: NoteTarget;
  onClose: () => void;
  cellarConsume?: { lotId: string } | null;
  /** A cellar drink this note is written for — `NoteEditor` back-links
      `cellar_consumptions.wset_note_id` on save. */
  consumptionId?: string | null;
  /** Attaches the note to a tasting wine (group Taste & Rate scoring, or
      BT-R5's resolve-on-write). Ignored when `target` is given — the target
      carries its own tastingWineId. */
  tastingWineId?: string | null;
  /** Ignored when `target` is given. */
  contextKind?: string | null;
  /** Extra work after save (e.g. refresh the tasting board), handed the saved
      note's id and summary; the modal closes afterwards. */
  onSaved?: (saved: NoteSaved) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null | "loading" | "unsupported">("loading");
  const sheetRef = useRef<WsetSheetHandle>(null);
  const reportNoteSaved = useNoteSavedStep();
  const { lang } = useWsetLang();

  // `target` takes precedence; the older wineId/tastingWineId/contextKind
  // props resolve to a "catalog" target so every existing caller compiles.
  // The effect below closes over these primitive fields, not over a
  // `resolvedTarget` object — a fresh literal every render (especially once
  // callers start passing `target={{ kind: "hidden-glass", … }}` inline)
  // would otherwise re-run the fetch on every render.
  const targetKind: NoteTarget["kind"] | "catalog-unidentified" | null =
    target?.kind ?? (wineId ? "catalog" : unidentifiedWineId ? "catalog-unidentified" : null);
  const targetWineId = (target?.kind === "catalog" ? target.wineId : wineId) ?? null;
  const targetTastingWineId =
    (target ? target.tastingWineId : tastingWineId) ?? null;
  const targetContextKind = target
    ? target.kind === "catalog"
      ? (target.contextKind ?? null)
      : null
    : contextKind;
  const targetTastingName = target?.kind === "hidden-glass" ? target.tastingName : null;
  const targetGlassLabel = target?.kind === "hidden-glass" ? target.glassLabel : null;
  const targetNoteId = target?.kind === "hidden-glass" ? (target.noteId ?? null) : null;

  useEffect(() => {
    // No target: an existing caller must pass wineId, and a new one must pass
    // target — both missing is a caller bug, not a state this modal recovers
    // from, so it stays on its initial "loading" rather than setState-in-effect.
    if (!targetKind) return;
    let cancelled = false;
    (async () => {
      const termRes = await supabase
        .from("wset_aroma_terms")
        .select("id, family, origin, group_name, term, sort_order")
        .order("sort_order");
      if (cancelled) return;
      const terms: AromaTerm[] = (termRes.data ?? []).map((t) => ({
        id: t.id,
        family: t.family,
        origin: t.origin,
        groupName: t.group_name,
        term: t.term,
        sortOrder: t.sort_order,
      }));

      if (targetKind === "hidden-glass") {
        if (!targetNoteId) {
          // A fresh note on a glass that is (as far as this viewer knows)
          // still hidden — nothing to reopen.
          setData({
            wineId: null,
            // Genuinely unknown until the reveal — NoteEditor is the one that
            // copes with a null colour/style (it feeds WsetSheet, owned by the
            // Taste & Rate lane, which still wants concrete values).
            wine: { colour: null, style: null },
            title: hiddenNoteTitle(targetTastingName ?? "", targetGlassLabel ?? ""),
            hidden: true,
            terms,
            initial: emptyNoteState(),
            contextKind: "BLIND",
            tastingWineId: targetTastingWineId,
          });
          return;
        }
        // Reopening an existing hidden-glass note: it may have resolved since
        // it was last open (the glass was revealed, or the save itself raced
        // the reveal and attached on write, M5x2). BT-N1 hand-off: open a
        // resolved note as an ordinary catalog note — real colour/style, no
        // hint — instead of the still-hidden editor, whose unknown-colour
        // fallback only fits a note that is genuinely still hidden and whose
        // hue picker would otherwise offer families the revealed wine can
        // never take (`wset_notes_check_hue` on the next save).
        const reopened = await fetchHiddenNoteState(supabase, targetNoteId);
        if (cancelled) return;
        if (!reopened) {
          setData(null);
          return;
        }
        if (reopened.catalogWineId) {
          const wine = await fetchCatalogWine(supabase, reopened.catalogWineId);
          if (cancelled) return;
          if (!wine) {
            setData(null);
            return;
          }
          setData({
            wineId: reopened.catalogWineId,
            wine: { colour: wine.colour ?? "RED", style: wine.style ?? "STILL" },
            title: catalogWineTitle(wine),
            hidden: false,
            terms,
            initial: reopened.state,
            contextKind: "BLIND",
            tastingWineId: targetTastingWineId,
          });
          return;
        }
        if (reopened.unidentifiedWineId) {
          // Resolved to an unidentified bottle instead — there is no catalog
          // view for that note yet (BT-R5's target). Say so rather than
          // silently reopening the hidden-glass editor under the wrong
          // colour family.
          setData("unsupported");
          return;
        }
        setData({
          wineId: null,
          wine: { colour: null, style: null },
          title: hiddenNoteTitle(targetTastingName ?? "", targetGlassLabel ?? ""),
          hidden: true,
          terms,
          initial: reopened.state,
          contextKind: "BLIND",
          tastingWineId: targetTastingWineId,
        });
        return;
      }

      if (targetKind === "catalog-unidentified") {
        if (!unidentifiedWineId) {
          setData(null);
          return;
        }
        const { data: u } = await supabase
          .from("catalog_wines_unidentified")
          .select(
            "wine_name, colour, style, vintage_kind, vintage_year, vintage_tawny_years, producer_id, appellation_id",
          )
          .eq("id", unidentifiedWineId)
          .maybeSingle();
        if (cancelled) return;
        if (!u) {
          setData(null);
          return;
        }
        // Producer/appellation looked up only for this one wine's ids
        // (CLAUDE.md: never preload those tables).
        let producerName: string | null = null;
        if (u.producer_id) {
          const { data: p } = await supabase
            .from("producers")
            .select("name")
            .eq("id", u.producer_id)
            .maybeSingle();
          producerName = p?.name ?? null;
        }
        let appellationName: string | null = null;
        if (u.appellation_id) {
          const { data: ap } = await supabase
            .from("appellations")
            .select("name")
            .eq("id", u.appellation_id)
            .maybeSingle();
          appellationName = ap?.name ?? null;
        }
        if (cancelled) return;
        setData({
          wineId: null,
          wine: { colour: u.colour ?? "RED", style: u.style ?? "STILL" },
          title: catalogWineTitle({
            producerName,
            wineName: u.wine_name,
            vintageKind: u.vintage_kind ?? "NV",
            vintageYear: u.vintage_year,
            vintageTawnyYears: u.vintage_tawny_years,
            appellationName,
          }),
          hidden: false,
          terms,
          initial: emptyNoteState(),
          contextKind: targetContextKind,
          tastingWineId: targetTastingWineId,
        });
        return;
      }

      if (!targetWineId) {
        setData(null);
        return;
      }
      const wine = await fetchCatalogWine(supabase, targetWineId);
      if (cancelled) return;
      if (!wine) {
        setData(null);
        return;
      }
      setData({
        wineId: targetWineId,
        wine: { colour: wine.colour ?? "RED", style: wine.style ?? "STILL" },
        title: catalogWineTitle(wine),
        hidden: false,
        terms,
        initial: emptyNoteState(),
        contextKind: targetContextKind,
        tastingWineId: targetTastingWineId,
      });
    })().catch(() => {
      if (!cancelled) setData(null);
    });
    return () => {
      cancelled = true;
    };
  }, [
    supabase,
    targetKind,
    targetWineId,
    unidentifiedWineId,
    targetTastingWineId,
    targetContextKind,
    targetTastingName,
    targetGlassLabel,
    targetNoteId,
  ]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return;
        // Escape and the backdrop take the sheet's own close path (the Discard
        // confirm while dirty); before the sheet mounts there is nothing to lose.
        if (sheetRef.current) sheetRef.current.requestClose();
        else onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        // Wider on big screens: the sheet reads small on a desktop monitor, so
        // the dialog takes more of the viewport (capped) and the .wset-sheet
        // desktop scale in globals.css enlarges its type to match.
        className="inset-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[92vh] sm:max-h-[92vh] sm:w-[calc(100vw-3rem)] sm:max-w-[1100px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:gap-4 sm:rounded-[16px] lg:max-w-[1400px]"
      >
        <DialogTitle className="sr-only">
          {data && data !== "loading" && data !== "unsupported" ? data.title : "Tasting note"}
        </DialogTitle>
        {data === "loading" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : data === "unsupported" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            This note is now attached to an unidentified bottle, not a catalog wine — it
            can&apos;t be reopened here yet.
          </p>
        ) : !data ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load this note right now.
          </p>
        ) : (
          <>
            {data.hidden ? (
              <p
                className="shrink-0 px-4 py-2 text-center text-[11px] text-muted-foreground sm:rounded-t-[16px] sm:px-6"
                style={{ background: "var(--accent)" }}
              >
                {makeT(lang)(HIDDEN_NOTE_HINT)}
              </p>
            ) : null}
            <NoteEditor
              wineId={data.wineId}
              wine={data.wine}
              title={data.title}
              terms={data.terms}
              initial={data.initial}
              contextKind={data.contextKind}
              tastingWineId={data.tastingWineId}
              consumptionId={consumptionId}
              embedded
              sheetRef={sheetRef}
              onClose={onClose}
              onSaved={async (savedId, saved) => {
                // A cellar bottle is drawn down only now that the note is saved.
                if (cellarConsume && savedId) {
                  // The note is already saved, so this cannot fail the save —
                  // but an undrawn bottle used to leave no trace at all, and
                  // the cellar count silently disagreed with the note.
                  const { error } = await supabase.rpc("consume_cellar_lot", {
                    p: {
                      lot_id: cellarConsume.lotId,
                      quantity: 1,
                      reason: "DRANK",
                      wset_note_id: savedId,
                    },
                  });
                  if (error) {
                    console.error("note saved, but the bottle was not drawn down", {
                      lotId: cellarConsume.lotId,
                      code: error.code,
                      message: error.message,
                    });
                  }
                }
                if (savedId) {
                  let catalogWineId = data.wineId;
                  let resolvedUnidentifiedWineId: string | null = null;
                  if (!catalogWineId) {
                    // A save can attach on write: a genuinely hidden glass
                    // races its own reveal (M5x2's
                    // wset_notes_glass_resolve_on_write), and BT-R5's
                    // "catalog-unidentified" target always writes with no
                    // identity up front so that same trigger resolves it from
                    // the (already revealed) glass's answer key. Either way
                    // this modal's own `data` never learns the id mid-save, so
                    // read the note back once and report what actually
                    // happened instead of always guessing "pending-reveal".
                    const { data: resolved } = await supabase
                      .from("wset_notes")
                      .select("catalog_wine_id, unidentified_wine_id")
                      .eq("id", savedId)
                      .maybeSingle();
                    catalogWineId = resolved?.catalog_wine_id ?? null;
                    resolvedUnidentifiedWineId = resolved?.unidentified_wine_id ?? null;
                  }
                  const report = noteSavedReport({
                    savedId,
                    saved,
                    style: data.wine.style,
                    title: data.title,
                    catalogWineId,
                    unidentifiedWineId: resolvedUnidentifiedWineId,
                  });
                  onSaved?.({ savedId, summary: report.summary });
                  // The provider-level step: "Note saved" takes this modal's
                  // place as it closes, unless it is an edit or was dismissed.
                  reportNoteSaved?.(report);
                }
                onClose();
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
