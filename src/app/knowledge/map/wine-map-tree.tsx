"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { WinePlaceTreeNode } from "@/lib/wine-map/tree";

// Folder-style hierarchy of every verified place. The selected path is
// auto-expanded and highlighted; searching filters to matches plus their
// ancestors (so a hit is always reachable in context).
export function WineMapTree({
  roots,
  selectedKey,
  onSelect,
}: {
  roots: WinePlaceTreeNode[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Accent- and case-insensitive: "tache" or "TÂCHE" both find La Tâche.
  const fold = (value: string) =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalizedQuery = fold(query.trim());

  // Keys kept by the search: matches plus every ancestor of a match.
  const visibleKeys = useMemo(() => {
    if (!normalizedQuery) return null;
    const keep = new Set<string>();
    const walk = (node: WinePlaceTreeNode, ancestors: string[]) => {
      if (fold(node.name).includes(normalizedQuery)) {
        keep.add(node.key);
        for (const ancestor of ancestors) keep.add(ancestor);
      }
      for (const child of node.children) walk(child, [...ancestors, node.key]);
    };
    for (const root of roots) walk(root, []);
    return keep;
  }, [roots, normalizedQuery]);

  const selectedPath = useMemo(() => {
    const path = new Set<string>();
    if (!selectedKey) return path;
    const segments = selectedKey.split(".");
    for (let i = 1; i <= segments.length; i += 1) {
      path.add(segments.slice(0, i).join("."));
    }
    return path;
  }, [selectedKey]);

  // Map -> tree alignment: whenever the selection changes (e.g. a map click
  // on Saint-Julien), scroll the selected row into view. Expansion of the
  // path is derived below, so the row is guaranteed to be rendered.
  const selectedRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);

  const renderNode = (node: WinePlaceTreeNode, depth: number) => {
    if (visibleKeys && !visibleKeys.has(node.key)) return null;
    const isSelected = node.key === selectedKey;
    const onSelectedPath = selectedPath.has(node.key);
    // Search results render expanded; the selected path is ALWAYS expanded so
    // the map and tree stay aligned (a map click reveals its tree row even if
    // an ancestor was manually collapsed); everything else honours the manual
    // toggle (collapsed by default below tier 1).
    const isCollapsed = visibleKeys
      ? false
      : onSelectedPath
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
              aria-label={isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
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
            title={node.name}
          >
            {node.name}
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
      <label className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search regions, appellations…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      <ul className="min-h-0 flex-1 overflow-y-auto pr-1">
        {roots.map((root) => renderNode(root, 0))}
        {visibleKeys && visibleKeys.size === 0 ? (
          <li className="px-1.5 py-2 text-sm text-muted-foreground">
            No places match &ldquo;{query.trim()}&rdquo;.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
