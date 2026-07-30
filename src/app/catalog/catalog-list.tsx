"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wine } from "lucide-react";
import { Input } from "@/components/ui/input";

export type CatalogRow = {
  id: string;
  title: string;
  colour: "WHITE" | "ROSE" | "RED" | null;
  style: "STILL" | "SPARKLING" | "FORTIFIED" | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  imageUrl: string | null;
  avgScore: number | null;
  noteCount: number;
};

const cap = (s: string) => s[0] + s.slice(1).toLowerCase();
// Diacritic-insensitive so "cha" matches "Châteauneuf", "rose" matches "Rosé".
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const ALL = "__all__";
const selectCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground";

export function CatalogList({ rows }: { rows: CatalogRow[] }) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState(ALL);
  const [region, setRegion] = useState(ALL);
  const [colour, setColour] = useState(ALL);

  const countries = useMemo(
    () => [...new Set(rows.map((r) => r.country).filter(Boolean) as string[])].sort(),
    [rows],
  );
  const regions = useMemo(
    () =>
      [
        ...new Set(
          rows
            .filter((r) => country === ALL || r.country === country)
            .map((r) => r.region)
            .filter(Boolean) as string[],
        ),
      ].sort(),
    [rows, country],
  );
  const colours = useMemo(
    () => [...new Set(rows.map((r) => r.colour).filter(Boolean) as string[])],
    [rows],
  );

  const needle = fold(q.trim());
  const filtered = rows.filter((r) => {
    if (country !== ALL && r.country !== country) return false;
    if (region !== ALL && r.region !== region) return false;
    if (colour !== ALL && r.colour !== colour) return false;
    if (needle) {
      const hay = fold(
        [r.title, r.country, r.region, r.appellation].filter(Boolean).join(" "),
      );
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const hasFilter = q !== "" || country !== ALL || region !== ALL || colour !== ALL;

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, country, region, appellation…"
      />
      <div className="flex flex-wrap gap-2">
        <select
          className={selectCls}
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setRegion(ALL);
          }}
        >
          <option value={ALL}>All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className={selectCls} value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value={ALL}>All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select className={selectCls} value={colour} onChange={(e) => setColour(e.target.value)}>
          <option value={ALL}>All colours</option>
          {colours.map((c) => (
            <option key={c} value={c}>
              {cap(c)}
            </option>
          ))}
        </select>
        {hasFilter ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setCountry(ALL);
              setRegion(ALL);
              setColour(ALL);
            }}
            className="h-9 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted"
          >
            Clear
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0 ? "No wines in the catalog yet." : "No wines match those filters."}
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
                  <span className="block truncate text-xs text-muted-foreground">
                    {[r.country, r.region, r.appellation].filter(Boolean).join(" · ") || "—"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {[r.colour, r.style].filter(Boolean).map((s) => cap(s!)).join(" · ") || "—"}
                  </span>
                </span>
                <span className="shrink-0 text-sm">
                  {r.avgScore != null ? (
                    <span className="font-medium">
                      {r.avgScore.toFixed(1)}
                      <span className="text-xs font-normal text-muted-foreground">
                        {" "}
                        · {r.noteCount}
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
