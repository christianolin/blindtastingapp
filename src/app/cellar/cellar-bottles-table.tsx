"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Wine,
  Star,
  Search,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { CountryFlag } from "@/components/country-flag";
import { AddWineButton } from "@/components/add-wine-button";
import { NoteModal } from "./note-modal";

// One row per cellar lot (a wine can appear in several rows if held in
// different sizes/vintages/locations). Carries everything the table renders so
// search/sort/paging stay client-side and instant.
export type BottleRow = {
  lotId: string;
  catalogWineId: string;
  title: string;
  colour: "WHITE" | "ROSE" | "RED" | "ORANGE" | null;
  grapes: string[];
  region: string | null;
  country: string | null;
  appellation: string | null;
  imageUrl: string | null;
  bottleSizeMl: number;
  quantity: number;
  drinkFrom: number | null;
  drinkTo: number | null;
  storageLocation: string | null;
  /**
   * Effective per-bottle value in the page's display currency, already
   * resolved by the caller: the wine's market estimate first, else the lot's
   * purchase price, null when neither applies. The table never re-derives it,
   * so the row, the sort and the summary total can never disagree.
   */
  valuePerBottle: number | null;
  addedAt: string;
  bestScore: number | null;
  bestNoteId: string | null;
  bestNoteOn: string | null;
};

const cap = (s: string) => s[0] + s.slice(1).toLowerCase();
const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const selectCls =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground";
const ALL = "__all__";

function formatSize(ml: number): string {
  if (ml % 1000 === 0) return `${ml / 1000} L`;
  return `${ml} ml`;
}
function windowLabel(from: number | null, to: number | null): string {
  if (from == null && to == null) return "\u2014";
  return `${from ?? "?"}\u2013${to ?? "?"}`;
}

// The drink window as a decision, not a pair of years: is this bottle ready?
const THIS_YEAR = new Date().getFullYear();
function readiness(from: number | null, to: number | null) {
  if (from == null && to == null)
    return { label: "No window", cls: "border border-dashed border-border text-muted-foreground" };
  if (from != null && THIS_YEAR < from)
    return { label: "Hold", cls: "bg-muted text-muted-foreground" };
  if (to != null && THIS_YEAR > to)
    return { label: "Past peak", cls: "bg-destructive/10 text-destructive" };
  if (to != null && to - THIS_YEAR <= 1)
    return { label: "Drink soon", cls: "bg-amber-100 text-amber-900" };
  return { label: "Ready now", cls: "bg-primary/10 text-primary" };
}
function ReadinessChip({ from, to }: { from: number | null; to: number | null }) {
  const r = readiness(from, to);
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        r.cls,
      )}
    >
      {r.label}
    </span>
  );
}

type SortKey =
  | "wine"
  | "region"
  | "size"
  | "quantity"
  | "window"
  | "value"
  | "score"
  | "added";

const SORT_PRESETS: { label: string; key: SortKey; dir: "asc" | "desc" }[] = [
  { label: "Added (newest)", key: "added", dir: "desc" },
  { label: "Added (oldest)", key: "added", dir: "asc" },
  { label: "Wine A\u2013Z", key: "wine", dir: "asc" },
  { label: "Value (high to low)", key: "value", dir: "desc" },
  { label: "Score (high to low)", key: "score", dir: "desc" },
  { label: "Quantity (high to low)", key: "quantity", dir: "desc" },
];

export function CellarBottlesTable({
  rows,
  currency,
  readOnly = false,
}: {
  rows: BottleRow[];
  currency: string;
  readOnly?: boolean;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "added",
    dir: "desc",
  });
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [openNote, setOpenNote] = useState<{ noteId: string; wineId: string } | null>(
    null,
  );
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [country, setCountry] = useState(ALL);
  const [region, setRegion] = useState(ALL);
  const [colour, setColour] = useState(ALL);
  const [grape, setGrape] = useState(ALL);

  const lotValue = (r: BottleRow) =>
    r.valuePerBottle != null ? r.valuePerBottle * r.quantity : null;

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
  const grapeOptions = useMemo(
    () => [...new Set(rows.flatMap((r) => r.grapes))].sort(),
    [rows],
  );
  const hasFilter =
    country !== ALL || region !== ALL || colour !== ALL || grape !== ALL;

  const needle = fold(q.trim());
  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      if (country !== ALL && r.country !== country) return false;
      if (region !== ALL && r.region !== region) return false;
      if (colour !== ALL && r.colour !== colour) return false;
      if (grape !== ALL && !r.grapes.includes(grape)) return false;
      if (needle) {
        const hay = fold(
          [r.title, r.region, r.country, r.appellation, r.storageLocation, ...r.grapes]
            .filter(Boolean)
            .join(" "),
        );
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (r: BottleRow) =>
      r.valuePerBottle != null ? r.valuePerBottle * r.quantity : -1;
    const cmp = (a: BottleRow, b: BottleRow) => {
      switch (sort.key) {
        case "region":
          return (a.region ?? "").localeCompare(b.region ?? "") * dir;
        case "size":
          return (a.bottleSizeMl - b.bottleSizeMl) * dir;
        case "quantity":
          return (a.quantity - b.quantity) * dir;
        case "window":
          return ((a.drinkFrom ?? 99999) - (b.drinkFrom ?? 99999)) * dir;
        case "value":
          return (val(a) - val(b)) * dir;
        case "score":
          return ((a.bestScore ?? -1) - (b.bestScore ?? -1)) * dir;
        case "added":
          return a.addedAt.localeCompare(b.addedAt) * dir;
        default:
          return a.title.localeCompare(b.title) * dir;
      }
    };
    return [...list].sort(cmp);
  }, [rows, needle, sort, country, region, colour, grape]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * perPage, clampedPage * perPage);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "wine" || key === "region" ? "asc" : "desc" },
    );
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
  const presetIndex = SORT_PRESETS.findIndex(
    (p) => p.key === sort.key && p.dir === sort.dir,
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="font-heading text-lg font-medium">
          {readOnly ? "No bottles to show" : "Your cellar is empty"}
        </p>
        {!readOnly ? (
          <>
            <p className="text-sm text-muted-foreground">
              Add the wines you own to track bottles, drink windows and value.
            </p>
            <AddWineButton
              kind="cellar"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" />
              Add a wine
            </AddWineButton>
          </>
        ) : null}
      </div>
    );
  }

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
            placeholder="Search wines, producers, regions, grapes…"
            className="w-full pl-9"
          />
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
          Sort by
          <select
            className={selectCls}
            value={presetIndex}
            onChange={(e) => {
              const p = SORT_PRESETS[Number(e.target.value)];
              if (p) {
                setSort({ key: p.key, dir: p.dir });
                setPage(1);
              }
            }}
          >
            {presetIndex === -1 ? <option value={-1}>Custom order</option> : null}
            {SORT_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
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
          <option value={ALL}>All colours</option>
          {colours.map((c) => (
            <option key={c} value={c}>
              {cap(c)}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={grape}
          onChange={(e) => {
            setGrape(e.target.value);
            setPage(1);
          }}
        >
          <option value={ALL}>All grapes</option>
          {grapeOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!hasFilter}
          onClick={() => {
            setCountry(ALL);
            setRegion(ALL);
            setColour(ALL);
            setGrape(ALL);
            setPage(1);
          }}
          className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          Clear filters
        </button>
      </div>

      {/* Mobile: a card per row (the wide table only appears at lg+). */}
      <div className="flex flex-col gap-2 lg:hidden">
        {pageRows.map((r) => (
          <div
            key={r.lotId}
            className="flex flex-col gap-2 rounded-xl border border-border p-3"
          >
            <div className="flex items-start gap-3">
              {r.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.imageUrl}
                  alt=""
                  className="size-12 shrink-0 rounded-md border border-border object-cover"
                />
              ) : (
                <span className="flex size-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                  <Wine className="size-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <Link
                  href={`/catalog/${r.catalogWineId}`}
                  className="block truncate font-medium"
                >
                  {r.title}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {r.country ? <CountryFlag name={r.country} className="mr-1" /> : null}
                  {[r.region, r.country].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[r.colour && cap(r.colour), r.grapes.slice(0, 2).join(", ")]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
              {r.bestScore != null ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-gold-deep">
                  <Star className="size-3.5" />
                  {r.bestScore}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                {r.quantity}× {formatSize(r.bottleSizeMl)}
              </span>
              <ReadinessChip from={r.drinkFrom} to={r.drinkTo} />
              {r.drinkFrom != null || r.drinkTo != null ? (
                <span className="tabular-nums">{windowLabel(r.drinkFrom, r.drinkTo)}</span>
              ) : null}
              {r.storageLocation ? <span>{r.storageLocation}</span> : null}
              {lotValue(r) != null ? (
                <span className="tabular-nums">
                  {Math.round(lotValue(r)!).toLocaleString()} {currency}
                </span>
              ) : null}
            </div>
            {!readOnly ? (
            <div className="flex items-center gap-2">
              <Link
                href={`/cellar/${r.lotId}/drink`}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
              >
                <Wine className="size-3.5" /> Drink
              </Link>
              <Link
                href={`/cellar/${r.lotId}/edit`}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
              >
                <Pencil className="size-3.5" /> Edit
              </Link>
              {r.bestNoteId ? (
                <button
                  type="button"
                  onClick={() =>
                    setOpenNote({ noteId: r.bestNoteId!, wineId: r.catalogWineId })
                  }
                  className="rounded-md border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
                >
                  Show note
                </button>
              ) : null}
            </div>
            ) : null}
          </div>
        ))}
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No bottles match your search.
          </p>
        ) : null}
      </div>

      {/* Desktop: full table (scrolls sideways on narrow desktops). */}
      <div className="hidden overflow-x-auto rounded-xl border border-border lg:block">
        <table className="w-full min-w-[56rem] table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-[5rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[7.5rem]" />
            {!readOnly ? <col className="w-[6.5rem]" /> : null}
          </colgroup>
          <thead>
            <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground">
              <Th onClick={() => toggleSort("wine")}>Wine {sortIcon("wine")}</Th>
              <Th align="right" onClick={() => toggleSort("quantity")}>
                Bottles {sortIcon("quantity")}
              </Th>
              <Th onClick={() => toggleSort("window")}>
                Readiness {sortIcon("window")}
              </Th>
              <Th>Location</Th>
              <Th align="right" onClick={() => toggleSort("value")}>
                Value ({currency}) {sortIcon("value")}
              </Th>
              <Th onClick={() => toggleSort("score")}>
                Last note {sortIcon("score")}
              </Th>
              {!readOnly ? <Th align="right">Actions</Th> : null}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const value = lotValue(r);
              return (
                <tr
                  key={r.lotId}
                  className="border-b border-border align-top last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-3">
                    {/* The identity block does the work the dropped columns
                        used to: name, colour+grapes, place, odd formats. */}
                    <Link
                      href={`/catalog/${r.catalogWineId}`}
                      className="flex items-start gap-3"
                    >
                      {r.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.imageUrl}
                          alt=""
                          className="h-14 w-10 shrink-0 rounded-md border border-border object-cover"
                        />
                      ) : (
                        <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                          <Wine className="size-4" />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="line-clamp-2 font-medium text-foreground">
                          {r.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[r.colour && cap(r.colour), r.grapes.slice(0, 3).join(", ")]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.country ? <CountryFlag name={r.country} className="mr-1" /> : null}
                          {[
                            r.appellation && r.appellation !== r.region
                              ? r.appellation
                              : null,
                            r.region,
                            r.country,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {r.quantity}×
                    {r.bottleSizeMl !== 750 ? (
                      <span className="block text-xs text-muted-foreground">
                        {formatSize(r.bottleSizeMl)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <ReadinessChip from={r.drinkFrom} to={r.drinkTo} />
                    {r.drinkFrom != null || r.drinkTo != null ? (
                      <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                        {windowLabel(r.drinkFrom, r.drinkTo)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    <span className="block truncate">{r.storageLocation ?? "—"}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {value != null ? Math.round(value).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-3">
                    {r.bestScore != null ? (
                      <button
                        type="button"
                        disabled={!r.bestNoteId}
                        onClick={() =>
                          r.bestNoteId &&
                          setOpenNote({
                            noteId: r.bestNoteId,
                            wineId: r.catalogWineId,
                          })
                        }
                        className="group flex flex-col items-start text-left"
                      >
                        <span className="inline-flex items-center gap-1 font-medium text-gold-deep">
                          <Star className="size-3.5" />
                          {r.bestScore} pts
                        </span>
                        {r.bestNoteOn ? (
                          <span className="text-xs text-muted-foreground underline-offset-2 group-hover:underline">
                            {new Date(r.bestNoteOn).toLocaleDateString()}
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {!readOnly ? (
                  <td className="px-3 py-3">
                    {/* One primary action; the rest live behind ⋯ so every row
                        isn't a stack of equal-weight buttons. */}
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/cellar/${r.lotId}/drink`}
                        className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        <Wine className="size-3.5" /> Drink
                      </Link>
                      <div className="relative">
                        <button
                          type="button"
                          aria-label="More actions"
                          onClick={() =>
                            setMenuFor(menuFor === r.lotId ? null : r.lotId)
                          }
                          className="flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                        {menuFor === r.lotId ? (
                          <>
                            <button
                              type="button"
                              aria-hidden
                              tabIndex={-1}
                              onClick={() => setMenuFor(null)}
                              className="fixed inset-0 z-10 cursor-default"
                            />
                            <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-popover p-1 text-left shadow-lg">
                              <Link
                                href={`/cellar/${r.lotId}/edit`}
                                onClick={() => setMenuFor(null)}
                                className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted"
                              >
                                <Pencil className="size-3.5" />
                                Edit lot
                              </Link>
                              <Link
                                href={`/catalog/${r.catalogWineId}`}
                                onClick={() => setMenuFor(null)}
                                className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted"
                              >
                                <ExternalLink className="size-3.5" />
                                View wine page
                              </Link>
                              {r.bestNoteId ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuFor(null);
                                    setOpenNote({
                                      noteId: r.bestNoteId!,
                                      wineId: r.catalogWineId,
                                    });
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                                >
                                  <FileText className="size-3.5" />
                                  Show tasting note
                                </button>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No bottles match your search.
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <label className="flex items-center gap-2">
          Wines per page
          <select
            className={selectCls}
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <span>
            {filtered.length === 0
              ? "0 bottles"
              : `${(clampedPage - 1) * perPage + 1}–${Math.min(
                  clampedPage * perPage,
                  filtered.length,
                )} of ${filtered.length}`}
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
      </div>

      {openNote ? (
        <NoteModal
          noteId={openNote.noteId}
          wineId={openNote.wineId}
          onClose={() => setOpenNote(null)}
        />
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
    <th className={cn("px-3 py-3 font-medium", align === "right" && "text-right")}>
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

