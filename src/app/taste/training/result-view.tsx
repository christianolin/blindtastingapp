"use client";

// The result (training-room spec §3.5): the real wine beside what you said,
// the seven-row verdict with ✓ / ✗ / —, "{n} of {m}", the hue line when the
// RPC cleared a colour call, and "Where your note pointed" — the top five of
// the frozen ranking with the real wine's style highlighted and where it
// stood. Without a reveal: "Not revealed — your note is kept…".
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Button } from "@/components/ui/button";
import { NoteModal } from "@/components/wset/note-modal";
import type { TrainingAttemptDetail } from "@/lib/training/action-types";
import {
  TRAINING_COPY,
  hueClearedLine,
  itWasLine,
  percentLabel,
  resultTotalLine,
  shortName,
  styleVerdictLine,
  youSaidLine,
} from "@/lib/training/copy";
import {
  pointedTopFive,
  styleVerdictContext,
  styleVerdictInput,
  verdictRows,
} from "@/lib/training/result-math";
import type { TrainingCandidate } from "@/lib/training/types";
import { cn } from "@/lib/utils";

const TAP = "min-h-11 md:pointer-fine:min-h-0";

export function ResultView({
  detail,
  pool,
  onAnotherGlass,
  onDone,
}: {
  detail: TrainingAttemptDetail;
  /** The room's archetypes: the real wine's own one names a cap's reason. */
  pool: readonly TrainingCandidate[];
  onAnotherGlass: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const { row, noteId, wineColour } = detail;
  const [noteOpen, setNoteOpen] = useState(false);
  const said = row.picked ? youSaidLine(row.picked.name, row.vintage) : TRAINING_COPY.noPick;

  if (row.actual === null) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <Eyebrow>{TRAINING_COPY.eyebrow}</Eyebrow>
        <h1 className="font-heading text-[26px] leading-tight font-semibold">{said}</h1>
        <p className="text-[14px] text-muted-foreground">{TRAINING_COPY.notRevealed}</p>
        <div className="flex flex-wrap gap-3">
          <Button className={cn(TAP, "px-4")} onClick={onAnotherGlass}>
            {TRAINING_COPY.anotherGlass}
          </Button>
          <Button variant="ghost" className={TAP} onClick={onDone}>
            {TRAINING_COPY.done}
          </Button>
        </div>
      </div>
    );
  }

  const actual = row.actual;
  const rows = verdictRows(row.points);
  const top = pointedTopFive(row.snapshot);
  const actualArchetypeId = row.actualArchetype?.id ?? null;
  const archetype = actualArchetypeId ? (pool.find((c) => c.id === actualArchetypeId) ?? null) : null;
  const verdictCtx = styleVerdictContext(row.noteColourHue, archetype, wineColour);
  const verdictLine = verdictCtx
    ? styleVerdictLine(styleVerdictInput(row.snapshot, actualArchetypeId), verdictCtx)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
      <Eyebrow>{TRAINING_COPY.eyebrow}</Eyebrow>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="rounded-[12px] border border-border bg-card p-4">
          <h1 className="font-heading text-[22px] leading-tight font-semibold">{itWasLine(actual.label)}</h1>
          {actual.lineage ? (
            <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{actual.lineage}</p>
          ) : null}
        </section>
        <section className="flex items-center rounded-[12px] border border-border bg-background p-4">
          <p className="text-[15px] font-semibold">{said}</p>
        </section>
      </div>

      <table className="w-full text-[14px]">
        <tbody>
          {rows.map((v) => (
            <tr key={v.category} className="border-b border-border-light last:border-b-0">
              <th scope="row" className="py-2 text-left font-normal text-muted-foreground">
                {v.label}
              </th>
              <td className="w-8 py-2 text-center font-semibold">{v.mark}</td>
              <td className="w-10 py-2 text-right font-semibold tabular-nums">{v.points ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {row.total !== null && row.possible !== null ? (
        <p className="font-heading text-[26px] leading-none font-semibold text-primary tabular-nums">
          {resultTotalLine(row.total, row.possible)}
        </p>
      ) : null}

      {row.hueCleared && row.noteColourHue && wineColour ? (
        <p className="text-[13px] text-muted-foreground">{hueClearedLine(row.noteColourHue, wineColour)}</p>
      ) : null}

      <section aria-labelledby="training-pointed" className="flex flex-col gap-2">
        <h2 id="training-pointed" className="font-heading text-[19px] font-semibold">
          {TRAINING_COPY.wherePointed}
        </h2>
        <ol className="flex flex-col">
          {top.map((e) => (
            <li
              key={e.archetypeId}
              className={cn(
                "flex items-center gap-3 rounded-[8px] px-2 py-1.5 text-[13.5px]",
                e.archetypeId === actualArchetypeId && "bg-gold/15 font-semibold",
              )}
            >
              <span className="w-6 text-muted-foreground tabular-nums">{e.rank}</span>
              <span className="min-w-0 flex-1 truncate">{shortName(e.name)}</span>
              {e.closeness !== null ? <span className="tabular-nums">{percentLabel(e.closeness)}</span> : null}
            </li>
          ))}
        </ol>
        {verdictLine ? <p className="text-[13px] text-muted-foreground">{verdictLine}</p> : null}
      </section>

      <div className="flex flex-wrap gap-3">
        <Button className={cn(TAP, "px-4")} onClick={onAnotherGlass}>
          {TRAINING_COPY.anotherGlass}
        </Button>
        <Button variant="outline" className={TAP} onClick={() => setNoteOpen(true)}>
          {TRAINING_COPY.seeNote}
        </Button>
        <Button variant="ghost" className={TAP} onClick={onDone}>
          {TRAINING_COPY.done}
        </Button>
      </div>

      {noteOpen ? (
        <NoteModal
          noteId={noteId}
          wineId={actual.catalogWineId}
          onClose={() => {
            setNoteOpen(false);
            // An edit, or a delete (which takes its attempt with it), reaches the
            // landing's history and the tally.
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
