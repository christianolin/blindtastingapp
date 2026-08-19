"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Search,
} from "lucide-react";
import type { WinePlaceTreeNode } from "@/lib/wine-map/tree";
import { englishName } from "@/lib/wine-map/localize-names";

// Folder-style hierarchy of every verified place. The selected path is
// auto-expanded and highlighted; searching filters to matches plus their
// ancestors (so a hit is always reachable in context).
export function WineMapTree({
  roots,
  selectedKey,
  onSelect,
  filterKeys = null,
  english = false,
}: {
  roots: WinePlaceTreeNode[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Map-filter keys (e.g. the grape filter): when set, the tree shows only
      these places plus their ancestors, mirroring what the map renders. */
  filterKeys?: string[] | null;
  /** English-names toggle: show each node's English exonym (Toscana -> Tuscany)
      where one exists, matching the map. Search still matches either form. */
  english?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // The displayed label follows the English toggle; native where no exonym.
  const label = (node: WinePlaceTreeNode) =>
    english ? englishName(node.name) : node.name;

  // Accent- and case-insensitive: "tache" or "TÂCHE" both find La Tâche.
  const fold = (value: string) =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalizedQuery = fold(query.trim());

  // Keys kept by the search: matches plus every ancestor of a match.
  const searchKeep = useMemo(() => {
    if (!normalizedQuery) return null;
    const keep = new Set<string>();
    const walk = (node: WinePlaceTreeNode, ancestors: string[]) => {
      // Match either the native name or its English exonym, so search works
      // the same whichever label mode is on.
      if (
        fold(node.name).includes(normalizedQuery) ||
        fold(englishName(node.name)).includes(normalizedQuery)
      ) {
        keep.add(node.key);
        for (const ancestor of ancestors) keep.add(ancestor);
      }
      for (const child of node.children) walk(child, [...ancestors, node.key]);
    };
    for (const root of roots) walk(root, []);
    return keep;
  }, [roots, normalizedQuery]);

  // Keys kept by the map filter (grape today): matched places plus their
  // ancestors, so a hit stays reachable through its path even when the
  // ancestor itself doesn't match (Loire stays on the way to Sancerre under
  // a Pinot Noir filter).
  const filterKeep = useMemo(() => {
    if (!filterKeys) return null;
    const matches = new Set(filterKeys);
    const keep = new Set<string>();
    const walk = (node: WinePlaceTreeNode, ancestors: string[]) => {
      if (matches.has(node.key)) {
        keep.add(node.key);
        for (const ancestor of ancestors) keep.add(ancestor);
      }
      for (const child of node.children) walk(child, [...ancestors, node.key]);
    };
    for (const root of roots) walk(root, []);
    return keep;
  }, [roots, filterKeys]);

  // Search and map filter must both agree when both are active; ancestors of
  // a doubly-matching node sit in both keeps, so its path survives the
  // intersection.
  const visibleKeys = useMemo(() => {
    if (searchKeep && filterKeep) {
      return new Set([...searchKeep].filter((key) => filterKeep.has(key)));
    }
    return searchKeep ?? filterKeep;
  }, [searchKeep, filterKeep]);

  // Ancestors come from the tree's parent links, NOT from key segments:
  // canonical keys can skip re-parented levels (a Champagne village's key is
  // france.champagne.ay but its tree parent is the sub-region node), so a
  // dot-split would miss those rows and leave the selection hidden.
  const parentByKey = useMemo(() => {
    const map = new Map<string, string | null>();
    const walk = (node: WinePlaceTreeNode, parent: string | null) => {
      map.set(node.key, parent);
      for (const child of node.children) walk(child, node.key);
    };
    for (const root of roots) walk(root, null);
    return map;
  }, [roots]);

  const selectedPath = useMemo(() => {
    const path = new Set<string>();
    if (!selectedKey) return path;
    for (let key: string | null = selectedKey; key; key = parentByKey.get(key) ?? null) {
      path.add(key);
    }
    return path;
  }, [selectedKey, parentByKey]);

  // Map -> tree alignment: whenever the selection changes (e.g. a map click
  // on Saint-Julien), scroll the selected row into view. Expansion of the
  // path is derived below, so the row is guaranteed to be rendered.
  const selectedRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const row = selectedRowRef.current;
    if (!row) return;
    // Reveal the selected row WITHIN the tree's own scroll area only — never
    // scroll the window. scrollIntoView bubbles to the page, which on mobile
    // jumped the whole screen down to the detail box on a map click.
    let parent = row.parentElement;
    while (parent) {
      const oy = getComputedStyle(parent).overflowY;
      if (
        (oy === "auto" || oy === "scroll") &&
        parent.scrollHeight > parent.clientHeight
      ) {
        break;
      }
      parent = parent.parentElement;
    }
    if (!parent) return;
    const rowRect = row.getBoundingClientRect();
    const parRect = parent.getBoundingClientRect();
    if (rowRect.top < parRect.top) {
      parent.scrollTop -= parRect.top - rowRect.top;
    } else if (rowRect.bottom > parRect.bottom) {
      parent.scrollTop += rowRect.bottom - parRect.bottom;
    }
  }, [selectedKey]);

  // Expand the selected place's ancestors when the selection CHANGES (a map
  // click or tree pick) so its row is revealed — then leave them be. The path
  // is NOT force-expanded on every render, so the user can collapse an
  // ancestor (e.g. Bordeaux) again afterwards (owner: "don't lock it").
  const [expandedForKey, setExpandedForKey] = useState<string | null>(null);
  if (selectedKey && selectedKey !== expandedForKey) {
    setExpandedForKey(selectedKey);
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const key of selectedPath) next[key] = false;
      return next;
    });
  }

  // One-layer expand/collapse across the whole tree: collect the rows that
  // are actually rendered (stop below a collapsed node, respect the map
  // filter), then open the shallowest collapsed ring or close the deepest
  // expanded one. Repeated presses walk the hierarchy one level at a time —
  // the quick way "back up" from a deep dive. Search force-expands every
  // row, so the buttons are disabled while a query is active.
  const collectRenderedParents = () => {
    const out: { key: string; depth: number; isCollapsed: boolean }[] = [];
    const walk = (node: WinePlaceTreeNode, depth: number) => {
      if (visibleKeys && !visibleKeys.has(node.key)) return;
      if (node.children.length === 0) return;
      const isCollapsed = collapsed[node.key] ?? node.tier >= 1;
      out.push({ key: node.key, depth, isCollapsed });
      if (!isCollapsed) for (const child of node.children) walk(child, depth + 1);
    };
    for (const root of roots) walk(root, 0);
    return out;
  };
  const expandOneLayer = () => {
    const rows = collectRenderedParents().filter((row) => row.isCollapsed);
    if (rows.length === 0) return;
    const depth = Math.min(...rows.map((row) => row.depth));
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const row of rows) if (row.depth === depth) next[row.key] = false;
      return next;
    });
  };
  const collapseOneLayer = () => {
    const rows = collectRenderedParents().filter((row) => !row.isCollapsed);
    if (rows.length === 0) return;
    const depth = Math.max(...rows.map((row) => row.depth));
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const row of rows) if (row.depth === depth) next[row.key] = true;
      return next;
    });
  };

  const renderNode = (node: WinePlaceTreeNode, depth: number) => {
    if (visibleKeys && !visibleKeys.has(node.key)) return null;
    const isSelected = node.key === selectedKey;
    // Search results render expanded; a map filter alone keeps the manual
    // toggles (force-expanding hundreds of grape matches would flood the
    // list). The selected path was expanded once when it was picked (above)
    // — not pinned open.
    const isCollapsed = searchKeep
      ? false
      : (collapsed[node.key] ?? node.tier >= 1);
    const hasVisibleChildren = node.children.length > 0;

    return (
      <li key={node.key}>
        <div
          ref={isSelected ? selectedRowRef : undefined}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-sm ${
            isSelected
              ? "bg-primary/10 font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
        >
          {hasVisibleChildren ? (
            <button
              type="button"
              aria-label={isCollapsed ? `Expand ${label(node)}` : `Collapse ${label(node)}`}
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [node.key]: !isCollapsed }))
              }
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              {isCollapsed ? (
                <ChevronRight className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <button
            type="button"
            onClick={() => onSelect(node.key)}
            className="truncate text-left"
            title={label(node)}
          >
            {label(node)}
          </button>
        </div>
        {hasVisibleChildren && !isCollapsed ? (
          <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border px-2 py-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search regions, appellations…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <button
          type="button"
          aria-label="Expand one level"
          title="Expand one level"
          disabled={Boolean(searchKeep)}
          onClick={expandOneLayer}
          className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronsUpDown className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Collapse one level"
          title="Collapse one level"
          disabled={Boolean(searchKeep)}
          onClick={collapseOneLayer}
          className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronsDownUp className="size-3.5" />
        </button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto pr-1">
        {roots.map((root) => renderNode(root, 0))}
        {visibleKeys && visibleKeys.size === 0 ? (
          <li className="px-1.5 py-2 text-sm text-muted-foreground">
            {normalizedQuery
              ? `No places match "${query.trim()}".`
              : "No places match the map filter."}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
