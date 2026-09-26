"use client";

// "Your call" — the card under the sheet at every width (spec §3.3): which
// wine it is (the ranked candidates with their percentages, a search over
// every candidate, or "It's not in the list"), an optional vintage through the
// guess ladder's own vintage picker (years, NV, tawny ages, "Other age…"), then
// Reveal the bottle / I can't find out. Every value is React state owned by
// the room (CLAUDE.md: never an uncontrolled input).
import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/overview/eyebrow";
import { FieldPicker } from "@/app/tastings/[id]/play/field-picker";
import { vintageOptions } from "@/app/tastings/[id]/play/guess-write";
import { VINTAGE_EMPTY } from "@/app/tastings/[id]/play/ladder-copy";
import {
  VINTAGE_NV_ID,
  VINTAGE_TAWNY_OTHER_ID,
  vintageTawnyId,
  vintageYearId,
  type PickerGroup,
} from "@/app/tastings/[id]/play/ladder-types";
import {
  TRAINING_COPY,
  lineageLine,
  percentLabel,
  shortName,
  vintageGuessLabel,
} from "@/lib/training/copy";
import {
  tawnyYearsFromInput,
  vintageFromPickerId,
  vintagePickerValue,
  yourCallOptions,
} from "@/lib/training/panel";
import type { RankedCandidate, VintageGuess } from "@/lib/training/types";
import { cn } from "@/lib/utils";

const TAP = "min-h-11 md:pointer-fine:min-h-0";

function OptionRow({
  checked,
  onSelect,
  title,
  sub,
  pct,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  sub?: string;
  pct?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors",
        checked ? "border-primary bg-gold/10" : "border-border hover:bg-muted",
        TAP,
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-semibold">{title}</span>
        {sub ? <span className="truncate text-[11.5px] text-muted-foreground">{sub}</span> : null}
      </span>
      {pct ? <span className="shrink-0 text-[12.5px] font-semibold tabular-nums">{pct}</span> : null}
      <span
        aria-hidden
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          checked ? "bg-primary text-primary-foreground" : "border-[1.5px] border-border",
        )}
      >
        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

export function YourCall({
  ranked,
  pickedId,
  onPick,
  vintage,
  onVintage,
  onReveal,
  onCantFindOut,
  busy,
  error,
}: {
  ranked: RankedCandidate[];
  pickedId: string | null;
  onPick: (id: string | null) => void;
  vintage: VintageGuess;
  onVintage: (v: VintageGuess) => void;
  onReveal: () => void;
  onCantFindOut: () => void;
  busy: boolean;
  error: string | null;
}) {
  // The guess ladder does the same: its picker lists years from next year down.
  const { years, tawny } = vintageOptions(new Date());
  const [query, setQuery] = useState("");
  // "It's not in the list" and "nothing picked yet" are both a null pick; this
  // flag only says which one the taster tapped.
  const [notListed, setNotListed] = useState(false);
  const [vintageOpen, setVintageOpen] = useState(false);
  // "Other age…" — closed until picked, as in the ladder; the chosen age itself
  // shows on the vintage button.
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const vintageInputRef = useRef<HTMLInputElement>(null);
  const vintageButtonRef = useRef<HTMLButtonElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  const options = yourCallOptions(ranked, query, pickedId);
  const otherYears = tawnyYearsFromInput(otherText);

  // The ladder's own groups, word for word (guess-ladder.tsx, "vintage").
  const groups: PickerGroup[] = [
    { heading: "Year", options: years.map((y) => ({ id: vintageYearId(y), name: String(y) })) },
    { heading: "Non-vintage", options: [{ id: VINTAGE_NV_ID, name: "NV", sub: "Non-vintage" }] },
    {
      heading: "Tawny",
      options: [
        ...tawny.map((n) => ({ id: vintageTawnyId(n), name: `${n} years` })),
        { id: VINTAGE_TAWNY_OTHER_ID, name: "Other age…" },
      ],
    },
  ];

  function pick(id: string | null, listed: boolean) {
    setNotListed(!listed);
    onPick(id);
  }

  // Back to the vintage button, as the ladder's closePicker returns to its row:
  // this also takes focus (and the phone keyboard) off the picker's search.
  function closeVintage() {
    setVintageOpen(false);
    vintageButtonRef.current?.focus({ preventScroll: true });
  }

  function pickVintage(id: string | null) {
    const result = vintageFromPickerId(id);
    if ("otherTawny" in result) {
      // Closed directly, not through closeVintage(): focusing the button would
      // fight the synchronous focus on the age input below.
      setVintageOpen(false);
      // Prefilled with an age already typed, as the ladder does.
      setOtherText(vintage?.kind === "TAWNY" && !tawny.includes(vintage.years) ? String(vintage.years) : "");
      setOtherOpen(true);
      // In the same tap: the phone keyboard only opens for a synchronous focus.
      otherInputRef.current?.focus();
      return;
    }
    setOtherOpen(false);
    closeVintage();
    onVintage(result.vintage);
  }

  function confirmOther() {
    if (otherYears === null) return;
    onVintage({ kind: "TAWNY", years: otherYears });
    setOtherOpen(false);
  }

  return (
    <section
      id="your-call"
      aria-labelledby="your-call-title"
      className="flex scroll-mt-[72px] flex-col gap-4 rounded-[12px] border border-border bg-card p-4 md:p-6"
    >
      <div className="flex flex-col gap-1">
        <Eyebrow size="sm">{TRAINING_COPY.yourCall}</Eyebrow>
        <h2 id="your-call-title" className="font-heading text-[22px] leading-tight font-semibold">
          {TRAINING_COPY.whichWine}
        </h2>
      </div>

      <div role="radiogroup" aria-labelledby="your-call-title" className="flex flex-col gap-1.5">
        {options.map((r) => (
          <OptionRow
            key={r.candidate.id}
            checked={pickedId === r.candidate.id}
            onSelect={() => pick(r.candidate.id, true)}
            title={shortName(r.candidate.name)}
            sub={lineageLine(r.candidate)}
            pct={percentLabel(r.closeness) || undefined}
          />
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={TRAINING_COPY.somethingElse}
          aria-label={TRAINING_COPY.somethingElse}
          className="min-h-11 w-full rounded-[10px] border border-border bg-card px-3 text-base text-foreground placeholder:text-muted-foreground md:text-[14px]"
        />
        <OptionRow
          checked={pickedId === null && notListed}
          onSelect={() => pick(null, false)}
          title={TRAINING_COPY.notInList}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">{TRAINING_COPY.vintageOptional}</span>
        <button
          ref={vintageButtonRef}
          type="button"
          onClick={() => {
            setVintageOpen(true);
            // The field picker's search input stays mounted, so this focus runs
            // inside the tap that opens it (the combobox rule).
            vintageInputRef.current?.focus();
          }}
          className={cn(
            "flex w-full items-center rounded-[10px] border border-border bg-background px-3 py-2 text-left text-[14px]",
            TAP,
            vintage === null && "text-muted-foreground",
          )}
        >
          {vintageGuessLabel(vintage) ?? VINTAGE_EMPTY}
        </button>
        {/* Collapsed rather than unmounted, so "Other age…" can focus it in the
            same tap (the ladder's own tawny input does the same). */}
        <div
          aria-hidden={!otherOpen}
          className={cn(
            "flex flex-col gap-2 rounded-[11px] border border-primary bg-card px-[13px] py-3 transition-[opacity,max-height]",
            otherOpen ? "max-h-40 opacity-100" : "pointer-events-none max-h-0 overflow-hidden border-0 px-0 py-0 opacity-0",
          )}
        >
          <span className="text-[11px] text-muted-foreground">Tawny age (years)</span>
          <div className="flex items-center gap-[10px]">
            <input
              ref={otherInputRef}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmOther();
                }
              }}
              placeholder="e.g. 25"
              tabIndex={otherOpen ? undefined : -1}
              className="min-h-11 w-24 rounded-[10px] border border-border bg-card px-3 text-[15.5px] text-foreground"
            />
            <button
              type="button"
              tabIndex={otherOpen ? undefined : -1}
              onClick={() => setOtherOpen(false)}
              className="flex min-h-11 items-center px-2 text-[13px] font-semibold text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              tabIndex={otherOpen ? undefined : -1}
              disabled={otherYears === null}
              onClick={confirmOther}
              className="ml-auto flex min-h-11 items-center justify-center rounded-[10px] bg-primary px-[16px] text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              Set age
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button className={cn(TAP, "px-4")} disabled={busy} onClick={onReveal}>
          {TRAINING_COPY.revealBottle}
        </Button>
        <Button variant="ghost" className={TAP} disabled={busy} onClick={onCantFindOut}>
          {TRAINING_COPY.cantFindOut}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}

      <FieldPicker
        open={vintageOpen}
        field="vintage"
        points={2}
        title={TRAINING_COPY.vintageOptional}
        groups={groups}
        value={vintagePickerValue(vintage, tawny)}
        onPick={pickVintage}
        onNext={closeVintage}
        nextLabel={TRAINING_COPY.done}
        search="client"
        onClose={closeVintage}
        inputRef={vintageInputRef}
        totalCount={years.length}
      />
    </section>
  );
}
