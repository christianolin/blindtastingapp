"use client";

import { useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import type { AromaTerm } from "@/lib/wset/types";
import { makeT } from "@/lib/wset/i18n";
import { useWsetLang } from "@/lib/wset/wset-lang";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ArchetypeSheet } from "@/components/wset/archetype-sheet";
import {
  DiscardConfirm,
  SHEET_DIALOG_CLASS,
  SheetBar,
  SheetBody,
  SheetFooter,
  SheetFooterProgress,
  SheetFrame,
  SheetHeaderRow,
  SheetSaveButton,
  SheetStepButton,
  SheetTabs,
  useSheetSteps,
} from "@/components/wset/sheet-shell";
import { updateArchetype } from "./actions";
import { EDITOR_COPY } from "./editor-copy";
import {
  EDITOR_SECTIONS,
  applyDraft,
  archetypeProgress,
  draftFromProfile,
  draftToInput,
  draftView,
  editorLadders,
  isDirty,
  type DraftAction,
  type EditorSection,
} from "./profile-draft";
import { validateProfile, type ArchetypeProfile, type EditorReferences } from "./profile-rules";
import { WineSection } from "./wine-section";

type SaveState = "idle" | "saving" | "saved" | "error";

// A typical wine's profile in the Taste & Rate note's shell (plan
// 2026-09-26-archetype-editor-sheet): the same popup (full-screen on phones, a
// dialog on a laptop), sticky bar, one section on screen at a time, "Next: … →"
// and Save in the footer, Close asking before it drops unsaved changes. The
// Wine tab is this editor's own; the four WSET tabs are the shared
// ArchetypeSheet in its editable mode, so an archetype looks the same here as
// in the Library, on the map and in the training room.
export function ArchetypeEditor({
  archetype,
  terms,
  references,
  onClose,
}: {
  archetype: ArchetypeProfile;
  terms: AromaTerm[];
  references: EditorReferences;
  onClose: () => void;
}) {
  const router = useRouter();
  const { lang } = useWsetLang();
  const t = makeT(lang);
  const [draft, dispatch] = useReducer(applyDraft, archetype, draftFromProfile);
  // What the profile looked like when last saved (or opened): Close asks
  // before discarding only while the draft differs from it.
  const [baseline, setBaseline] = useState(() => draftFromProfile(archetype));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { active, goTo, step, scrollRef } = useSheetSteps(EDITOR_SECTIONS, true);

  const dirty = isDirty(draft, baseline);
  const progress = archetypeProgress(draft);
  const title = draft.name.trim() || EDITOR_COPY.untitled;

  // Every change clears a save error: the message was about the draft before it.
  const change = (action: DraftAction) => {
    dispatch(action);
    if (saveState === "error") setSaveState("idle");
    if (error !== null) setError(null);
  };

  // Close, Escape and the backdrop: an open confirm closes first; then a dirty
  // draft asks, a clean one exits.
  const requestClose = () => {
    if (confirmDiscard) {
      setConfirmDiscard(false);
      return;
    }
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  async function save() {
    const input = draftToInput(draft);
    const invalid = validateProfile(input);
    if (invalid) {
      setSaveState("error");
      setError(invalid);
      return;
    }
    const saving = draft;
    setError(null);
    setSaveState("saving");
    let result: { error: string } | { ok: true };
    try {
      result = await updateArchetype(archetype.id, input);
    } catch {
      result = { error: EDITOR_COPY.saveFailed };
    }
    if ("error" in result) {
      setSaveState("error");
      setError(result.error);
      return;
    }
    // Clean again: Close exits without asking, unless the curator kept
    // editing while the save was on its way.
    setBaseline(saving);
    setSaveState("saved");
    setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2200);
    router.refresh();
  }

  const saveLabel =
    saveState === "saving"
      ? EDITOR_COPY.saving
      : saveState === "saved"
        ? EDITOR_COPY.saved
        : saveState === "error"
          ? EDITOR_COPY.retry
          : EDITOR_COPY.save;

  // A tab's name, as the tabs and the footer step print it.
  const tabLabel = (id: EditorSection) =>
    id === "wine" ? EDITOR_COPY.wineTab : id === "conclusions" ? t("conclusion_short") : t(id);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <DialogContent showCloseButton={false} className={SHEET_DIALOG_CLASS}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <SheetFrame embedded>
          <SheetBar embedded>
            <SheetHeaderRow
              eyebrow={EDITOR_COPY.eyebrow}
              title={title}
              onClose={requestClose}
              progress={{ done: progress.done, total: progress.total }}
            />
            <SheetTabs
              tabs={EDITOR_SECTIONS.map((id) => ({
                id,
                label: tabLabel(id),
                done: progress.sections[id][0],
                total: progress.sections[id][1],
              }))}
              active={active}
              onSelect={(id) => goTo(id as EditorSection)}
            />
          </SheetBar>

          <SheetBody embedded scrollRef={scrollRef} column={null}>
            <WineSection hidden={active !== "wine"} draft={draft} onChange={change} references={references} />
            <ArchetypeSheet
              a={draftView(draft)}
              edit={{
                section: active === "wine" ? null : active,
                ladders: editorLadders(draft.colour, draft.style),
                terms,
                nose: draft.nose,
                palate: draft.palate,
                onRange: (key, range) => change({ type: "range", key, range }),
                onQuality: (range) => change({ type: "quality", range }),
                onAromas: (kind, ids) => change({ type: "aromas", kind, ids }),
                onSignature: (kind, termId) => change({ type: "signature", kind, termId }),
                signatureHint: EDITOR_COPY.signatureHint,
                signatureLabel: EDITOR_COPY.signatureLabel,
              }}
            />
          </SheetBody>

          <SheetFooter
            embedded
            progress={
              <SheetFooterProgress
                done={progress.done}
                caption={EDITOR_COPY.ofTotalSet(progress.total)}
                note={EDITOR_COPY.footerNote}
              />
            }
            notice={
              error ? (
                <p role="alert" className="text-[12.5px] leading-snug text-destructive">
                  {error}
                </p>
              ) : null
            }
          >
            {step ? (
              <SheetStepButton section={tabLabel(step.id)} forward={step.forward} onClick={() => goTo(step.id)} />
            ) : null}
            <SheetSaveButton
              label={saveLabel}
              onClick={save}
              disabled={saveState === "saving"}
              saved={saveState === "saved"}
            />
          </SheetFooter>

          {confirmDiscard ? (
            <DiscardConfirm
              title={EDITOR_COPY.discardTitle}
              body={EDITOR_COPY.discardBody}
              keepLabel={EDITOR_COPY.keepEditing}
              discardLabel={EDITOR_COPY.discard}
              onKeep={() => setConfirmDiscard(false)}
              onDiscard={() => {
                setConfirmDiscard(false);
                onClose();
              }}
            />
          ) : null}
        </SheetFrame>
      </DialogContent>
    </Dialog>
  );
}
