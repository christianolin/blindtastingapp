"use client";

import { useRef, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type TypeDesignationOption = {
  id: string;
  name: string;
  category: string | null;
  country_id: string | null;
};

function groupByCategory(items: TypeDesignationOption[]) {
  const groups: { category: string; items: TypeDesignationOption[] }[] = [];
  const indexByCategory = new Map<string, number>();
  for (const item of items) {
    const cat = item.category ?? "Other";
    let i = indexByCategory.get(cat);
    if (i === undefined) {
      i = groups.length;
      indexByCategory.set(cat, i);
      groups.push({ category: cat, items: [] });
    }
    groups[i].items.push(item);
  }
  return groups;
}

/**
 * Type-designation picker: a searchable dropdown grouped by `category`
 * (Prädikat, Quality Classification, …). When a country is already chosen for
 * the wine, that country's designations are surfaced in a "For {country}"
 * group at the top — without hiding any of the others (they stay under their
 * category headings). Options are expected pre-sorted by sort_order, so
 * categories and items keep their intended order. The host form passes
 * `onCreate` to add a new designation inline; the guess form doesn't.
 */
export function TypeDesignationField({
  formFieldName,
  options,
  value,
  onValueChange,
  priorityCountryId,
  priorityCountryName,
  placeholder = "None",
  allowClear = true,
  onCreate,
  onOptionCreated,
}: {
  formFieldName: string;
  options: TypeDesignationOption[];
  value: string;
  onValueChange: (id: string) => void;
  priorityCountryId?: string;
  priorityCountryName?: string;
  placeholder?: string;
  allowClear?: boolean;
  onCreate?: (name: string) => Promise<TypeDesignationOption>;
  onOptionCreated?: (option: TypeDesignationOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.id === value);
  const trimmedSearch = search.trim();

  const priorityItems = priorityCountryId
    ? options.filter((o) => o.country_id === priorityCountryId)
    : [];
  const rest = priorityCountryId
    ? options.filter((o) => o.country_id !== priorityCountryId)
    : options;
  const restGroups = groupByCategory(rest);

  function selectOption(id: string) {
    onValueChange(id);
    setOpen(false);
    setSearch("");
  }

  function createOption() {
    if (!onCreate || !trimmedSearch) return;
    startTransition(async () => {
      const created = await onCreate(trimmedSearch);
      onOptionCreated?.(created);
      selectOption(created.id);
    });
  }

  const renderItem = (o: TypeDesignationOption) => (
    <CommandItem
      key={o.id}
      value={`${o.name} ${o.category ?? ""}`}
      onSelect={() => selectOption(o.id)}
    >
      <Check
        className={cn("mr-2", o.id === value ? "opacity-100" : "opacity-0")}
      />
      {o.name}
    </CommandItem>
  );

  return (
    <>
      <input type="hidden" name={formFieldName} value={value} />
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Focus synchronously in the same tap/click — see popover.tsx's
          // `keepMounted` comment for why this needs to happen here rather
          // than after the open animation completes.
          if (next) inputRef.current?.focus();
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="w-full justify-between font-normal"
            />
          }
        >
          {selected ? (
            selected.name
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-(--anchor-width) p-0">
          <Command>
            <CommandInput
              ref={inputRef}
              placeholder="Search designations…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {onCreate && trimmedSearch ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={createOption}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <Plus className="size-4" />
                    Add &quot;{trimmedSearch}&quot;
                  </button>
                ) : (
                  <span className="text-muted-foreground">No results.</span>
                )}
              </CommandEmpty>

              {allowClear && value ? (
                <CommandGroup>
                  <CommandItem value="__clear__" onSelect={() => selectOption("")}>
                    <X className="mr-2 size-4" />
                    <span className="text-muted-foreground">None</span>
                  </CommandItem>
                </CommandGroup>
              ) : null}

              {priorityItems.length > 0 ? (
                <CommandGroup
                  heading={
                    priorityCountryName
                      ? `For ${priorityCountryName}`
                      : "Suggested"
                  }
                >
                  {priorityItems.map(renderItem)}
                </CommandGroup>
              ) : null}

              {restGroups.map((g) => (
                <CommandGroup key={g.category} heading={g.category}>
                  {g.items.map(renderItem)}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
