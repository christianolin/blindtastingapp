"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";

export type CellarRow = {
  id: string;
  title: string;
  colour: "WHITE" | "ROSE" | "RED";
  style: "STILL" | "SPARKLING" | "FORTIFIED";
  avgScore: number | null;
  noteCount: number;
};

const cap = (s: string) => s[0] + s.slice(1).toLowerCase();

// Iteration 1 keeps search client-side over the loaded page (no server search).
export function CellarList({ rows }: { rows: CellarRow[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((r) => r.title.toLowerCase().includes(needle))
    : rows;

  return (
    <div className="flex flex-col gap-3">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name…" />
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0 ? "No wines in the cellar yet." : "No wines match that filter."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                href={`/cellar/${r.id}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {cap(r.colour)} · {cap(r.style)}
                  </span>
                </span>
                <span className="shrink-0 text-sm">
                  {r.avgScore != null ? (
                    <span className="font-medium">
                      {r.avgScore.toFixed(1)}
                      <span className="text-xs font-normal text-muted-foreground">
                        {" "}· {r.noteCount}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
