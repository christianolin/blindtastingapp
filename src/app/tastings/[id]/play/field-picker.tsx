"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Eyebrow } from "@/components/overview/eyebrow";
import { useLiveTheme } from "@/components/live-shell";
import { deaccent } from "@/lib/deaccent";
import { cn } from "@/lib/utils";
import {
  everythingElseHeading,
  OFTEN_SUFFIX,
  searchPlaceholder as computeSearchPlaceholder,
} from "./ladder-copy";
import type { FieldPickerProps, PickerGroup, PickerOption } from "./ladder-types";

/**
 * The 6f field picker: a bottom sheet on phones (centred 480px dialog from
 * `md` when no `anchorRef`-anchored popover is requested — the match ladder
 * still uses this path at every width), or, from S8b, a popover anchored to
 * its row on laptops (`presentation="popover"`, chosen by the caller — the
 * guess ladder switches at `md`).
 *
 * Dependency-free portaled overlay like MobileNav for the sheet, base-ui
 * `Popover` for the popover — either way both presentations stay MOUNTED
 * while closed so the ladder can call `inputRef.current.focus()`
 * synchronously inside the tap that opens it — mobile browsers only pop the
 * virtual keyboard when focus() runs in the original trusted gesture. The
 * sheet parks its closed state off-screen (translated out of the viewport,
 * pointer-events off, aria-hidden, controls tabIndex=-1) since a
 * display:none/inert element cannot take focus; the popover relies on
 * base-ui's own `keepMounted` portal.
 *
 * Search is cmdk's CommandInput (a custom Input did not register typed
 * characters on mobile — see searchable-combobox.tsx). "client" mode lets
 * cmdk filter the given groups accent-insensitively; a function is a server
 * search (debounced 250 ms, 0 for the empty query) whose results replace the
 * groups, bucketed by their `group` label.
 *
 * Dark (B5, XCUT-04): both presentations portal to `document.body`, breaking
 * out of the running view's `.dark`-classed LiveShell subtree, so each reads
 * `useLiveTheme()` itself and adds the `dark` class, and data-live with it,
 * to its own root — the same mechanism `components/ui/popover.tsx` uses for
 * every other popover.
 * Every surface color below is a token (`bg-card`, `border-border`, …), so
 * that class is the only thing dark mode needs.
 */
export function FieldPicker({
  open,
  field,
  points,
  title,
  groups,
  value,
  onPick,
  onNext,
  nextLabel,
  search,
  onClose,
  inputRef,
  searchPlaceholder: searchPlaceholderProp = "Search",
  resetKey,
  skipLabel = "Not sure — skip it",
  presentation = "sheet",
  anchorRef,
  totalCount,
  oftenIds,
}: FieldPickerProps) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerOption[]>([]);
  const [pending, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const serverSearch = typeof search === "function" ? search : null;
  const isPopover = presentation === "popover";
  const dark = useLiveTheme() === "dark";

  // Portal only after hydration: the server renders nothing here, so the
  // first client render must match (server snapshot false, client true).
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  // A fresh query and result set whenever the sheet opens, changes field or
  // moves to another glass (`resetKey`) — adjusted during render (React's
  // "reset state when a prop changes" pattern, as app-sidebar does on route
  // change), not in an effect.
  const sessionKey = `${open}:${field}:${resetKey ?? ""}`;
  const [seenSession, setSeenSession] = useState(sessionKey);
  if (seenSession !== sessionKey) {
    setSeenSession(sessionKey);
    setQuery("");
    setResults([]);
  }

  // Server search: debounced on a typed query, instant for the empty one (a
  // region's first page of producers should appear as the sheet opens). The
  // request id is taken as the effect starts, so re-running it (new query,
  // new field) invalidates any answer still in flight for the old one.
  useEffect(() => {
    if (!open || !serverSearch) return;
    const requestId = ++requestIdRef.current;
    const delay = query.trim() ? 250 : 0;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const found = await serverSearch(query);
        if (requestId === requestIdRef.current) setResults(found);
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [query, open, field, resetKey, serverSearch]);

  // Lock the page behind the sheet while it is open; Escape closes it. Only
  // the sheet needs this: the popover is deliberately non-modal (no
  // backdrop, `modal={false}` below) and base-ui's own dismiss handling
  // already closes it on Escape or an outside press. On close, drop focus
  // if the search input still holds it: a backdrop tap or "Back to the
  // glass" does not move focus on iOS, so without this the keyboard stays
  // up over the ladder with focus parked in the aria-hidden, off-screen
  // sheet.
  useEffect(() => {
    if (isPopover) return;
    if (!open) {
      const el = inputRef.current;
      if (el && document.activeElement === el) el.blur();
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, inputRef, isPopover]);

  const hasQuery = query.trim().length > 0;

  // Function mode shows its results (bucketed by `group`); until they arrive
  // the static groups stand in, so the sheet is never blank on open.
  const shown: PickerGroup[] = serverSearch
    ? results.length > 0 || hasQuery
      ? bucket(results)
      : groups
    : groups;
  const totalOptions = shown.reduce((n, g) => n + g.options.length, 0);
  // cmdk hides a group with no items, so a group that exists only to carry
  // a note ("Guess the region first…") surfaces it through the empty state.
  const emptyNote = totalOptions === 0 ? shown.map((g) => g.note).filter(Boolean).join(" ") : "";
  const emptyText = pending
    ? serverSearch
      ? "Searching…"
      : "Loading…"
    : emptyNote
      ? emptyNote
      : serverSearch && !hasQuery
        ? "Type to search…"
        : hasQuery
          ? "No matches."
          : "Nothing to pick from yet.";

  // The rest/catch-all group every caller (guess-ladder.tsx, match-ladder.tsx)
  // literally heads "Everything else". Detected by that exact text rather
  // than a shared export: on the popover it renders two columns wide
  // (PLAY-31) and, once `totalCount` is given, its heading gains the count
  // (S9's "Everything else · all {n}").
  const REST_HEADING = "Everything else";
  const decoratedGroups = shown.map((group) => {
    const isRest = group.heading === REST_HEADING;
    return {
      ...group,
      heading: isRest && totalCount !== undefined ? everythingElseHeading(totalCount) : group.heading,
      isRest,
    };
  });

  const resolvedPlaceholder =
    totalCount !== undefined
      ? computeSearchPlaceholder(field, totalCount, { phone: !isPopover })
      : searchPlaceholderProp;

  // cmdk's filter is a fuzzy subsequence scorer over value + keywords, so in
  // client mode the filterable string is the bare name (an embedded uuid let
  // "ca", "de" or "2" match every row). cmdk also keys items by value, so a
  // repeated name gets a zero-width-space suffix — untypeable, so the scorer
  // never matches on it — rather than the id.
  const seenNames = new Map<string, number>();
  const itemValue = (option: PickerOption): string => {
    if (serverSearch) return option.id;
    const n = seenNames.get(option.name) ?? 0;
    seenNames.set(option.name, n + 1);
    return n === 0 ? option.name : option.name + "​".repeat(n);
  };

  if (!mounted || typeof document === "undefined") return null;

  // Shared between both presentations: the search field and the result
  // list. Rendered once so a row's often-guessed suffix, the rest group's
  // two-column layout and the reset-on-open-change behaviour never drift
  // between the sheet and the popover.
  const resultsBody = (
    <Command
      shouldFilter={!serverSearch}
      className="h-auto min-h-0 flex-1 rounded-none! bg-transparent p-0"
    >
      {/* The search field sits in the header band. CommandInput forces
          its InputGroup to h-8 / rounded-lg / border-input/30 / bg-input/30
          (a 32px translucent palette field), so the 6f values — a solid
          surface, 1px border, 10px radius, 44px tap height, 12px inset —
          are re-imposed from here through slot-targeted overrides. 16px
          text on phones keeps iOS from zooming on focus; 14px from md as
          drawn. */}
      <div className="shrink-0 border-b border-border bg-card px-4 pt-2 pb-[10px] [&_[data-slot=command-input-wrapper]]:p-0 [&_[data-slot=input-group]]:h-11! [&_[data-slot=input-group]]:rounded-[10px]! [&_[data-slot=input-group]]:border-border! [&_[data-slot=input-group]]:bg-card! [&_[data-slot=input-group]]:shadow-none! [&_[data-slot=input-group-addon]]:pl-3! [&_[data-slot=input-group-addon]]:text-muted-foreground [&_[data-slot=input-group-addon]_svg]:opacity-100">
        <CommandInput
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          placeholder={resolvedPlaceholder}
          tabIndex={open ? 0 : -1}
          className="pr-3 text-base placeholder:text-muted-foreground md:text-[14px]"
        />
      </div>

      <CommandList className="min-h-0 max-h-none flex-1 overscroll-contain">
        <CommandEmpty className="px-4 text-muted-foreground">{emptyText}</CommandEmpty>

        {decoratedGroups.map((group, i) => (
          <CommandGroup
            key={`${group.heading ?? "ungrouped"}-${i}`}
            className={cn(
              "p-0 **:[[cmdk-group-heading]]:p-0",
              isPopover &&
                group.isRest &&
                "**:[[cmdk-group-items]]:grid **:[[cmdk-group-items]]:grid-cols-2 **:[[cmdk-group-items]]:gap-x-3",
            )}
            heading={
              group.heading || group.note ? (
                <span
                  className={cn(
                    "flex items-center gap-2 px-4 pt-[11px] pb-[7px]",
                    i > 0 && "border-t border-border-light bg-background",
                  )}
                >
                  {group.heading ? (
                    <Eyebrow size="sm">{group.heading}</Eyebrow>
                  ) : null}
                  {group.note ? (
                    <span className="text-[11px] text-muted-foreground">
                      {group.note}
                    </span>
                  ) : null}
                </span>
              ) : undefined
            }
          >
            {group.options.map((option) => {
              const selected = option.id === value;
              const sub = withOftenSuffix(option.sub, oftenIds?.has(option.id) ?? false);
              return (
                <CommandItem
                  key={option.id}
                  value={itemValue(option)}
                  keywords={serverSearch ? undefined : [deaccent(option.name)]}
                  onSelect={() => onPick(option.id)}
                  className={cn(
                    "min-h-11 cursor-pointer gap-[11px] rounded-none border-t border-border-light px-4 py-[13px] text-[15.5px] data-selected:bg-muted/60 [&>svg:last-child]:hidden md:hover:bg-background",
                    selected && "bg-gold/10",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span
                      className={cn(
                        "truncate",
                        (sub || selected) && "font-semibold",
                      )}
                    >
                      {option.name}
                    </span>
                    {sub ? (
                      <span className="truncate text-[11.5px] text-muted-foreground">
                        {sub}
                      </span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "border-[1.5px] border-border",
                    )}
                  >
                    {selected ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );

  // Shared footer, as shipped: "Not sure — skip it" · "Next: {field} →". The
  // match ladder passes skipLabel={null} (every glass must be matched before
  // it can lock), which drops the skip button and lets Next take the row.
  const footer = (
    <div className="flex shrink-0 items-center gap-[10px] border-t border-border bg-background px-4 pt-[11px] pb-[max(22px,env(safe-area-inset-bottom))] md:pb-[14px]">
      {skipLabel !== null ? (
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={() => onPick(null)}
          className="flex min-h-11 flex-1 items-center text-left text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {skipLabel}
        </button>
      ) : null}
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        onClick={onNext}
        className={cn(
          "flex min-h-11 items-center justify-center rounded-[11px] bg-primary px-[22px] py-[13px] text-[15px] font-semibold text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors hover:bg-primary-hover",
          // No skip button (the match ladder): Next takes the full width.
          skipLabel === null && "flex-1",
        )}
      >
        {nextLabel}
      </button>
    </div>
  );

  if (isPopover) {
    return createPortal(
      <PopoverPrimitive.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        modal={false}
      >
        <PopoverPrimitive.Portal keepMounted>
          <PopoverPrimitive.Positioner
            anchor={anchorRef}
            positionMethod="fixed"
            side="bottom"
            align="start"
            sideOffset={10}
            collisionPadding={16}
            className="z-50"
          >
            <PopoverPrimitive.Popup
              aria-labelledby={titleId}
              // The ladder already focuses `inputRef` synchronously in the
              // tap that opens the picker (the combobox rule) — base-ui's
              // own default initial focus would otherwise land on the
              // header's Skip button, the first tabbable element here.
              // finalFocus is likewise left to the caller: `onClose` is
              // what returns focus to the row (rowRefs, guess-ladder.tsx).
              initialFocus={false}
              finalFocus={false}
              data-live={dark ? "" : undefined}
              className={cn(
                "flex max-h-[75vh] w-[520px] flex-col overflow-hidden rounded-2xl bg-card shadow-[0_12px_32px_rgba(42,33,30,.22)] ring-1 ring-foreground/10 outline-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
                dark && "dark",
              )}
            >
              <div className="flex shrink-0 items-center gap-[9px] border-b border-border px-4 py-[13px]">
                <h2 id={titleId} className="font-heading text-[19px] font-semibold">
                  {title}
                </h2>
                <span className="flex items-center gap-[5px] rounded-full border border-gold bg-gold/15 px-[9px] py-[3px] text-[11px] font-bold text-primary dark:text-foreground lining-nums tabular-nums">
                  {points} {points === 1 ? "pt" : "pts"}
                </span>
                {skipLabel !== null ? (
                  <button
                    type="button"
                    onClick={() => onPick(null)}
                    className="ml-auto min-h-9 px-1 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Skip
                  </button>
                ) : null}
              </div>

              {resultsBody}
              {footer}
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>,
      document.body,
    );
  }

  return createPortal(
    <div
      data-live={dark ? "" : undefined}
      className={cn("fixed inset-0 z-50", !open && "pointer-events-none", dark && "dark")}
      aria-hidden={!open}
    >
      {open ? (
        <button
          type="button"
          aria-label="Close"
          tabIndex={-1}
          onClick={onClose}
          className="animate-in fade-in absolute inset-0 bg-black/45 duration-150"
        />
      ) : null}

      <div
        role="dialog"
        aria-modal={open}
        aria-labelledby={titleId}
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[22px] bg-card shadow-[0_-8px_24px_rgba(42,33,30,.18)] transition-transform duration-200 ease-out",
          "md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[480px] md:max-h-[80vh] md:rounded-2xl md:ring-1 md:ring-foreground/10 md:-translate-x-1/2",
          open ? "translate-y-0 md:-translate-y-1/2" : "translate-y-full md:translate-y-[120vh]",
        )}
      >
        {/* Header: drag-handle pill, title + points pill, search. */}
        <div className="flex shrink-0 flex-col gap-[11px] border-b border-border px-4 pt-3 pb-[10px]">
          <span
            aria-hidden
            className="h-1 w-[38px] self-center rounded-full bg-border md:hidden"
          />
          <div className="flex items-baseline gap-[9px]">
            <h2 id={titleId} className="font-heading text-[22px] font-semibold">
              {title}
            </h2>
            <span className="ml-auto flex items-center gap-[5px] rounded-full border border-gold bg-gold/15 px-[9px] py-[3px] text-[11px] font-bold text-primary dark:text-foreground lining-nums tabular-nums">
              {points} {points === 1 ? "pt" : "pts"}
            </span>
          </div>
        </div>

        {resultsBody}
        {footer}
      </div>
    </div>,
    document.body,
  );
}

function subscribeNoop() {
  return () => {};
}

// Bucket consecutive results by their group label, preserving order (the
// same rule SearchableCombobox uses for its "Specific to {region}" split).
function bucket(results: PickerOption[]): PickerGroup[] {
  const out: PickerGroup[] = [];
  for (const option of results) {
    const last = out[out.length - 1];
    if (last && last.heading === option.group) last.options.push(option);
    else out.push({ heading: option.group, options: [option] });
  }
  return out;
}

// Appends ladder-copy's OFTEN_SUFFIX (" · you guess this often") to an
// existing context line, or — for a row with no context line of its own
// (plain country/appellation/producer rows carry no `sub`) — shows the
// phrase bare, without OFTEN_SUFFIX's leading " · " separator.
function withOftenSuffix(sub: string | undefined, often: boolean): string | undefined {
  if (!often) return sub;
  return sub ? `${sub}${OFTEN_SUFFIX}` : OFTEN_SUFFIX.replace(/^ · /, "");
}
