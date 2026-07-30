"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type Hit = {
  kind: string;
  id: string;
  label: string;
  sublabel: string | null;
  href_key: string;
};

const GROUPS: { kind: string; heading: string }[] = [
  { kind: "wine", heading: "Wines" },
  { kind: "place", heading: "Regions & places" },
  { kind: "grape", heading: "Grapes" },
  { kind: "producer", heading: "Producers" },
];

function hrefFor(h: Hit): string {
  switch (h.kind) {
    case "wine":
      return `/catalog/${h.href_key}`;
    case "place":
      return `/knowledge/map?place=${encodeURIComponent(h.href_key)}`;
    case "grape":
      return `/knowledge/grapes?q=${encodeURIComponent(h.href_key)}`;
    case "producer":
      return `/catalog?producer=${encodeURIComponent(h.href_key)}`;
    default:
      return "/catalog";
  }
}

export function GlobalSearch() {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_all", { p_query: q, p_limit: 6 });
      if (seq.current !== mine) return;
      setHits(((data as Hit[] | null) ?? []).map((d) => ({ ...d })));
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query, supabase]);

  const go = useCallback(
    (h: Hit) => {
      setOpen(false);
      setQuery("");
      router.push(hrefFor(h));
    },
    [router],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search wines, regions, producers…</span>
        <kbd className="hidden rounded border border-border px-1.5 text-[0.65rem] sm:inline">
          ⌘K
        </kbd>
      </button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Search wines, places, grapes and producers"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search wines, regions, producers…"
          />
          <CommandList>
            {query.trim().length < 2 ? (
              <CommandEmpty>Type at least 2 characters…</CommandEmpty>
            ) : loading && hits.length === 0 ? (
              <CommandEmpty>Searching…</CommandEmpty>
            ) : hits.length === 0 ? (
              <CommandEmpty>No results.</CommandEmpty>
            ) : (
              GROUPS.map((g) => {
                const items = hits.filter((h) => h.kind === g.kind);
                if (items.length === 0) return null;
                return (
                  <CommandGroup key={g.kind} heading={g.heading}>
                    {items.map((h) => (
                      <CommandItem
                        key={`${h.kind}-${h.id}`}
                        value={`${h.kind}-${h.id}-${h.label}`}
                        onSelect={() => go(h)}
                      >
                        <span className="truncate">{h.label}</span>
                        {h.sublabel ? (
                          <span className="ml-auto truncate text-xs text-muted-foreground">
                            {h.sublabel}
                          </span>
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
