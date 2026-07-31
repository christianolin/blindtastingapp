"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Wine, Star, ChevronsUpDown, ArrowUp, ArrowDown, Search, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { CountryFlag } from "@/components/country-flag";

export type CatalogRow = {
  id: string;
  title: string;
  colour: "WHITE" | "ROSE" | "RED" | "ORANGE" | null;
  style: "STILL" | "SPARKLING" | "FORTIFIED" | "SWEET" | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  grapes: string[];
  vintage: string;
  imageUrl: string | null;
  avgScore: number | null;
  noteCount: number;
  addedAt: string;
};

const cap = (s: string) => s[0] + s.slice(1).toLowerCase();
const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const ALL = "__all__";
const selectCls =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground";
const PAGE = 20;

type SortKey = "title" | "region" | "country" | "vintage" | "avgScore" | "noteCount" | "added";

export function CatalogList({ rows }: { rows: CatalogRow[] }) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState(ALL);
  const [region, setRegion] = useState(ALL);
  const [colour, setColour] = useState(ALL);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "title",
    dir: "asc",
  });
  const [page, setPage] = useState(1);

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
  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      if (country !== ALL && r.country !== country) return false;
      if (region !== ALL && r.region !== region) return false;
      if (colour !== ALL && r.colour !== colour) return false;
      if (needle) {
        const hay = fold(
          [r.title, r.country, r.region, r.appellation, ...r.grapes]
            .filter(Boolean)
            .join(" "),
        );
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const cmp = (a: CatalogRow, b: CatalogRow) => {
      switch (sort.key) {
        case "avgScore":
          return ((a.avgScore ?? -1) - (b.avgScore ?? -1)) * dir;
        case "noteCount":
          return (a.noteCount - b.noteCount) * dir;
        case "vintage":
          return a.vintage.localeCompare(b.vintage) * dir;
        case "region":
          return (a.region ?? "").localeCompare(b.region ?? "") * dir;
        case "country":
          return (a.country ?? "").localeCompare(b.country ?? "") * dir;
        case "added":
          return a.addedAt.localeCompare(b.addedAt) * dir;
        default:
          return a.title.localeCompare(b.title) * dir;
      }
    };
    return [...list].sort(cmp);
  }, [rows, country, region, colour, needle, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * PAGE, clampedPage * PAGE);
  const hasFilter = q !== "" || country !== ALL || region !== ALL || colour !== ALL;

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  };
  const sortIcon = (k: SortKey) =>
    sort.key !== k ? (
      <ChevronsUpDown className="size-3.5 opacity-40" />
    ) : sort.dir === "asc" ? (
      <ArrowUp className="size-3.5" />
    ) : (
      <ArrowDown className="size-3.5" />
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by wine name, producer, region, grape…"
            className="w-full pl-9"
          />
        </div>
        <select
          className={selectCls}
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setRegion(ALL);
            setPage(1);
          }}
        >
          <option value={ALL}>All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={region}
          onChange={(e) => {
            setRegion(e.target.value);
            setPage(1);
          }}
        >
          <option value={ALL}>All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={colour}
          onChange={(e) => {
            setColour(e.target.value);
            setPage(1);
          }}
        >
          <option value={ALL}>All colours / styles</option>
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
              setPage(1);
            }}
            className="text-sm font-medium text-primary hover:text-primary/80"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 lg:hidden">
        {pageRows.map((r) => (
          <Link
            key={r.id}
            href={`/catalog/${r.id}`}
            className="flex items-center gap-3 rounded-xl border border-border p-3"
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
              <span className="block truncate font-medium">{r.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {r.country ? <CountryFlag name={r.country} className="mr-1" /> : null}
                {[r.region, r.country].filter(Boolean).join(" · ") || "—"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {[r.colour && cap(r.colour), r.style && cap(r.style), r.vintage]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="block truncate text-[0.7rem] text-muted-foreground/80">
                Added {fmtDate(r.addedAt)}
              </span>
            </span>
            <span className="shrink-0 text-right text-sm">
              {r.avgScore != null ? (
                <span className="inline-flex items-center gap-1 font-medium text-gold-deep">
                  <Star className="size-3.5" />
                  {r.avgScore.toFixed(1)}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
              <span className="block text-xs text-muted-foreground">{r.noteCount} notes</span>
            </span>
          </Link>
        ))}
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "No wines in the catalog yet."
              : "No wines match those filters."}
          </p>
        ) : null}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-border lg:block">
        <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                <Th onClick={() => toggleSort("title")}>Wine {sortIcon("title")}</Th>
                <Th onClick={() => toggleSort("region")}>Region {sortIcon("region")}</Th>
                <Th onClick={() => toggleSort("country")}>Country {sortIcon("country")}</Th>
                <Th>Grapes</Th>
                <Th onClick={() => toggleSort("vintage")}>Vintage {sortIcon("vintage")}</Th>
                <Th align="right" onClick={() => toggleSort("avgScore")}>
                  Avg score {sortIcon("avgScore")}
                </Th>
                <Th align="right" onClick={() => toggleSort("noteCount")}>
                  Notes {sortIcon("noteCount")}
                </Th>
                <Th align="right" onClick={() => toggleSort("added")}>
                  Added {sortIcon("added")}
                </Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Link href={`/catalog/${r.id}`} className="flex items-center gap-3">
                      {r.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.imageUrl}
                          alt=""
                          className="size-10 shrink-0 rounded-md border border-border object-cover"
                        />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                          <Wine className="size-4" />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {r.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[r.colour && cap(r.colour), r.style && cap(r.style)]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.region ?? "—"}
                    {r.appellation ? (
                      <span className="block text-xs">{r.appellation}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.country ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CountryFlag name={r.country} />
                        {r.country}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.grapes.length ? r.grapes.slice(0, 3).join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.vintage}</td>
                  <td className="px-4 py-3 text-right">
                    {r.avgScore != null ? (
                      <span className="inline-flex items-center gap-1 font-medium text-gold-deep">
                        <Star className="size-3.5" />
                        {r.avgScore.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {r.noteCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                    {fmtDate(r.addedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "No wines in the catalog yet."
              : "No wines match those filters."}
          </div>
        ) : null}
      </div>

      {filtered.length > 0 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(clampedPage - 1) * PAGE + 1} to{" "}
            {Math.min(clampedPage * PAGE, filtered.length)} of {filtered.length} wines
          </span>
          {pageCount > 1 ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous page"
                disabled={clampedPage <= 1}
                onClick={() => setPage(clampedPage - 1)}
                className="inline-flex size-8 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <select
                aria-label="Go to page"
                value={clampedPage}
                onChange={(e) => setPage(Number(e.target.value))}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                  <option key={p} value={p}>
                    Page {p} of {pageCount}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Next page"
                disabled={clampedPage >= pageCount}
                onClick={() => setPage(clampedPage + 1)}
                className="inline-flex size-8 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Th({
  children,
  onClick,
  align,
}: {
  children: ReactNode;
  onClick?: () => void;
  align?: "right";
}) {
  return (
    <th className={cn("px-4 py-3 font-medium", align === "right" && "text-right")}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground",
            align === "right" && "flex-row-reverse",
          )}
        >
          {children}
        </button>
      ) : (
        children
      )}
    </th>
  );
}