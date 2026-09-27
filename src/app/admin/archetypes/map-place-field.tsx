"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { searchPlaces, type PlaceHit } from "./actions";
import { EDITOR_COPY } from "./editor-copy";

type Place = { id: string; name: string };

// The optional map place (training-room D9): the chosen place as a chip, and a
// debounced name search over the map. Moved from the old archetype-editor.tsx:
// only the newest search may land, and a failed one shows nothing.
export function MapPlaceField({
  value,
  onChange,
  labelledBy,
}: {
  value: Place | null;
  onChange: (place: Place | null) => void;
  labelledBy: string;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by every keystroke and pick: only the newest search may land.
  const request = useRef(0);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Cancels the pending search and drops any reply still on its way.
  function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    request.current += 1;
  }

  function search(next: string) {
    setQuery(next);
    stop();
    if (next.trim().length < 2) {
      setHits([]);
      return;
    }
    const mine = request.current;
    timer.current = setTimeout(() => {
      timer.current = null;
      searchPlaces(next)
        .then((found) => {
          if (mine === request.current) setHits(found);
        })
        .catch(() => {
          // A failed search shows nothing; it never reopens a closed list.
          if (mine === request.current) setHits([]);
        });
    }, 250);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[12.5px] text-foreground">
          {value.name || value.id}
          <button
            type="button"
            aria-label={EDITOR_COPY.removePlace}
            onClick={() => onChange(null)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground md:pointer-fine:min-h-0 md:pointer-fine:min-w-0 md:pointer-fine:p-1.5"
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ) : (
        <span className="text-[12px] text-muted-foreground">{EDITOR_COPY.mapPlaceNone}</span>
      )}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder={EDITOR_COPY.mapPlaceSearch}
          aria-labelledby={labelledBy}
          // 16 px text below md, so iOS does not zoom into the focused field.
          className="min-h-11 w-56 rounded-[10px] border border-border bg-card px-3 py-2 text-base text-foreground md:text-[13px] md:pointer-fine:min-h-0"
        />
        {hits.length > 0 ? (
          <div className="absolute z-10 mt-1 max-h-64 w-72 overflow-auto rounded-[10px] border border-border bg-popover shadow-md">
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  stop();
                  onChange({ id: h.id, name: h.name });
                  setQuery("");
                  setHits([]);
                }}
                className="flex min-h-11 w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-muted md:pointer-fine:min-h-0"
              >
                <span className="truncate">{h.name}</span>
                <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">{h.kind}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
