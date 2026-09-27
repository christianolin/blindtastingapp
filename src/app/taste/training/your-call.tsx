"use client";

// "Your call" — the card under the sheet at every width (spec §3.3;
// region-guess addendum R5): which region it is (a search over every region
// above the top five regions with their percentages, and "It's not in the
// list"); once a region is chosen, how deep to go — "Just the region" or one
// of its typical wines — and, while the call stays at the region, an optional
// grape (the grapes its typical wines name, and "Other grape…" for any grape);
// an optional vintage through the guess ladder's own vintage picker (years,
// NV, tawny ages, "Other age…"); then Reveal the bottle / I can't find out.
// Every value is React state owned by the room (CLAUDE.md: never an
// uncontrolled input); call.ts holds the rules.
import { useId, useRef, useState, type ReactNode, type Ref } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/overview/eyebrow";
import { FieldPicker } from "@/app/tastings/[id]/play/field-picker";
import { vintageOptions } from "@/app/tastings/[id]/play/guess-write";
import { VINTAGE_EMPTY } from "@/app/tastings/[id]/play/ladder-copy";
import { grapeChips, regionCallOptions, regionGrapeChoices } from "@/lib/training/call";
import { TRAINING_COPY, lineageLine, percentLabel, shortName, vintageGuessLabel } from "@/lib/training/copy";
import {
  tawnyYearsFromInput,
  vintageFromPickerId,
  vintagePickerGroups,
  vintagePickerValue,
} from "@/lib/training/panel";
import type { CallPick, Named, RegionGroup, VintageGuess } from "@/lib/training/types";
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
        "flex w-full min-w-0 items-center gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors",
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

// A grape chip: pressed while it is the call's grape; pressed again, it lets go.
function GrapeChip({
  pressed,
  onClick,
  children,
  buttonRef,
  dialog,
}: {
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
  buttonRef?: Ref<HTMLButtonElement>;
  /** "Other grape…": opens the grape picker (a dialog) instead of toggling. */
  dialog?: { open: boolean };
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-pressed={dialog ? undefined : (pressed ?? false)}
      aria-haspopup={dialog ? "dialog" : undefined}
      aria-expanded={dialog ? dialog.open : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors",
        pressed ? "border-primary bg-gold/10" : "border-border hover:bg-muted",
        dialog && "border-dashed text-muted-foreground",
        TAP,
      )}
    >
      {pressed ? <Check aria-hidden className="size-3" strokeWidth={3} /> : null}
      {children}
    </button>
  );
}

export function YourCall({
  groups,
  pick,
  grapes,
  onRegion,
  onDeeper,
  onGrape,
  onNotListed,
  vintage,
  onVintage,
  onReveal,
  onCantFindOut,
  busy,
  error,
}: {
  /** The ranking by region (groups.ts's groupRanking). */
  groups: RegionGroup[];
  pick: CallPick;
  /** Every grape, by name: "Other grape…"'s list (R11). */
  grapes: Named[];
  onRegion: (regionId: string) => void;
  /** "Just the region" (null) or one of the region's typical wines. */
  onDeeper: (archetypeId: string | null) => void;
  onGrape: (grapeId: string | null) => void;
  /** "It's not in the list": the room clears the whole pick. */
  onNotListed: () => void;
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
  // "It's not in the list" and "nothing picked yet" are both an empty pick;
  // this flag only says which one the taster tapped.
  const [notListed, setNotListed] = useState(false);
  const [grapeOpen, setGrapeOpen] = useState(false);
  const [vintageOpen, setVintageOpen] = useState(false);
  // "Other age…" — closed until picked, as in the ladder; the chosen age itself
  // shows on the vintage button.
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const grapeInputRef = useRef<HTMLInputElement>(null);
  const otherGrapeRef = useRef<HTMLButtonElement>(null);
  const vintageInputRef = useRef<HTMLInputElement>(null);
  const vintageButtonRef = useRef<HTMLButtonElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);
  const deeperLabelId = useId();
  const grapeLabelId = useId();
  // The vintage button is named by its label, then its own text:
  // "Vintage (optional) 2016".
  const vintageLabelId = useId();
  const vintageButtonId = useId();

  const options = regionCallOptions(groups, query, pick.pickedRegionId);
  const region = pick.pickedRegionId ? (groups.find((g) => g.key === pick.pickedRegionId) ?? null) : null;
  const chips = region ? grapeChips(regionGrapeChoices(region.members), pick.pickedGrapeId, grapes) : [];
  const otherYears = tawnyYearsFromInput(otherText);

  // The ladder's own groups, word for word (guess-ladder.tsx, "vintage").
  const vintageGroups = vintagePickerGroups(years, tawny);
  const grapeGroups = [{ options: grapes.map((g) => ({ id: g.id, name: g.name })) }];

  function chooseRegion(regionId: string) {
    setNotListed(false);
    onRegion(regionId);
  }

  function chooseNotListed() {
    setNotListed(true);
    onNotListed();
  }

  // Back to "Other grape…", as the ladder's closePicker returns to its row.
  function closeGrape() {
    setGrapeOpen(false);
    otherGrapeRef.current?.focus({ preventScroll: true });
  }

  function pickGrape(id: string | null) {
    onGrape(id);
    closeGrape();
  }

  // Back to the vintage button, as the ladder's closePicker returns to its row:
  // this also takes focus (and the phone keyboard) off the picker's search, or
  // off the "Other age…" box once it closes.
  function focusVintageButton() {
    vintageButtonRef.current?.focus({ preventScroll: true });
  }

  function closeVintage() {
    setVintageOpen(false);
    focusVintageButton();
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
    focusVintageButton();
  }

  function cancelOther() {
    setOtherOpen(false);
    focusVintageButton();
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
          {TRAINING_COPY.whichRegion}
        </h2>
      </div>

      {/* Step 1. The region search sits above the list it filters, on screen
          and in the DOM (a textbox is not a radio, so it stays outside the
          radiogroup). Flex columns, not a grid: every row is as wide as the
          card and truncates its lines (min-w-0) instead of widening it. */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={TRAINING_COPY.searchRegions}
          aria-label={TRAINING_COPY.searchRegions}
          className="min-h-11 w-full min-w-0 rounded-[10px] border border-border bg-card px-3 text-base text-foreground placeholder:text-muted-foreground md:text-[14px]"
        />
        <div role="radiogroup" aria-labelledby="your-call-title" className="flex min-w-0 flex-col gap-1.5">
          {options.map((g) => (
            <OptionRow
              key={g.key}
              checked={pick.pickedRegionId === g.key}
              onSelect={() => chooseRegion(g.key)}
              title={g.region.name}
              sub={g.country.name}
              pct={percentLabel(g.closeness) || undefined}
            />
          ))}
          <OptionRow
            checked={pick.pickedRegionId === null && notListed}
            onSelect={chooseNotListed}
            title={TRAINING_COPY.notInList}
          />
        </div>
      </div>

      {/* Step 2, once a region is chosen: stop there, or go deeper. */}
      {region ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 id={deeperLabelId} className="text-[13px] font-semibold">
            {TRAINING_COPY.goDeeper}
          </h3>
          <div role="radiogroup" aria-labelledby={deeperLabelId} className="flex min-w-0 flex-col gap-1.5">
            <OptionRow
              checked={pick.pickedArchetypeId === null}
              onSelect={() => onDeeper(null)}
              title={TRAINING_COPY.justTheRegion}
            />
            {region.members.map((r) => (
              <OptionRow
                key={r.candidate.id}
                checked={pick.pickedArchetypeId === r.candidate.id}
                onSelect={() => onDeeper(r.candidate.id)}
                title={shortName(r.candidate.name)}
                sub={lineageLine(r.candidate)}
                pct={percentLabel(r.closeness) || undefined}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Step 3, only while the call stays at the region: a typical wine
          already names its grapes. */}
      {region && pick.pickedArchetypeId === null ? (
        <div role="group" aria-labelledby={grapeLabelId} className="flex min-w-0 flex-col gap-2">
          <h3 id={grapeLabelId} className="text-[13px] font-semibold">
            {TRAINING_COPY.grapeOptional}
          </h3>
          <div className="flex flex-wrap gap-2">
            {chips.map((g) => (
              <GrapeChip
                key={g.id}
                pressed={pick.pickedGrapeId === g.id}
                onClick={() => onGrape(pick.pickedGrapeId === g.id ? null : g.id)}
              >
                {g.name}
              </GrapeChip>
            ))}
            <GrapeChip
              buttonRef={otherGrapeRef}
              dialog={{ open: grapeOpen }}
              onClick={() => {
                setGrapeOpen(true);
                // The field picker's search input stays mounted, so this focus
                // runs inside the tap that opens it (the combobox rule).
                grapeInputRef.current?.focus();
              }}
            >
              {TRAINING_COPY.otherGrape}
            </GrapeChip>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span id={vintageLabelId} className="text-[13px] font-semibold">
          {TRAINING_COPY.vintageOptional}
        </span>
        <button
          ref={vintageButtonRef}
          id={vintageButtonId}
          aria-labelledby={`${vintageLabelId} ${vintageButtonId}`}
          aria-haspopup="dialog"
          aria-expanded={vintageOpen}
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
          <span className="text-[11px] text-muted-foreground">{TRAINING_COPY.tawnyAgeLabel}</span>
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
              placeholder={TRAINING_COPY.tawnyAgePlaceholder}
              aria-label={TRAINING_COPY.tawnyAgeLabel}
              tabIndex={otherOpen ? undefined : -1}
              className="min-h-11 w-24 rounded-[10px] border border-border bg-card px-3 text-[15.5px] text-foreground"
            />
            <button
              type="button"
              tabIndex={otherOpen ? undefined : -1}
              onClick={cancelOther}
              className="flex min-h-11 items-center px-2 text-[13px] font-semibold text-muted-foreground"
            >
              {TRAINING_COPY.tawnyAgeCancel}
            </button>
            <button
              type="button"
              tabIndex={otherOpen ? undefined : -1}
              disabled={otherYears === null}
              onClick={confirmOther}
              className="ml-auto flex min-h-11 items-center justify-center rounded-[10px] bg-primary px-[16px] text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {TRAINING_COPY.tawnyAgeSet}
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
        open={grapeOpen}
        field="primary_grape"
        points={8}
        title={TRAINING_COPY.grapeOptional}
        groups={grapeGroups}
        value={pick.pickedGrapeId ?? ""}
        onPick={pickGrape}
        onNext={closeGrape}
        nextLabel={TRAINING_COPY.done}
        search="client"
        searchPlaceholder={TRAINING_COPY.searchGrapes}
        onClose={closeGrape}
        inputRef={grapeInputRef}
      />
      <FieldPicker
        open={vintageOpen}
        field="vintage"
        points={2}
        title={TRAINING_COPY.vintageOptional}
        groups={vintageGroups}
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
