import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

// A search input with a leading magnifying glass — the common filter-bar field.
export function SearchInput({
  name,
  placeholder,
  defaultValue,
  className,
}: {
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="h-10 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      />
    </div>
  );
}

// Row layout: search slot (grows) + filter controls + trailing clear/actions.
export function FilterBar({
  search,
  children,
  trailing,
  className,
}: {
  search?: ReactNode;
  children?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="filter-bar"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {search ? <div className="min-w-56 flex-1">{search}</div> : null}
      {children}
      {trailing ? <div className="ml-auto">{trailing}</div> : null}
    </div>
  );
}
