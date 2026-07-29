"use client";

import { useState } from "react";
import Link from "next/link";
import { Wine } from "lucide-react";
import { Input } from "@/components/ui/input";

export type CatalogRow = {
  id: string;
  title: string;
  colour: "WHITE" | "ROSE" | "RED" | null;
  style: "STILL" | "SPARKLING" | "FORTIFIED" | null;
  imageUrl: string | null;
  avgScore: number | null;
  noteCount: number;
};

const cap = (s: string) => s[0] + s.slice(1).toLowerCase();

export function CatalogList({ rows }: { rows: CatalogRow[] }) {
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
          {rows.length === 0 ? "No wines in the catalog yet." : "No wines match that filter."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                href={`/catalog/${r.id}`}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted"
              >
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.imageUrl}
                    alt=""
                    className="size-11 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                    <Wine className="size-5" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {[r.colour, r.style].filter(Boolean).map((s) => cap(s!)).join(" · ") || "—"}
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
