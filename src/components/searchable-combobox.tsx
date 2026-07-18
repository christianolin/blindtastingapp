"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Plus, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

// `group` is an optional heading label — consecutive results sharing one
// render under a CommandGroup heading (the producer field's "Specific to
// {region}" / "Other producers" split). Results without a group render as
// today's flat list, so callers like the appellation field are unaffected.
export type SearchOption = { id: string; name: string; group?: string };

// For reference tables too large to preload (thousands of appellations,
// tens of thousands of producers after the LWIN import) — queries the
// database as the user types instead of filtering a client-side list.
// ReferenceCombobox (the preloaded-list sibling) stays in use for the small
// tables (countries, regions, grapes, type designations).
export function SearchableCombobox({
  formFieldName,
  value,
  selectedLabel,
  onValueChange,
  search,
  placeholder,
  createLabel,
  onCreate,
  disabled,
  allowClear,
  emptyQueryHint,
}: {
  formFieldName: string;
  value: string;
  selectedLabel: string | null;
  onValueChange: (id: string, label: string) => void;
  search: (query: string) => Promise<SearchOption[]>;
  placeholder: string;
  createLabel?: string;
  onCreate?: (name: string) => Promise<SearchOption>;
  disabled?: boolean;
  allowClear?: boolean;
  /** Shown under instant (empty-query) results, e.g. "Type to search all producers". */
  emptyQueryHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchOption[]>([]);
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // No debounce for the initial empty query — the instant first page (a
    // region's producers) should appear the moment the dropdown opens.
    const delay = query.trim() ? 250 : 0;
    debounceRef.current = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      startTransition(async () => {
        const found = await search(query);
        if (requestId === requestIdRef.current) setResults(found);
      });
    }, delay);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  function select(option: SearchOption) {
    onValueChange(option.id, option.name);
    setOpen(false);
    setQuery("");
  }

  function createOption() {
    if (!onCreate || !query.trim()) return;
    setCreating(true);
    startTransition(async () => {
      const created = await onCreate(query.trim());
      setCreating(false);
      select(created);
    });
  }

  // Bucket consecutive results by their group label, preserving order.
  const grouped: { heading: string | undefined; options: SearchOption[] }[] = [];
  for (const option of results) {
    const last = grouped[grouped.length - 1];
    if (last && last.heading === option.group) {
      last.options.push(option);
    } else {
      grouped.push({ heading: option.group, options: [option] });
    }
  }

  const hasQuery = query.trim().length > 0;

  return (
    <>
      <input type="hidden" name={formFieldName} value={value} />
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setQuery("");
            // Focus synchronously, in the same tap/click that opens the
            // popover — mobile only pops the virtual keyboard when focus()
            // runs inside the original trusted gesture. PopoverContent's
            // `keepMounted` keeps this input in the DOM at all times so
            // there's always something to focus at this exact instant.
            inputRef.current?.focus();
          }
        }}
      >
        <PopoverTrigger
          disabled={disabled}
          render={
            <Button
              variant="outline"
              className="w-full justify-between font-normal"
            />
          }
        >
          {selectedLabel ? (
            selectedLabel
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-(--anchor-width) p-0">
          <Command shouldFilter={false}>
            <div className="p-1 pb-0">
              <InputGroup className="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none!">
                <InputGroupInput
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${(createLabel ?? placeholder).toLowerCase()}…`}
                />
                <InputGroupAddon>
                  <SearchIcon className="size-4 shrink-0 opacity-50" />
                </InputGroupAddon>
              </InputGroup>
            </div>
            <CommandList>
              {allowClear && value ? (
                <CommandGroup>
                  <CommandItem value="__clear__" onSelect={() => select({ id: "", name: "" })}>
                    <span className="text-muted-foreground">— Clear —</span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
              {results.length > 0 ? (
                <>
                  {grouped.map((g, i) => (
                    <CommandGroup key={g.heading ?? `__ungrouped_${i}`} heading={g.heading}>
                      {g.options.map((option) => (
                        <CommandItem
                          key={option.id}
                          value={option.id}
                          onSelect={() => select(option)}
                        >
                          <Check
                            className={cn(
                              "mr-2",
                              option.id === value ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {option.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                  {!hasQuery && emptyQueryHint ? (
                    <p className="px-3 pt-1 pb-2 text-center text-xs text-muted-foreground">
                      {emptyQueryHint}
                    </p>
                  ) : null}
                </>
              ) : !hasQuery ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {pending ? "Loading…" : "Type to search…"}
                </p>
              ) : pending ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Searching…
                </p>
              ) : (
                <CommandEmpty>
                  {onCreate ? (
                    <button
                      type="button"
                      disabled={creating}
                      onClick={createOption}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <Plus className="size-4" />
                      Add &quot;{query.trim()}&quot;
                    </button>
                  ) : (
                    <span className="text-muted-foreground">No results.</span>
                  )}
                </CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
