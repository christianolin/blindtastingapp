"use client";

// A candidate's full profile for the room: the map's read-only archetype sheet
// with the taster's own answers drawn on its ranges (spec §3.3, §7.2), and the
// designations its label would carry (D10). `idPrefix` keeps its section ids
// apart from the WSET sheet on the same page.
import { ArchetypeSheet } from "@/components/wset/archetype-sheet";
import { candidateToArchetypeView } from "@/lib/training/archetype-view";
import type { TrainingCandidate } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";

export function ArchetypeDetail({
  candidate,
  note,
}: {
  candidate: TrainingCandidate;
  note: WsetNoteState;
}) {
  return (
    <div className="flex flex-col gap-2">
      {candidate.designations.length > 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {candidate.designations.map((d) => d.name).join(" · ")}
        </p>
      ) : null}
      <ArchetypeSheet
        a={candidateToArchetypeView(candidate)}
        answers={note}
        idPrefix={`archetype-${candidate.id}-`}
      />
    </div>
  );
}
