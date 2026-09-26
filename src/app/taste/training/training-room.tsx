"use client";

// The training room (training-room spec §3): one client component with the
// landing, a session and the result (§3.5). It owns every form value as
// React state — the note the WSET sheet reports through `onChange`, the
// Bubbles/Fortified facts, the pick and the vintage — and writes the draft to
// this device on every change (D13, src/lib/training/draft.ts). The landing
// reads the draft back through useSyncExternalStore, so Continue survives a
// reload; a finish or Discard in another tab returns a session here to the
// landing (the `storage` event). Matching runs here, on the device, on every
// change (D6).
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAddWine } from "@/components/add-wine-context";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Button } from "@/components/ui/button";
import { WsetSheet } from "@/components/wset/wset-sheet";
import { TWO_TAP_WINDOW_MS, type TwoTapState } from "@/lib/console-copy";
import type { HistoryPage, TrainingAttemptDetail, TrainingTally } from "@/lib/training/action-types";
import { SAVE_REFUSED } from "@/lib/training/attempt-payload";
import { TRAINING_COPY, clockTime, continueLine, sheetTitle, tallyLine } from "@/lib/training/copy";
import { clearDraft, draftClearedBy, newSessionKey, readDraft, writeDraft } from "@/lib/training/draft";
import { rankCandidates, snapshotRanking } from "@/lib/training/match";
import { anotherGlassPlan } from "@/lib/training/result-math";
import type {
  AromaLexicon,
  MatchExtras,
  RankingSnapshot,
  TrainingCandidate,
  TrainingDraft,
  VintageGuess,
} from "@/lib/training/types";
import { aromasToPayload, emptyNoteState, noteToPayload } from "@/lib/wset/note-state";
import type { AromaTerm, WineColour, WineStyle, WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { finishTrainingSession, loadTrainingAttempt } from "./actions";
import { CandidatesPanel } from "./candidates-panel";
import { CandidatesSheet } from "./candidates-sheet";
import { CandidatesStrip } from "./candidates-strip";
import { HistoryList } from "./history-list";
import { ResultView } from "./result-view";
import { YourCall } from "./your-call";

const TAP = "min-h-11 md:pointer-fine:min-h-0";
const UNKNOWN_WINE: { colour: WineColour | null; style: WineStyle | null } = { colour: null, style: null };

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function scrollToCall() {
  document.getElementById("your-call")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

type View = "landing" | "session" | "result";

export function TrainingRoom({
  userId,
  candidates,
  terms,
  history,
  tally,
  coverage,
}: {
  userId: string;
  candidates: TrainingCandidate[];
  terms: AromaTerm[];
  history: HistoryPage;
  tally: TrainingTally;
  coverage: string;
}) {
  const router = useRouter();
  const { openAddWineSheet } = useAddWine();
  const [view, setView] = useState<View>("landing");
  const [session, setSession] = useState<TrainingDraft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const [result, setResult] = useState<TrainingAttemptDetail | null>(null);

  // The stored draft as a string, so the snapshot compares by value. The
  // times it shows ("started 20:14") are only ever rendered on the client:
  // the server snapshot is "no draft".
  const storedJson = useSyncExternalStore(
    subscribeStorage,
    () => {
      const draft = readDraft(userId);
      return draft ? JSON.stringify(draft) : null;
    },
    () => null,
  );
  const stored = useMemo<TrainingDraft | null>(
    () => (storedJson ? (JSON.parse(storedJson) as TrainingDraft) : null),
    [storedJson],
  );

  // Every change reaches the device draft (D13).
  useEffect(() => {
    if (session) writeDraft(session);
  }, [session]);

  // Another tab finished or discarded this session: back to the landing.
  useEffect(() => {
    if (view !== "session") return;
    const onStorage = (event: StorageEvent) => {
      if (draftClearedBy(event, userId)) {
        setSession(null);
        setSheetOpen(false);
        setView("landing");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [view, userId]);

  // Discard's two-tap window (console-copy's rule; the timeout disarms it).
  useEffect(() => {
    if (armedAt === null) return;
    const id = setTimeout(() => setArmedAt(null), TWO_TAP_WINDOW_MS);
    return () => clearTimeout(id);
  }, [armedAt]);
  const discardState: TwoTapState = armedAt === null ? "idle" : "armed";

  const lexicon = useMemo<AromaLexicon>(
    () => Object.fromEntries(terms.map((t) => [t.id, { term: t.term, group: t.groupName }])),
    [terms],
  );
  const note = session ? session.note : null;
  const extras = session ? session.extras : null;
  const ranked = useMemo(
    () => (note && extras ? rankCandidates(note, extras, candidates, lexicon) : []),
    [note, extras, candidates, lexicon],
  );

  // Functional updates: the sheet's onChange and a Bubbles/Fortified tap can
  // land in the same tick, and neither may overwrite the other.
  const patchSession = useCallback(
    (patch: Partial<Pick<TrainingDraft, "note" | "pickedArchetypeId" | "vintage">>) =>
      setSession((s) => (s ? { ...s, ...patch } : s)),
    [],
  );
  const patchExtras = useCallback(
    (patch: Partial<MatchExtras>) =>
      setSession((s) => (s ? { ...s, extras: { ...s.extras, ...patch } } : s)),
    [],
  );

  // After a finish or a Reveal now: the stored attempt as the result (§3.5); a
  // failed read falls back to the landing, where history shows the attempt.
  function showResult(detail: TrainingAttemptDetail | null) {
    setResult(detail);
    setView(detail ? "result" : "landing");
    window.scrollTo({ top: 0 });
    router.refresh();
  }

  function start() {
    setError(null);
    setArmedAt(null);
    setResult(null);
    setSession({
      userId,
      sessionKey: newSessionKey(),
      startedAt: new Date().toISOString(),
      note: emptyNoteState(),
      extras: { bubbles: null, fortified: null },
      pickedArchetypeId: null,
      vintage: null,
    });
    setView("session");
    window.scrollTo({ top: 0 });
  }

  function continueSession() {
    if (!stored) return;
    setError(null);
    setSession(stored);
    setView("session");
    window.scrollTo({ top: 0 });
  }

  function discard() {
    if (discardState !== "armed") {
      setArmedAt(Date.now());
      return;
    }
    clearDraft(userId);
    setArmedAt(null);
  }

  // ✕ returns to the landing and KEEPS the draft (spec §3.3).
  function leave() {
    setSheetOpen(false);
    setView("landing");
  }

  async function finish(draft: TrainingDraft, snapshot: RankingSnapshot, actualCatalogWineId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await finishTrainingSession({
        sessionKey: draft.sessionKey,
        startedAt: draft.startedAt,
        note: noteToPayload(draft.note, { catalogWineId: null, contextKind: "TRAINING", tastingWineId: null }),
        aromas: aromasToPayload(draft.note),
        pickedArchetypeId: draft.pickedArchetypeId,
        vintage: draft.vintage,
        actualCatalogWineId,
        snapshot,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      // Saved either way: a failed read shows the landing (showResult).
      const detail = await loadTrainingAttempt(res.attemptId).catch(() => null);
      clearDraft(userId);
      setSession(null);
      setSheetOpen(false);
      showResult(detail);
    } catch {
      setError(SAVE_REFUSED);
    } finally {
      setBusy(false);
    }
  }

  // The add-wine sheet's reveal variant hands the pick back here; the draft and
  // ranking are taken as they stand at the tap (the sheet is modal meanwhile).
  function reveal() {
    if (!session || busy) return;
    const draft = session;
    const snapshot = snapshotRanking(ranked);
    openAddWineSheet(
      { kind: "note", reveal: true },
      {
        onNotePick: (pick) => {
          void finish(draft, snapshot, pick.catalogWineId);
        },
      },
    );
  }

  function cantFindOut() {
    if (!session || busy) return;
    void finish(session, snapshotRanking(ranked), null);
  }

  // Another glass never overwrites a stored draft (result-math's
  // anotherGlassPlan): after a Reveal now, a session left with ✕ may still be
  // stored, and the landing's Continue / Discard decides what happens to it.
  function anotherGlass() {
    if (anotherGlassPlan(stored) === "start") {
      start();
      return;
    }
    setResult(null);
    setView("landing");
    window.scrollTo({ top: 0 });
  }

  if (view === "result" && result) {
    return (
      <ResultView
        detail={result}
        pool={candidates}
        onAnotherGlass={anotherGlass}
        onDone={() => {
          setResult(null);
          setView("landing");
        }}
      />
    );
  }

  if (view === "session" && session) {
    return (
      <>
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <WsetSheet
              key={session.sessionKey}
              wine={UNKNOWN_WINE}
              title={sheetTitle(clockTime(session.startedAt))}
              terms={terms}
              initial={session.note}
              onChange={(next: WsetNoteState) => patchSession({ note: next })}
              footerAction={{ label: TRAINING_COPY.footerAction, onClick: scrollToCall }}
              belowBar={<CandidatesStrip ranked={ranked} onOpen={() => setSheetOpen(true)} />}
              aside={null}
              onClose={leave}
              bubbles={{ value: session.extras.bubbles, onChange: (v) => patchExtras({ bubbles: v }) }}
              fortified={{ value: session.extras.fortified, onChange: (v) => patchExtras({ fortified: v }) }}
            />
            <YourCall
              ranked={ranked}
              pickedId={session.pickedArchetypeId}
              onPick={(id) => patchSession({ pickedArchetypeId: id })}
              vintage={session.vintage}
              onVintage={(v: VintageGuess) => patchSession({ vintage: v })}
              onReveal={reveal}
              onCantFindOut={cantFindOut}
              busy={busy}
              error={error}
            />
          </div>
          <aside className="sticky top-[72px] hidden self-start lg:block">
            <CandidatesPanel ranked={ranked} note={session.note} />
          </aside>
        </div>
        <CandidatesSheet open={sheetOpen} onOpenChange={setSheetOpen} ranked={ranked} note={session.note} />
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Eyebrow>{TRAINING_COPY.eyebrow}</Eyebrow>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{TRAINING_COPY.title}</h1>
        <p className="text-[14.5px] leading-relaxed">{TRAINING_COPY.promise}</p>
        <p className="text-[13px] text-muted-foreground">{coverage}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {stored ? (
          <>
            <Button className={cn(TAP, "px-4")} onClick={continueSession}>
              {continueLine(clockTime(stored.startedAt))}
            </Button>
            <Button variant="ghost" className={TAP} onClick={discard}>
              {discardState === "armed" ? TRAINING_COPY.discardArmed : TRAINING_COPY.discard}
            </Button>
          </>
        ) : candidates.length > 0 ? (
          <Button className={cn(TAP, "px-4")} onClick={start}>
            {TRAINING_COPY.start}
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="training-sessions" className="flex flex-col gap-3">
        <h2 id="training-sessions" className="font-heading text-[22px] font-semibold">
          {TRAINING_COPY.yourSessions}
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {history.rows.length === 0 ? TRAINING_COPY.noSessions : tallyLine(tally)}
        </p>
        <HistoryList key={history.rows[0]?.id ?? "empty"} initial={history} onRevealed={showResult} />
      </section>
    </div>
  );
}
