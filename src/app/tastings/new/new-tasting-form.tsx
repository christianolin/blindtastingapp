"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Calendar, ChevronDown, EyeOff, ScanEye, Wine } from "lucide-react";
import type {
  AsyncRevealPolicy,
  TimingMode,
  WineLeaderboardReveal,
  WineSourceMode,
} from "@/lib/supabase/database.types";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/image-uploader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  flowApplies,
  leaderboardApplies,
  nameSuggestions,
  rulesHint,
  rulesSummary,
  rulesSummaryShort,
  WINE_SOURCE_LOCKED,
  type FlowChoice,
  type SetupValues,
} from "./setup-copy";

const FLOW_ITEMS = {
  GUIDED: "Guided",
  FREE: "Free",
};

const LEADERBOARD_REVEAL_ITEMS = {
  PER_ATTRIBUTE: "After each attribute",
  PER_WINE: "After the full wine",
};

const ASYNC_REVEAL_ITEMS = {
  AFTER_ALL: "After everyone has guessed that wine",
  IMMEDIATE: "Immediately after you submit your own guess",
};

// Step 1 · setup (handoff 6a / 6d). Every value is controlled state owned by
// the sheet: the mode is a control, not a lock, and the sheet builds the
// FormData (buildSetupFormData) with the same field names createTasting has
// always read. This is a body, not a page — the sheet supplies the header and
// the footer buttons; it submits (Enter in the name field) through `formId`.
export function NewTastingForm({
  value,
  onChange,
  onSubmit,
  formId,
  userId,
  onPhotoUploadingChange,
  autoFocusName = false,
  regionSuggestion = null,
  wineCount = 0,
}: {
  value: SetupValues;
  /** Always an updater (pass the sheet's setState) — see `set` below. */
  onChange: (update: (prev: SetupValues) => SetupValues) => void;
  /** Enter in the name field — the sheet treats it as "Add the wines →". */
  onSubmit: () => void;
  formId: string;
  /** The cover photo's Storage folder: RLS only lets a user write under their own id. */
  userId: string;
  /** true while the cover photo uploads, so the sheet can hold its footer. */
  onPhotoUploadingChange?: (uploading: boolean) => void;
  /** Desktop only — an autofocus on phones pops the keyboard over the sheet. */
  autoFocusName?: boolean;
  regionSuggestion?: { region: string; n: number } | null;
  /** Bottles already in the flight (the sheet passes it when the host comes
      back to step 1). Above 0, who brings the wines is locked — the server
      refuses the switch too (spec §D.1 #3). */
  wineCount?: number;
}) {
  const nameId = useId();
  const rulesId = useId();
  const photoLabelId = useId();
  const sourceHintId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  // Functional updates: the cover photo's URL arrives from an async upload,
  // and a `{ ...value }` captured when the file was picked would roll back
  // anything typed or toggled while it uploaded.
  const set = <K extends keyof SetupValues>(key: K, v: SetupValues[K]) =>
    onChange((prev) => ({ ...prev, [key]: v }));
  const blind = value.revealMode === "BLIND";
  // Flow exists only for blind LIVE tastings, the Leaderboard only for blind
  // LIVE Guided ones (spec §D.1 #1, #5) — the same rules the summaries use.
  const showFlow = flowApplies(value);
  const showLeaderboard = leaderboardApplies(value);
  const hint = rulesHint(value);
  const sourceLocked = wineCount > 0;
  const suggestions = nameSuggestions(new Date(), regionSuggestion);

  // Focus in an effect, not `autoFocus`: on the SSR'd /tastings/new page the
  // desktop media query hydrates false and only flips on the next render,
  // after React has already applied (or skipped) autoFocus at mount. Never
  // runs on phones — `autoFocusName` stays false there.
  useEffect(() => {
    if (autoFocusName) nameRef.current?.focus();
  }, [autoFocusName]);

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-[15px] md:gap-5"
    >
      {/* 1 · Name */}
      <div className="flex flex-col gap-[7px] md:gap-2">
        <Label htmlFor={nameId} className="text-[12px] font-semibold md:text-[12.5px]">
          What is it called?
        </Label>
        <input
          ref={nameRef}
          id={nameId}
          name="name"
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
          autoComplete="off"
          required
          className="w-full min-w-0 rounded-[10px] border border-border bg-white p-[13px] text-[15.5px] text-foreground outline-none transition-colors placeholder:text-placeholder focus:border-[1.5px] focus:border-primary focus:p-[12.5px] md:p-[13px_14px] md:text-[16px] md:focus:p-[12.5px_13.5px]"
        />
        <div className="flex flex-wrap items-center gap-[7px] max-md:hidden">
          <span className="text-[11.5px] text-muted-foreground">Suggestions:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set("name", s)}
              className="rounded-full border border-border bg-background px-[10px] py-[3px] text-[11.5px] text-foreground transition-colors hover:border-gold hover:bg-white"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 2 · How hidden are the wines? */}
      <div className="flex flex-col gap-2 md:gap-[9px]">
        <span className="text-[12px] font-semibold md:text-[12.5px]">
          How hidden are the wines?
        </span>
        <div
          role="radiogroup"
          aria-label="How hidden are the wines?"
          className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-[9px]"
        >
          <ModeTile
            selected={value.revealMode === "BLIND"}
            onSelect={() => set("revealMode", "BLIND")}
            icon={<EyeOff className="size-[19px]" aria-hidden />}
            title="Blind"
            desktopCopy="Nothing known. Guess each glass from scratch, 30 pts a wine."
            phoneCopy="Guess each glass from scratch"
          />
          <ModeTile
            selected={value.revealMode === "SEMI_BLIND"}
            onSelect={() => set("revealMode", "SEMI_BLIND")}
            icon={<ScanEye className="size-[19px]" aria-hidden />}
            title="Semi-blind"
            desktopCopy="The list is shown. Match each glass to a wine on it."
            phoneCopy="Match glasses to a known list"
          />
          {/* Taste & rate: drawn as SOON — OPEN stays in the schema, the
              sheet never creates one. Not a button, not selectable. */}
          <div
            aria-disabled="true"
            className="flex items-center gap-[11px] rounded-[11px] border border-dashed border-border bg-background p-[13px] md:flex-col md:items-stretch md:gap-[5px]"
          >
            <Wine className="size-[19px] shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col gap-px md:gap-[5px]">
              <span className="flex items-center gap-[6px] font-heading text-[18px] font-semibold leading-tight md:gap-[7px]">
                Taste &amp; rate
                <span className="rounded-full border border-gold px-[6px] py-px font-mono text-[10px] tracking-[.1em] text-gold-dark md:px-[7px] md:py-[2px]">
                  SOON
                </span>
              </span>
              <span className="text-[11.5px] leading-[1.45] text-muted-foreground max-md:hidden">
                As a group. Rating a wine on your own already works from the catalog.
              </span>
              <span className="text-[11.5px] text-muted-foreground md:hidden">
                As a group · solo works today
              </span>
            </span>
          </div>
        </div>
        <span className="text-[11.5px] text-muted-foreground max-md:hidden">
          Switch between blind and semi-blind at any time before you start — the
          wines you have added stay.
        </span>
      </div>

      {/* 3 · When, and who pours? */}
      <div className="flex flex-col gap-2 md:gap-[9px]">
        <span className="text-[12px] font-semibold md:text-[12.5px]">
          When, and who pours?
        </span>
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:gap-[9px]">
          <Segmented<TimingMode>
            label="When"
            value={value.timingMode}
            onChange={(v) => set("timingMode", v)}
            options={[
              { value: "LIVE", desktop: "Live, together", phone: "Live" },
              { value: "ASYNC", desktop: "Self-paced", phone: "Self-paced" },
            ]}
          />
          <Segmented<WineSourceMode>
            label="Who pours"
            value={value.wineSource}
            onChange={(v) => set("wineSource", v)}
            describedBy={sourceLocked ? sourceHintId : undefined}
            options={[
              {
                value: "HOST_PROVIDES",
                desktop: "I bring the wines",
                phone: "I bring them",
                disabled: sourceLocked && value.wineSource !== "HOST_PROVIDES",
              },
              {
                value: "PARTICIPANT_CONTRIBUTED",
                desktop: "Everyone brings one",
                phone: "Everyone brings",
                disabled: sourceLocked && value.wineSource !== "PARTICIPANT_CONTRIBUTED",
              },
            ]}
          />
        </div>
        {sourceLocked ? (
          <p id={sourceHintId} className="text-[11.5px] leading-[1.5] text-muted-foreground">
            {WINE_SOURCE_LOCKED}
          </p>
        ) : null}
        <label className="flex min-h-11 items-center gap-[9px] rounded-[10px] border border-border bg-white p-[11px_13px] md:gap-[10px]">
          <Calendar className="size-4 shrink-0 text-muted-foreground max-md:hidden" aria-hidden />
          <span className="sr-only">Date and time</span>
          <input
            type="datetime-local"
            name="scheduled_at"
            value={value.scheduledLocal}
            onChange={(e) => set("scheduledLocal", e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none md:text-[13.5px]"
          />
          <span className="shrink-0 text-[11.5px] text-muted-foreground md:text-[12px]">
            optional
          </span>
        </label>
      </div>

      {/* 4 · Cover photo (optional). The lobby header and the Taste cards
          show it as a small square crop, so the preview is that crop too
          (tap it for the full image). Every control in here is
          type="button", so Enter in the name field still submits through
          the footer's "Add the wines →". */}
      <div
        role="group"
        aria-labelledby={photoLabelId}
        className="flex flex-col gap-2 md:gap-[9px]"
      >
        <span className="flex items-baseline gap-[7px]">
          <span id={photoLabelId} className="text-[12px] font-semibold md:text-[12.5px]">
            Cover photo
          </span>
          <span className="text-[11.5px] text-muted-foreground md:text-[12px]">optional</span>
        </span>
        <ImageUploader
          name="image_url"
          bucket="tasting-images"
          folder={userId}
          initialUrl={value.imageUrl}
          aspectClassName="aspect-square w-20"
          removable
          onChange={(url) => set("imageUrl", url)}
          onPendingChange={onPhotoUploadingChange}
        />
      </div>

      {/* 5 · Rules and reveal (collapsed; Change ▾ opens the Selects) */}
      <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-background p-[12px_13px] md:rounded-[11px] md:p-[13px_15px]">
        <div className="flex items-center gap-[10px]">
          <span className="flex min-w-0 flex-1 flex-col gap-[2px] md:flex-row md:items-center md:gap-[10px]">
            <span className="shrink-0 text-[12.5px] font-semibold md:text-[13px]">
              Rules and reveal
            </span>
            <span className="min-w-0 text-[11px] text-muted-foreground md:hidden">
              {rulesSummaryShort(value)}
            </span>
            <span className="min-w-0 text-[12px] text-muted-foreground max-md:hidden">
              {rulesSummary(value)}
            </span>
          </span>
          <button
            type="button"
            aria-expanded={rulesOpen}
            aria-controls={rulesId}
            onClick={() => setRulesOpen((o) => !o)}
            className="flex shrink-0 items-center gap-[5px] rounded-full text-[12px] font-semibold text-primary md:border md:border-border md:bg-card md:px-[11px] md:py-[5px] md:text-[11.5px] md:hover:border-gold md:hover:bg-white"
          >
            Change
            <ChevronDown
              className={cn("size-3.5 transition-transform", rulesOpen && "rotate-180")}
              aria-hidden
            />
          </button>
        </div>
        {hint && !rulesOpen ? (
          <span className="text-[11.5px] leading-[1.5] text-muted-foreground max-md:hidden">
            {hint}
          </span>
        ) : null}
        <div id={rulesId} hidden={!rulesOpen} className="flex flex-col gap-4 pt-1">
          {showFlow ? (
            <div className="flex flex-col gap-2">
              <Label className="text-[12.5px]">Flow</Label>
              <Select
                items={FLOW_ITEMS}
                value={value.flow}
                onValueChange={(v) => set("flow", (v ?? "GUIDED") as FlowChoice)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a flow" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GUIDED">{FLOW_ITEMS.GUIDED}</SelectItem>
                  <SelectItem value="FREE">{FLOW_ITEMS.FREE}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Guided: everyone tastes the same wine together, one at a time. Free:
                people guess any wine in any order.
              </p>
            </div>
          ) : null}
          {showLeaderboard ? (
            <div className="flex flex-col gap-2">
              <Label className="text-[12.5px]">Leaderboard</Label>
              <Select
                items={LEADERBOARD_REVEAL_ITEMS}
                value={value.leaderboardReveal}
                onValueChange={(v) =>
                  set(
                    "leaderboardReveal",
                    (v ?? "PER_ATTRIBUTE") as WineLeaderboardReveal,
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="When to move the leaderboard" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PER_ATTRIBUTE">
                    {LEADERBOARD_REVEAL_ITEMS.PER_ATTRIBUTE}
                  </SelectItem>
                  <SelectItem value="PER_WINE">
                    {LEADERBOARD_REVEAL_ITEMS.PER_WINE}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                When the standings move during a progressive reveal — after every
                attribute, or only once the whole wine is revealed.
              </p>
            </div>
          ) : null}
          {value.timingMode === "ASYNC" ? (
            <div className="flex flex-col gap-2">
              <Label className="text-[12.5px]">When to show results</Label>
              <Select
                items={ASYNC_REVEAL_ITEMS}
                value={value.asyncRevealPolicy}
                onValueChange={(v) =>
                  set("asyncRevealPolicy", (v ?? "AFTER_ALL") as AsyncRevealPolicy)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="When to show results" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AFTER_ALL">{ASYNC_REVEAL_ITEMS.AFTER_ALL}</SelectItem>
                  <SelectItem value="IMMEDIATE">{ASYNC_REVEAL_ITEMS.IMMEDIATE}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {!blind && value.timingMode !== "ASYNC" ? (
            <p className="text-xs text-muted-foreground">
              Semi-blind scores one point per matched glass — nothing else to set.
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}

// One selectable mode tile: a 3-up card on desktop (check disc top-right), a
// full-width row on phones (disc at the end).
function ModeTile({
  selected,
  onSelect,
  icon,
  title,
  desktopCopy,
  phoneCopy,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  desktopCopy: string;
  phoneCopy: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "relative flex min-h-11 items-center gap-[11px] rounded-[11px] p-[13px] text-left transition-colors md:flex-col md:items-stretch md:gap-[5px]",
        selected
          ? "border-[1.5px] border-primary bg-card p-[12.5px] md:bg-background"
          : "border border-border bg-card hover:border-gold md:bg-white",
      )}
    >
      <span className={cn("shrink-0", selected ? "text-primary" : "text-muted-foreground")}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px md:gap-[5px]">
        <span className="font-heading text-[18px] font-semibold leading-tight">{title}</span>
        <span className="text-[11.5px] leading-[1.45] text-ink-photo max-md:hidden">
          {desktopCopy}
        </span>
        <span className="text-[11.5px] text-muted-foreground md:hidden">{phoneCopy}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold md:absolute md:top-[10px] md:right-[11px] md:size-[17px]",
          selected
            ? "bg-primary text-primary-foreground"
            : "border-[1.5px] border-border md:hidden",
        )}
      >
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}

// The "Live, together / Self-paced" style pair — the RangeControl pattern
// with radio semantics.
function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  describedBy,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  /** A disabled option can't be picked (e.g. the wine source once wines exist). */
  options: { value: T; desktop: string; phone: string; disabled?: boolean }[];
  /** Id of the hint explaining a disabled option. */
  describedBy?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      className="flex flex-1 gap-[3px] rounded-[10px] bg-muted p-[3px] md:min-w-[250px]"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-11 flex-1 rounded-[8px] p-[10px] text-center text-[12.5px] transition-colors md:min-h-0 md:text-[13px]",
              active
                ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(42,33,30,.08)]"
                : o.disabled
                  ? "cursor-not-allowed text-muted-foreground opacity-50"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="max-md:hidden">{o.desktop}</span>
            <span className="md:hidden">{o.phone}</span>
          </button>
        );
      })}
    </div>
  );
}
