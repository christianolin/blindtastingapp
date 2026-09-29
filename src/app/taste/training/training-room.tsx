"use client";

// The training room (training-room spec §3): one client component with the
// landing, a session and the result (§3.5). It owns every form value as
// React state — the note the WSET sheet reports through `onChange`, the
// Bubbles/Fortified facts, the pick and the vintage — and writes the draft to
// this device on every change (D13, src/lib/training/draft.ts). The landing
// reads the draft back through useSyncExternalStore, so Continue survives a
// reload; a finish or Discard in another tab returns a session here to the
// landing (the `storage` event). Matching runs here, on the device, on every
// change (D6). Every switch between the three starts at the top of the app
// shell's content column, the page's scroll container (the window never
// scrolls in this app), with keyboard focus on the new view's heading.
//
// The candidates' List | Map choice (training-room-map spec RM19, RM22) is
// state HERE, not in the panel or the sheet: it survives the phone sheet
// closing and reopening and a new session started without a reload, resets
// with the page, and is never written to browser storage. With
// NEXT_PUBLIC_TRAINING_MAP=0 at build, no tablist renders and the room is R1.
// Pointing at or focusing the Map tab warms the map's code and, from it, the
// basemap style (RM24), by dynamic import, so neither enters this first load.
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAddWine } from "@/components/add-wine-context";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Button } from "@/components/ui/button";
import { WsetSheet } from "@/components/wset/wset-sheet";
import { TWO_TAP_WINDOW_MS, type TwoTapState } from "@/lib/console-copy";
import { scrollContainerToTop } from "@/lib/scroll-container";
import type { HistoryPage, TrainingAttemptDetail, TrainingTally } from "@/lib/training/action-types";
import { SAVE_REFUSED } from "@/lib/training/attempt-payload";
import {
  NO_CALL,
  callPayload,
  chooseDeeper,
  chooseGrape,
  chooseRegion,
  normalizeCall,
} from "@/lib/training/call";
import { TRAINING_COPY, clockTime, continueLine, sessionsLine, sheetTitle } from "@/lib/training/copy";
import {
  clearDraft,
  draftClearedBy,
  newSessionKey,
  readDraft,
  withKnownTerms,
  writeDraft,
} from "@/lib/training/draft";
import { groupRanking } from "@/lib/training/groups";
import { rankCandidates, snapshotRanking } from "@/lib/training/match";
import { anotherGlassPlan } from "@/lib/training/result-math";
import type {
  AromaLexicon,
  CallPick,
  MatchExtras,
  Named,
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
import { ROOM_MAP_START, TRAINING_MAP_ENABLED, roomMapReducer, type RoomMap } from "./room-map-state";
import { loadTrainingMap } from "./training-map-loader";
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
  grapes,
  terms,
  history,
  tally,
  coverage,
}: {
  userId: string;
  candidates: TrainingCandidate[];
  /** Every grape, for Your call's "Other grape…" (region-guess addendum R11). */
  grapes: Named[];
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
  // One wrapper stays mounted across landing, session and result, so there is
  // always an element to walk up from to the scroll container.
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLButtonElement>(null);
  const toTop = () => scrollContainerToTop(rootRef.current);
  // Each view's heading (tabIndex -1), where focus lands when it opens: the
  // landing's and the result's h1, and the session sheet's title.
  const landingHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const sessionTitleRef = useRef<HTMLParagraphElement>(null);
  // The view focus last moved into. Starts at the first view, so the first
  // mount (twice under StrictMode) leaves focus where the page put it.
  const enteredView = useRef<View>(view);

  // Every switch between the three views, from the top of the content column
  // (the effect below then moves focus into the new view).
  function enterView(next: View) {
    setView(next);
    toTop();
  }

  // A new view takes keyboard focus on its heading, without scrolling: the
  // column is already back at its top.
  useEffect(() => {
    if (enteredView.current === view) return;
    enteredView.current = view;
    const heading =
      view === "landing"
        ? landingHeadingRef.current
        : view === "result"
          ? resultHeadingRef.current
          : sessionTitleRef.current;
    heading?.focus({ preventScroll: true });
  }, [view]);

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
        scrollContainerToTop(rootRef.current);
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
  // The same ranking by region (region-guess addendum R1-R3).
  const groups = useMemo(() => groupRanking(ranked), [ranked]);

  // List | Map (training-room-map spec RM19, RM22, RM24).
  const [mapState, mapDispatch] = useReducer(roomMapReducer, ROOM_MAP_START);
  // One import warms both: the map's code, then, from it, the basemap style
  // (a second loader here cost the first load more than the style's head
  // start was worth, spec §12). Idempotent, so every pointer-enter may call
  // it: the bundler caches the import and loadBasemapStyle shares one request
  // per theme. A rejected import stays rejected: opening Map then says to
  // reload; a failed style fetch is the map's own to handle.
  const warmMap = () => {
    loadTrainingMap().then(
      (m) => m.warmBasemap().catch(() => {}),
      () => mapDispatch({ type: "chunkFailed" }),
    );
  };
  const roomMap: RoomMap | null = TRAINING_MAP_ENABLED
    ? { state: mapState, dispatch: mapDispatch, warm: warmMap }
    : null;

  // Functional updates: the sheet's onChange and a Bubbles/Fortified tap can
  // land in the same tick, and neither may overwrite the other.
  const patchSession = useCallback(
    (patch: Partial<Pick<TrainingDraft, "note" | "vintage">>) => setSession((s) => (s ? { ...s, ...patch } : s)),
    [],
  );
  // Your call's taps, through call.ts's rules (a new region clears the deeper
  // choice and the grape; a grape needs a region), functional like the rest.
  const patchCall = useCallback(
    (next: (pick: CallPick) => CallPick) => setSession((s) => (s ? { ...s, ...next(s) } : s)),
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
    enterView(detail ? "result" : "landing");
    router.refresh();
  }

  // The result's own ways back to the landing: Done, and a note deleted from
  // "See the note" (its attempt goes with it — the refresh drops the row).
  function backToLanding(refresh: boolean) {
    setResult(null);
    enterView("landing");
    if (refresh) router.refresh();
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
      ...NO_CALL,
      vintage: null,
    });
    enterView("session");
  }

  // A draft from before the region step names a typical wine but no region:
  // normalizeCall gives the wine its region (and drops a pick that left the pool,
  // or a grape merged away since the draft was saved), and withKnownTerms drops
  // an aroma term the lexicon has removed since (the finish would be refused).
  function continueSession() {
    if (!stored) return;
    setError(null);
    const known = withKnownTerms(stored, new Set(terms.map((t) => t.id)));
    setSession({ ...known, ...normalizeCall(known, candidates, grapes.map((g) => g.id)) });
    enterView("session");
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
    enterView("landing");
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
        // A typical wine alone, or the region with its optional grape (R7).
        ...callPayload(draft),
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
    backToLanding(false);
  }

  // Under "Your sessions": "No sessions yet", the tally, or — with rows but
  // nothing scored yet — no paragraph at all (an empty one still takes a gap).
  const tallyText = sessionsLine(history.rows.length > 0, tally);

  let body: ReactNode;
  if (view === "result" && result) {
    body = (
      <ResultView
        headingRef={resultHeadingRef}
        detail={result}
        pool={candidates}
        onAnotherGlass={anotherGlass}
        onDone={() => backToLanding(false)}
        onGone={() => backToLanding(true)}
      />
    );
  } else if (view === "session" && session) {
    body = (
      <>
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <WsetSheet
              key={session.sessionKey}
              wine={UNKNOWN_WINE}
              title={sheetTitle(clockTime(session.startedAt))}
              titleRef={sessionTitleRef}
              terms={terms}
              initial={session.note}
              onChange={(next: WsetNoteState) => patchSession({ note: next })}
              footerAction={{ label: TRAINING_COPY.footerAction, onClick: scrollToCall }}
              belowBar={
                <CandidatesStrip
                  ref={stripRef}
                  ranked={ranked}
                  open={sheetOpen}
                  onOpen={() => setSheetOpen(true)}
                />
              }
              aside={null}
              onClose={leave}
              bubbles={{ value: session.extras.bubbles, onChange: (v) => patchExtras({ bubbles: v }) }}
              fortified={{ value: session.extras.fortified, onChange: (v) => patchExtras({ fortified: v }) }}
            />
            <YourCall
              groups={groups}
              pick={session}
              grapes={grapes}
              onRegion={(id) => patchCall((p) => chooseRegion(p, id))}
              onDeeper={(id) => patchCall((p) => chooseDeeper(p, id))}
              onGrape={(id) => patchCall((p) => chooseGrape(p, id))}
              onNotListed={() => patchCall(() => NO_CALL)}
              vintage={session.vintage}
              onVintage={(v: VintageGuess) => patchSession({ vintage: v })}
              onReveal={reveal}
              onCantFindOut={cantFindOut}
              busy={busy}
              error={error}
            />
          </div>
          {/* Never taller than the window below its sticky top (16 px short of
              the foot), and it scrolls itself: the top region starts open
              (Bourgogne alone has 15 typical wines), and a sticky column
              taller than the window shows its foot — regions 2-5, Show all —
              only once the page reaches its end. training-room-layout.test.ts
              pins it. */}
          <aside className="sticky top-[72px] hidden max-h-[calc(100dvh-88px)] self-start overflow-y-auto lg:block">
            <CandidatesPanel groups={groups} ranked={ranked} note={session.note} roomMap={roomMap} />
          </aside>
        </div>
        <CandidatesSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          groups={groups}
          ranked={ranked}
          note={session.note}
          roomMap={roomMap}
          returnFocusRef={stripRef}
        />
      </>
    );
  } else {
    body = (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Eyebrow>{TRAINING_COPY.eyebrow}</Eyebrow>
          <h1
            ref={landingHeadingRef}
            tabIndex={-1}
            className="font-heading text-3xl font-semibold tracking-tight outline-none"
          >
            {TRAINING_COPY.title}
          </h1>
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
          {tallyText ? <p className="text-[13px] text-muted-foreground">{tallyText}</p> : null}
          <HistoryList key={history.rows[0]?.id ?? "empty"} initial={history} onRevealed={showResult} />
        </section>
      </div>
    );
  }

  // display: contents — the wrapper adds no box, so each view lays out in the
  // page exactly as it did as the component's root.
  return (
    <div ref={rootRef} className="contents">
      {body}
    </div>
  );
}
