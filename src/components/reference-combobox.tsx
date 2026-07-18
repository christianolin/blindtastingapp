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

export type ReferenceOption = { id: string; name: string };

export function ReferenceCombobox({
  formFieldName,
  options,
  value,
  onValueChange,
  onOptionCreated,
  placeholder,
  createLabel,
  onCreate,
  disabled,
  allowClear,
}: {
  formFieldName: string;
  options: ReferenceOption[];
  value: string;
  onValueChange: (id: string) => void;
  onOptionCreated?: (option: ReferenceOption) => void;
  placeholder: string;
  createLabel?: string;
  onCreate?: (name: string) => Promise<ReferenceOption>;
  disabled?: boolean;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.id === value);
  const trimmedSearch = search.trim();

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

  return (
    <>
      <input type="hidden" name={formFieldName} value={value} />
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Focus synchronously, in the same tap/click that opens the
          // popover — on mobile the virtual keyboard only appears when
          // focus() runs inside the original trusted gesture, not after a
          // delay. The popup's content stays mounted (PopoverContent's
          // `keepMounted`) specifically so this input already exists to
          // focus at this exact instant.
          if (next) inputRef.current?.focus();
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
              placeholder={`Search ${(createLabel ?? placeholder).toLowerCase()}…`}
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
              <CommandGroup>
                {allowClear && value ? (
                  <CommandItem value="" onSelect={() => selectOption("")}>
                    <X className="mr-2 size-4" />
                    <span className="text-muted-foreground">Clear</span>
                  </CommandItem>
                ) : null}
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.name}
                    onSelect={() => selectOption(option.id)}
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
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
