"use client";

import { useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { useMediaQuery } from "@/components/add-wine/use-camera";
import type { AsyncRevealPolicy, TimingMode } from "@/lib/supabase/database.types";
import {
  applyAssignment,
  clearAssignment,
  glassRowState,
  matchedCount,
  poolFor,
  type AssignOutcome,
  type Board,
} from "@/lib/semi-blind-board";
import type { CandidateCard } from "@/lib/semi-blind-candidates";
import {
  LOCK_ONLY_THIS,
  MATCH_TITLE,
  NOT_POURED,
  POOL_SWAP_NOTE,
  REVEALED_WINE_REFUSAL,
  THE_BOTTLES,
  THE_GLASSES,
  YOUR_BOTTLE,
  boardEyebrow,
  candidateLabel,
  chooseFirst,
  clearGlassLabel,
  emptyRowText,
  footerLine,
  lockGlassLabel,
  lockedHolderLabel,
  matchedPill,
  pendingLine,
  poolHelperLines,
  revealedRowText,
  stillUnassigned,
  unassignedHeading,
} from "@/lib/semi-blind-copy";
import { cn } from "@/lib/utils";
import { assignMatch, clearMatch, lockGuess, unlockGuess } from "./actions";
import { FieldPicker } from "./field-picker";
import { LOCKED_EDIT_REFUSAL } from "./ladder-copy";
import { lockButtonLabel, lockConfirm } from "./lock-copy";
import type { PickerGroup } from "./ladder-types";

/**
 * The semi-blind matching board (SB2 phone, SB3 laptop; spec §10.3 item 2).
 * Persistent for the whole flight — every glass renders here, whatever its
 * state (open, locked, not-poured, revealed, the viewer's own bottle) — not a
 * batch that shrinks as glasses resolve. Assign/clear autosave optimistically
 * through `semi-blind-board.ts`'s client twin of the RPCs; lock/unlock are
 * per glass, never a whole-flight submit.
 *
 * Interactions: tap/click a glass opens the field picker over the pool
 * (phone: sheet; laptop: popover — the same presentation switch
 * `guess-ladder.tsx` uses, and the keyboard-reachable path). Laptop also
 * supports the quicker click-a-bottle-then-click-a-glass and drag-the-grip
 * flows; the picker stays the keyboard fallback for both.
 */
export function MatchBoard({
  tastingId,
  tastingName,
  hostName,
  cards,
  board: initialBoard,
  pouredThroughIndex,
  currentGlassWineId,
  timingMode,
  asyncRevealPolicy,
  pending,
}: {
  tastingId: string;
  tastingName: string;
  hostName: string;
  cards: CandidateCard[];
  board: Board;
  /** `pouredThrough()` (pour-pointer.ts) in LIVE guided pacing; null when
   *  every glass is open (ASYNC or free flow). */
  pouredThroughIndex: number | null;
  /** The pointer's glass in LIVE guided pacing; null otherwise — the board
   *  falls back to the first open, unlocked, unassigned glass itself. */
  currentGlassWineId: string | null;
  timingMode: TimingMode;
  asyncRevealPolicy: AsyncRevealPolicy;
  /** Glasses with no answer key yet (host, or anyone once nothing is
   *  pending — get_semi_blind_candidates's own rule). */
  pending: number;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const [board, setBoard] = useState(initialBoard);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  // Re-sync to a fresh poll's board unless a local action is still in
  // flight (tracked by `busy`, already state) — the same "adjust state when
  // a prop changes" pattern field-picker.tsx's session key uses (state
  // compared during render, never a ref), scoped so an in-flight optimistic
  // change is never clobbered by a poll that raced it.
  const [seenBoard, setSeenBoard] = useState(initialBoard);
  if (seenBoard !== initialBoard) {
    setSeenBoard(initialBoard);
    if (!Object.values(busy).some(Boolean)) setBoard(initialBoard);
  }

  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ open: boolean; glassId: string | null }>({
    open: false,
    glassId: null,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const pickerAnchorRef = useRef<HTMLElement | null>(null);

  const cardByKey = new Map(cards.map((c) => [c.key, c]));
  const { assigned, total } = matchedCount(board);
  const pool = poolFor(cards, board);
  // Every card the viewer may still place somewhere: unlike `pool` (still
  // unassigned only), this keeps a card another open glass already holds —
  // review round 2 issue 1: assigning a wine held by another open, unlocked
  // glass swaps the two (ledger B9), and that swap needs the held-elsewhere
  // card to actually be offered, both in the picker and on the laptop's
  // bottle list. Only truly unplaceable keys drop out: revealed, the
  // viewer's own bottles, and ones the viewer has proven (ASYNC IMMEDIATE) —
  // exactly `applyAssignment`'s own "not-in-pool"/"revealed" refusals.
  const gone = new Set<string>([
    ...Object.values(board.revealedKeyByGlass),
    ...board.ownBottleKeys,
    ...Object.values(board.knownKeyByGlass),
  ]);
  const placeableCards = cards.filter((c) => !gone.has(c.key));

  function glassNumberOf(wineId: string): number | null {
    return board.glasses.find((g) => g.wineId === wineId)?.glass ?? null;
  }

  // The glass this row/footer treats as "current": the pointer's glass in
  // LIVE guided pacing (trusted from the server — it alone knows about a
  // wrapped skip), otherwise the first still-open, unassigned glass, read
  // fresh off the live board so it moves on as the viewer assigns and locks.
  const currentGlassId =
    pouredThroughIndex != null
      ? currentGlassWineId
      : (board.glasses.find((g) => {
          const state = glassRowState(board, g.wineId, null);
          return state === "open-empty" || state === "open-assigned";
        })?.wineId ?? null);

  function localAssignRefusal(outcome: Extract<AssignOutcome, { ok: false }>): string {
    switch (outcome.reason) {
      case "locked-holder":
        return lockedHolderLabel(outcome.holderGlass);
      case "revealed":
        return REVEALED_WINE_REFUSAL;
      case "not-in-pool":
        // Mirrors matchRefusalSentence's default sentence for the RPC's
        // "that wine is not in your pool" message (own bottle or proven).
        return "That wine is not in your pool.";
      case "glass-locked":
        return LOCKED_EDIT_REFUSAL;
      case "glass-closed":
        // Mirrors matchRefusalSentence's default sentence for "matching is closed".
        return "Matching is closed.";
    }
  }

  function setError(glassId: string, message: string) {
    setErrors((e) => ({ ...e, [glassId]: message }));
  }

  async function doAssign(glassId: string, key: string) {
    const prev = board;
    const outcome = applyAssignment(prev, glassId, key);
    if (!outcome.ok) {
      setError(glassId, localAssignRefusal(outcome));
      return;
    }
    setError(glassId, "");
    setBoard(outcome.board);
    setBusy((b) => ({ ...b, [glassId]: true }));
    try {
      const result = await assignMatch(tastingId, glassId, key);
      if ("error" in result) {
        setBoard(prev);
        setError(glassId, result.error);
      }
    } finally {
      setBusy((b) => ({ ...b, [glassId]: false }));
    }
  }

  async function doClear(glassId: string) {
    const prev = board;
    const next = clearAssignment(prev, glassId);
    if (next === prev) return;
    setError(glassId, "");
    setBoard(next);
    setBusy((b) => ({ ...b, [glassId]: true }));
    try {
      const result = await clearMatch(tastingId, glassId);
      if ("error" in result) {
        setBoard(prev);
        setError(glassId, result.error);
      }
    } finally {
      setBusy((b) => ({ ...b, [glassId]: false }));
    }
  }

  async function doLock(glassId: string) {
    const glassNumber = glassNumberOf(glassId) ?? 0;
    const row = board.mine[glassId];
    if (row?.key == null) {
      setError(glassId, chooseFirst(glassNumber));
      return;
    }
    const submitLabel = lockButtonLabel({ timingMode, asyncRevealPolicy, match: false, glass: glassNumber });
    if (submitLabel !== null && !window.confirm(lockConfirm({ glass: glassNumber, blank: false }))) {
      return;
    }
    setError(glassId, "");
    setBusy((b) => ({ ...b, [glassId]: true }));
    try {
      const result = await lockGuess(tastingId, glassId);
      if ("error" in result) {
        setError(glassId, result.error);
        return;
      }
      setBoard((b) => ({ ...b, mine: { ...b.mine, [glassId]: { ...b.mine[glassId], locked: true } } }));
    } finally {
      setBusy((b) => ({ ...b, [glassId]: false }));
    }
  }

  async function doUnlock(glassId: string) {
    setError(glassId, "");
    setBusy((b) => ({ ...b, [glassId]: true }));
    try {
      const result = await unlockGuess(tastingId, glassId);
      if ("error" in result) {
        setError(glassId, result.error);
        return;
      }
      setBoard((b) => ({ ...b, mine: { ...b.mine, [glassId]: { ...b.mine[glassId], locked: false } } }));
    } finally {
      setBusy((b) => ({ ...b, [glassId]: false }));
    }
  }

  // ---- picker (phone sheet / laptop popover, keyboard-reachable both ways)
  function nextOpenGlass(afterId: string): string | null {
    const index = board.glasses.findIndex((g) => g.wineId === afterId);
    for (let i = index + 1; i < board.glasses.length; i++) {
      const candidate = board.glasses[i];
      if (glassRowState(board, candidate.wineId, pouredThroughIndex) === "open-empty") {
        return candidate.wineId;
      }
    }
    return null;
  }

  function openPicker(glassId: string) {
    pickerAnchorRef.current = rowRefs.current.get(glassId) ?? null;
    setPicker({ open: true, glassId });
    // Focus synchronously, in the same tap that opens it — the combobox rule.
    inputRef.current?.focus();
  }

  function closePicker() {
    setPicker((p) => ({ ...p, open: false }));
    if (picker.glassId) rowRefs.current.get(picker.glassId)?.focus?.({ preventScroll: true });
  }

  function advanceFrom(glassId: string) {
    const next = nextOpenGlass(glassId);
    if (next) openPicker(next);
    else closePicker();
  }

  const pickerGlassId = picker.glassId;
  const myCurrentKey = pickerGlassId ? (board.mine[pickerGlassId]?.key ?? null) : null;
  const pickerGlassNumber = pickerGlassId ? glassNumberOf(pickerGlassId) : null;
  // The picker offers every placeable card, not just the unassigned pool —
  // one held by another open glass is sub-labelled with where it currently
  // sits (its own glass's holder is unlabelled: it's already this row's
  // selection, not "elsewhere"), and picking it goes through `doAssign` /
  // `applyAssignment` exactly as an unassigned pick does — swap, or the
  // "Glass N · locked" refusal, decided there.
  const pickerGroups: PickerGroup[] = [
    {
      options: placeableCards.map((c) => {
        const holder = holderOf(board, c.key);
        const holderLabel =
          holder && holder.glass !== pickerGlassNumber
            ? holder.locked
              ? lockedHolderLabel(holder.glass)
              : `Glass ${holder.glass}`
            : undefined;
        return {
          id: c.key,
          name: candidateLabel(c),
          sub: holderLabel ?? ([c.appellation, c.grape].filter(Boolean).join(" · ") || undefined),
        };
      }),
    },
  ];
  const nextGlassId = pickerGlassId ? nextOpenGlass(pickerGlassId) : null;
  const nextLabel =
    nextGlassId != null ? `Next: glass ${glassNumberOf(nextGlassId)} →` : "Back to the glasses";

  const eyebrowText = boardEyebrow({
    phone: !isDesktop,
    host: hostName,
    pouredGlass: pouredThroughIndex != null ? pouredThroughIndex + 1 : null,
  });
  const pendingText = pendingLine(pending);

  return (
    <div className="flex flex-col bg-background">
      {/* Header */}
      <div className="flex flex-col gap-[3px] border-b border-border px-4 pt-2 pb-[11px] md:px-6 md:pt-3">
        <div className="flex items-center gap-[11px]">
          <span className="flex min-w-0 flex-1 flex-col">
            <Eyebrow size="md" className="truncate">
              {eyebrowText}
            </Eyebrow>
            <span className="font-heading text-[19px] font-semibold md:text-[22px]">
              {isDesktop ? tastingName : MATCH_TITLE}
            </span>
            {isDesktop && pouredThroughIndex != null ? (
              <span className="text-[11.5px] text-muted-foreground">
                Glass {pouredThroughIndex + 1} poured
              </span>
            ) : null}
          </span>
          <span className="shrink-0 rounded-full border border-gold bg-gold/15 px-[10px] py-[5px] text-[11px] font-bold text-primary lining-nums tabular-nums">
            {matchedPill(assigned, total)}
          </span>
        </div>
        {pendingText ? <p className="text-[11px] font-medium text-gold-dark">{pendingText}</p> : null}
      </div>

      {/* Body: one column on phone (glasses, then the pool as context);
          two columns from md (glasses left, bottles right, both live). */}
      <div className="flex flex-col gap-4 px-4 pt-3 md:flex-row md:items-start md:gap-6 md:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {isDesktop ? <Eyebrow size="sm">{THE_GLASSES}</Eyebrow> : null}
          <div className="flex flex-col gap-2">
            {board.glasses.map((glass) => {
              const state = glassRowState(board, glass.wineId, pouredThroughIndex);
              const mineRow = board.mine[glass.wineId];
              // ASYNC IMMEDIATE: the viewer's own lock has already scored this
              // glass (score_own_guess) even though nobody else has revealed
              // it — glassRowState still reports "locked" (it has no case of
              // its own for a personally-proven glass), so this component
              // tells the two apart itself rather than editing that shared,
              // out-of-OWNS helper.
              const provenNotRevealed = state === "locked" && Boolean(mineRow?.scored);
              // Once a glass is known — globally revealed, or personally
              // proven — the row names the glass's own true identity, never
              // the viewer's guess (which may have been wrong): revealed
              // wines come from `revealedKeyByGlass`, a proven-but-hidden one
              // from `knownKeyByGlass` (get_semi_blind_board's own "the
              // viewer has legitimately learned it" key for exactly this
              // case).
              const identityKey =
                state === "revealed"
                  ? (board.revealedKeyByGlass[glass.wineId] ?? null)
                  : provenNotRevealed
                    ? (board.knownKeyByGlass[glass.wineId] ?? mineRow?.key ?? null)
                    : (mineRow?.key ?? null);
              const hit =
                (state === "revealed" || provenNotRevealed) && mineRow
                  ? mineRow.totalPoints === 1
                  : null;
              return (
                <GlassRow
                  key={glass.wineId}
                  glassNumber={glass.glass}
                  state={state}
                  card={identityKey ? (cardByKey.get(identityKey) ?? null) : null}
                  provenNotRevealed={provenNotRevealed}
                  hit={hit}
                  isDesktop={isDesktop}
                  error={errors[glass.wineId]}
                  busy={Boolean(busy[glass.wineId])}
                  isDragOver={dragOverId === glass.wineId}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(glass.wineId, el);
                    else rowRefs.current.delete(glass.wineId);
                  }}
                  onOpenPicker={() => openPicker(glass.wineId)}
                  onClear={() => doClear(glass.wineId)}
                  onLock={() => doLock(glass.wineId)}
                  onUnlock={() => doUnlock(glass.wineId)}
                  onPlaceArmed={
                    armedKey
                      ? () => {
                          const key = armedKey;
                          setArmedKey(null);
                          void doAssign(glass.wineId, key);
                        }
                      : undefined
                  }
                  onDragOverGlass={(over) => setDragOverId(over ? glass.wineId : null)}
                  onDropKey={(key) => void doAssign(glass.wineId, key)}
                />
              );
            })}
          </div>
        </div>

        {/* The pool: phone shows only what's left to place (context, not
            interactive — placing happens through the picker). Laptop shows
            every bottle, live, draggable and click-to-arm. */}
        <div className="flex shrink-0 flex-col gap-2 md:w-[300px]">
          {isDesktop ? (
            <>
              <Eyebrow size="sm">{THE_BOTTLES}</Eyebrow>
              <p className="text-[11.5px] text-muted-foreground">{stillUnassigned(pool.length)}</p>
            </>
          ) : (
            <Eyebrow size="sm">{unassignedHeading(pool.length)}</Eyebrow>
          )}
          <div className="flex flex-col gap-2">
            {(isDesktop ? cards : pool).map((card) => (
              <PoolCard
                key={card.key}
                card={card}
                isDesktop={isDesktop}
                holder={holderOf(board, card.key)}
                ownBottle={board.ownBottleKeys.includes(card.key)}
                armed={armedKey === card.key}
                assignable={!gone.has(card.key)}
                onArm={() => setArmedKey((k) => (k === card.key ? null : gone.has(card.key) ? k : card.key))}
              />
            ))}
          </div>
          {!isDesktop ? (
            <div className="flex flex-col gap-1 pt-1">
              {poolHelperLines(pool).map((line) => (
                <p key={line} className="px-1 text-[11px] text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="px-1 text-[11px] text-muted-foreground">{POOL_SWAP_NOTE}</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex flex-col gap-2 border-t border-border bg-card px-4 pt-[11px] pb-[max(22px,env(safe-area-inset-bottom))] md:px-6 md:pb-4">
        <p className="text-center text-[11.5px] text-muted-foreground md:text-left">
          {footerLine(hostName, { phone: !isDesktop })}
        </p>
        {isDesktop && currentGlassId ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => doClear(currentGlassId)}
              disabled={board.mine[currentGlassId]?.key == null || Boolean(busy[currentGlassId])}
              className="flex min-h-9 items-center rounded-[10px] border border-border px-[14px] text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {clearGlassLabel(glassNumberOf(currentGlassId) ?? 0)}
            </button>
            <button
              type="button"
              onClick={() => doLock(currentGlassId)}
              disabled={Boolean(busy[currentGlassId])}
              className="flex min-h-9 items-center rounded-[10px] bg-primary px-[16px] text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {busy[currentGlassId] ? (
                <span className="flex items-center gap-2">
                  <WineGlassLoader size={14} /> …
                </span>
              ) : (
                (lockButtonLabel({
                  timingMode,
                  asyncRevealPolicy,
                  match: false,
                  glass: glassNumberOf(currentGlassId) ?? 0,
                }) ?? lockGlassLabel(glassNumberOf(currentGlassId) ?? 0))
              )}
            </button>
            <span className="text-[11px] text-muted-foreground">{LOCK_ONLY_THIS}</span>
          </div>
        ) : null}
      </div>

      <FieldPicker
        open={picker.open}
        field="country"
        points={1}
        title={pickerGlassNumber != null ? `Which wine is glass ${pickerGlassNumber}?` : "Which wine?"}
        groups={pickerGroups}
        value={myCurrentKey ?? ""}
        onPick={(id) => {
          if (id && pickerGlassId) void doAssign(pickerGlassId, id);
        }}
        onNext={() => pickerGlassId && advanceFrom(pickerGlassId)}
        nextLabel={nextLabel}
        search="client"
        onClose={closePicker}
        inputRef={inputRef}
        presentation={isDesktop ? "popover" : "sheet"}
        anchorRef={pickerAnchorRef}
        resetKey={pickerGlassId ?? undefined}
        // Every glass must be picked deliberately — there is no "skip it"
        // dead end for matching (D14 play-7 stays); "Next" reviews or moves
        // on.
        skipLabel={null}
        searchPlaceholder={`Search ${cards.length} wines`}
      />
    </div>
  );
}

/**
 * The viewer's own ✓/✗ on a glass whose result is knowable (revealed, or
 * personally proven via ASYNC IMMEDIATE) — spec §10.3 item 2 ("revealed →
 * ... with ✓ or ✗"). `null` renders nothing (not applicable, or the viewer
 * has no row on this glass at all — e.g. its contributor, or the host under
 * HOST_PROVIDES). Same tokens the board's own error text (rose) and
 * locked-in.tsx (gold-light) already use on dark — never a plain
 * green/red that has no dark-mode remap.
 */
function resultMark(hit: boolean | null) {
  if (hit == null) return null;
  return (
    <span
      aria-hidden
      className={cn("shrink-0 text-[13px] font-semibold", hit ? "text-gold-light" : "text-rose")}
    >
      {hit ? "✓" : "✗"}
    </span>
  );
}

/** The glass this key currently sits on (assigned or locked), if any. */
function holderOf(board: Board, key: string): { glass: number; locked: boolean } | null {
  const revealedEntry = Object.entries(board.revealedKeyByGlass).find(([, k]) => k === key);
  if (revealedEntry) {
    const glass = board.glasses.find((g) => g.wineId === revealedEntry[0]);
    return glass ? { glass: glass.glass, locked: true } : null;
  }
  const knownEntry = Object.entries(board.knownKeyByGlass).find(([, k]) => k === key);
  if (knownEntry) {
    const glass = board.glasses.find((g) => g.wineId === knownEntry[0]);
    return glass ? { glass: glass.glass, locked: true } : null;
  }
  for (const glass of board.glasses) {
    const row = board.mine[glass.wineId];
    if (row?.key === key) return { glass: glass.glass, locked: row.locked || row.scored };
  }
  return null;
}

function GlassRow({
  glassNumber,
  state,
  card,
  provenNotRevealed,
  hit,
  isDesktop,
  error,
  busy,
  isDragOver,
  rowRef,
  onOpenPicker,
  onClear,
  onLock,
  onUnlock,
  onPlaceArmed,
  onDragOverGlass,
  onDropKey,
}: {
  glassNumber: number;
  state: ReturnType<typeof glassRowState>;
  card: CandidateCard | null;
  /** `state === "locked"` covers both "the viewer locked it, still
   *  changeable" and "ASYNC IMMEDIATE already scored this glass for the
   *  viewer" — this tells the two apart (the board owns the distinction;
   *  `glassRowState`, out of OWNS, has no case of its own for it). */
  provenNotRevealed: boolean;
  /** The viewer's own result once it is knowable (revealed, or proven via
   *  ASYNC IMMEDIATE); null when not applicable or the viewer has no row. */
  hit: boolean | null;
  isDesktop: boolean;
  error?: string;
  busy: boolean;
  isDragOver: boolean;
  rowRef: (el: HTMLElement | null) => void;
  onOpenPicker: () => void;
  onClear: () => void;
  onLock: () => void;
  onUnlock: () => void;
  /** Set only when a bottle is armed (laptop click-to-place) and this glass
   *  can take it. */
  onPlaceArmed?: () => void;
  onDragOverGlass: (over: boolean) => void;
  onDropKey: (key: string) => void;
}) {
  const assignable = state === "open-empty" || state === "open-assigned";
  const clickable = assignable && !busy;

  function handleClick() {
    if (!clickable) return;
    if (onPlaceArmed) onPlaceArmed();
    else onOpenPicker();
  }

  const content = (() => {
    switch (state) {
      case "own-bottle":
        return <span className="text-[13.5px] text-muted-foreground">{YOUR_BOTTLE}</span>;
      case "not-poured":
        return <span className="text-[13.5px] text-muted-foreground">{NOT_POURED}</span>;
      case "revealed":
        return (
          <div className="flex min-w-0 flex-1 items-center gap-[10px]">
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
              {revealedRowText({
                glass: glassNumber,
                producer: card?.producer ?? null,
                vintageLabel: card?.vintageLabel ?? "",
              })}
            </span>
            {resultMark(hit)}
          </div>
        );
      case "locked":
        if (provenNotRevealed) {
          // ASYNC IMMEDIATE: score_own_guess already scored this glass for
          // the viewer, so it is no longer editable (unlockGuess refuses a
          // scored guess) — show the result exactly like a revealed row,
          // never "locked"/"Change it".
          return (
            <div className="flex min-w-0 flex-1 items-center gap-[10px]">
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                {revealedRowText({
                  glass: glassNumber,
                  producer: card?.producer ?? null,
                  vintageLabel: card?.vintageLabel ?? "",
                })}
              </span>
              {resultMark(hit)}
            </div>
          );
        }
        return (
          <div className="flex min-w-0 flex-1 items-center gap-[10px]">
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
              {card ? candidateLabel(card) : "—"}
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-gold-dark">locked</span>
            <button
              type="button"
              onClick={onUnlock}
              disabled={busy}
              className="flex min-h-11 shrink-0 items-center text-[12.5px] font-semibold text-primary disabled:opacity-50 md:min-h-0"
            >
              Change it
            </button>
          </div>
        );
      case "open-assigned":
        return (
          <div className="flex min-w-0 flex-1 items-center gap-[10px]">
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
              {card ? candidateLabel(card) : "—"}
            </span>
            {isDesktop ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                disabled={busy}
                aria-label="Clear this glass"
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        );
      case "open-empty":
      default:
        return <span className="text-[14px] text-muted-foreground">{emptyRowText({ phone: !isDesktop })}</span>;
    }
  })();

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={rowRef as React.Ref<HTMLDivElement>}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : -1}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (clickable && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            handleClick();
          }
        }}
        onDragOver={(e) => {
          if (!assignable) return;
          e.preventDefault();
          onDragOverGlass(true);
        }}
        onDragLeave={() => onDragOverGlass(false)}
        onDrop={(e) => {
          if (!assignable) return;
          e.preventDefault();
          onDragOverGlass(false);
          const key = e.dataTransfer.getData("text/plain");
          if (key) onDropKey(key);
        }}
        className={cn(
          "flex min-h-[56px] w-full items-center gap-[11px] rounded-[11px] px-[13px] py-3 text-left transition-colors",
          state === "locked"
            ? "border border-border bg-card"
            : state === "open-assigned"
              ? "border border-border bg-card md:hover:bg-background"
              : state === "open-empty"
                ? "border border-dashed border-border bg-card md:hover:bg-background cursor-pointer"
                : "border border-dashed border-border-light bg-card opacity-70",
          isDragOver && "border-primary bg-gold/10",
        )}
      >
        <span
          className={cn(
            "w-[26px] shrink-0 text-center font-heading text-[15px] font-semibold lining-nums tabular-nums",
            state === "revealed" || state === "locked" || state === "open-assigned"
              ? "text-gold-deep"
              : "text-placeholder-soft",
          )}
        >
          {glassNumber}
        </span>
        <span className="flex min-w-0 flex-1 items-center">{content}</span>
        {clickable && !isDesktop ? (
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 shrink-0 text-placeholder"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
        {state === "open-assigned" ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLock();
            }}
            disabled={busy}
            className="flex min-h-11 shrink-0 items-center justify-center rounded-[9px] bg-primary px-[11px] py-[7px] text-[11.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60 md:min-h-0"
          >
            {busy ? <WineGlassLoader size={12} /> : lockGlassLabel(glassNumber)}
          </button>
        ) : null}
      </div>
      {error ? <p className="px-1 text-[11.5px] text-rose">{error}</p> : null}
    </div>
  );
}

function PoolCard({
  card,
  isDesktop,
  holder,
  ownBottle,
  armed,
  assignable,
  onArm,
}: {
  card: CandidateCard;
  isDesktop: boolean;
  holder: { glass: number; locked: boolean } | null;
  /** The viewer's own contributed bottle — never assignable, shown as such
   *  rather than a bare, silently-inert "Choose" button. */
  ownBottle: boolean;
  armed: boolean;
  assignable: boolean;
  onArm: () => void;
}) {
  const nameLine = [card.wineName, card.vintageLabel].filter(Boolean).join(" ");
  const originLine = [card.appellation, card.grape].filter(Boolean).join(" · ");
  const dimmed = isDesktop && (holder != null || ownBottle);

  return (
    <div
      className={cn(
        "flex items-center gap-[10px] rounded-[11px] border bg-background p-[10px_12px] transition-opacity",
        armed ? "border-primary ring-1 ring-primary" : "border-border",
        dimmed && "opacity-65",
      )}
    >
      {isDesktop && assignable ? (
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", card.key);
            e.dataTransfer.effectAllowed = "move";
          }}
          className="shrink-0 cursor-grab touch-none text-muted-foreground"
          aria-hidden
        >
          <GripVertical className="size-4" />
        </span>
      ) : null}
      <HatchThumb src={null} width={32} height={42} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {card.producer ? (
          <span className="truncate text-[13px] font-semibold text-foreground">{card.producer}</span>
        ) : null}
        {nameLine ? <span className="truncate text-[11px] text-muted-foreground">{nameLine}</span> : null}
        {originLine ? <span className="truncate text-[11px] text-muted-foreground">{originLine}</span> : null}
      </div>
      {isDesktop ? (
        <div className="flex shrink-0 items-center gap-[6px]">
          {/* The holder pill is informational only ("where does this bottle
              currently sit") — it no longer replaces the Choose button below:
              a card another OPEN, UNLOCKED glass holds must stay choosable
              (and draggable, via `assignable` on the grip above) so it can be
              swapped onto a different glass (review round 2 issue 1). A card
              held by a LOCKED glass keeps its Choose button too and simply
              refuses when chosen ("Glass N · locked", from `applyAssignment`'s
              own "locked-holder" outcome) — never silently un-clickable. */}
          {holder ? (
            <span className="shrink-0 rounded-full border border-gold bg-gold/15 px-[9px] py-[3px] text-[10.5px] font-bold text-primary">
              {holder.locked ? lockedHolderLabel(holder.glass) : `Glass ${holder.glass}`}
            </span>
          ) : null}
          {ownBottle ? (
            <span className="shrink-0 text-[10.5px] font-semibold text-muted-foreground">{YOUR_BOTTLE}</span>
          ) : assignable ? (
            <button
              type="button"
              onClick={onArm}
              className="shrink-0 rounded-[9px] border border-border px-[10px] py-[6px] text-[11px] font-semibold text-primary transition-colors hover:bg-muted"
            >
              {armed ? "Cancel" : "Choose"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
