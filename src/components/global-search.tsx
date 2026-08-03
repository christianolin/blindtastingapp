"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { glossaryTermTab, systemTab } from "@/lib/designations/tabs";

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
  { kind: "designation", heading: "Classifications & terms" },
];

function hrefFor(h: Hit): string {
  switch (h.kind) {
    case "wine":
      return `/catalog/${h.href_key}`;
    case "place":
      return `/knowledge/map?place=${encodeURIComponent(h.href_key)}`;
    case "grape":
      return `/knowledge/grapes?q=${encodeURIComponent(h.href_key)}`;
    case "designation": {
      const slug = systemTab(h.href_key) ?? glossaryTermTab(h.href_key);
      return `/knowledge/designations${slug ? `?tab=${slug}` : ""}`;
    }
    default:
      return "/catalog";
  }
}

export function GlobalSearch() {
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

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
      setHits((data as Hit[] | null) ?? []);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query, supabase]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (h: Hit) => {
    setOpen(false);
    setQuery("");
    setHits([]);
    router.push(hrefFor(h));
  };

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={rootRef} className="relative w-full">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search wines, regions, producers…"
        className="h-9 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      {showDropdown ? (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-md ring-1 ring-foreground/10">
          {loading && hits.length === 0 ? (
            <p className="px-3 py-2 text-muted-foreground">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2 text-muted-foreground">No results.</p>
          ) : (
            GROUPS.map((g) => {
              const items = hits.filter((h) => h.kind === g.kind);
              if (items.length === 0) return null;
              return (
                <div key={g.kind} className="py-1">
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    {g.heading}
                  </p>
                  {items.map((h) => (
                    <button
                      key={`${h.kind}-${h.id}`}
                      type="button"
                      onClick={() => go(h)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                    >
                      <span className="truncate">{h.label}</span>
                      {h.sublabel ? (
                        <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                          {h.sublabel}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
