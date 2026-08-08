"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  GRAPE_PARENTAGE,
  GRAPE_SYNONYMS,
  GRAPE_MUTATIONS,
  type Confidence,
} from "@/lib/grape-lineage";

// A layered descendant graph. Vertical position is generation depth — ancient
// founder varieties sit at the top, their crosses below — so scrolling down is
// moving forward in time. Parents connect to children with SVG links. It's a
// DAG, not a strict tree (a grape has up to two parents, a parent many
// children), so a child stays visible while any one of its parents is expanded.

const NODE_W = 156;
const NODE_H = 54;
const COL_GAP = 22;
const ROW_GAP = 104;
const TOP_PAD = 40;
const SIDE_PAD = 16;

const CONF_DOT: Record<Confidence, string> = {
  confirmed: "bg-primary",
  probable: "bg-gold",
  unknown: "bg-muted-foreground/40",
};

const ROW_LABEL = (d: number) =>
  d === 0 ? "Founders / ancient" : d === 1 ? "First-generation crosses" : `Generation ${d}`;

export function GrapeLineageTree({
  grapeIds,
  onOpenCard,
}: {
  grapeIds: Record<string, string>;
  onOpenCard: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();

  const model = useMemo(() => {
    const byGrape = new Map(GRAPE_PARENTAGE.map((p) => [p.grape, p]));
    // Every node: grapes we hold facts for, plus any named parent that isn't
    // itself a grape entry (Gouais Blanc, Dureza…) — those are founders.
    const nodeSet = new Set<string>();
    for (const p of GRAPE_PARENTAGE) {
      nodeSet.add(p.grape);
      for (const parent of p.parents) nodeSet.add(parent);
    }
    // Synonyms/mutations are identities, not lineage nodes.
    for (const n of [...nodeSet]) {
      if (GRAPE_SYNONYMS[n] || GRAPE_MUTATIONS[n]) nodeSet.delete(n);
    }

    const parentsOf = (n: string) =>
      (byGrape.get(n)?.parents ?? []).filter((p) => nodeSet.has(p));
    const childrenOf = new Map<string, string[]>();
    for (const n of nodeSet) {
      for (const parent of parentsOf(n)) {
        childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), n]);
      }
    }

    // Structural depth (ignores collapse). Acyclic by construction.
    const depth = new Map<string, number>();
    const computeDepth = (n: string): number => {
      const cached = depth.get(n);
      if (cached != null) return cached;
      const ps = parentsOf(n);
      const d = ps.length ? 1 + Math.max(...ps.map(computeDepth)) : 0;
      depth.set(n, d);
      return d;
    };
    for (const n of nodeSet) computeDepth(n);

    return { byGrape, nodeSet, parentsOf, childrenOf, depth };
  }, []);

  const layout = useMemo(() => {
    const { nodeSet, parentsOf, childrenOf, depth } = model;
    const ordered = [...nodeSet].sort((a, b) => depth.get(a)! - depth.get(b)!);

    // A node shows if it's a founder or any parent is shown AND expanded.
    const visible = new Map<string, boolean>();
    for (const n of ordered) {
      const ps = parentsOf(n);
      visible.set(
        n,
        ps.length === 0
          ? true
          : ps.some((p) => visible.get(p) && !collapsed.has(p)),
      );
    }
    const vis = ordered.filter((n) => visible.get(n)!);

    const maxDepth = Math.max(0, ...vis.map((n) => depth.get(n)!));
    const rows: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
    for (const n of vis) rows[depth.get(n)!].push(n);

    const col = new Map<string, number>();
    const childCount = (n: string) => childrenOf.get(n)?.length ?? 0;
    rows.forEach((row, d) => {
      if (d === 0) {
        row.sort((a, b) => childCount(b) - childCount(a) || a.localeCompare(b));
      } else {
        // Barycentre: sit each node near the average column of its parents.
        const bary = (n: string) => {
          const cols = parentsOf(n)
            .map((p) => col.get(p))
            .filter((c): c is number => c != null);
          return cols.length ? cols.reduce((s, c) => s + c, 0) / cols.length : 0;
        };
        row.sort((a, b) => bary(a) - bary(b) || a.localeCompare(b));
      }
      row.forEach((n, i) => col.set(n, i));
    });

    const maxCols = Math.max(1, ...rows.map((r) => r.length));
    const step = NODE_W + COL_GAP;
    const pos = new Map<string, { x: number; y: number }>();
    rows.forEach((row, d) => {
      const offset = ((maxCols - row.length) * step) / 2;
      row.forEach((n) => {
        pos.set(n, {
          x: SIDE_PAD + offset + col.get(n)! * step,
          y: TOP_PAD + d * ROW_GAP,
        });
      });
    });

    // Edges: parent → child, only where the parent is visible & expanded.
    const edges: { from: string; to: string }[] = [];
    for (const n of vis) {
      for (const p of parentsOf(n)) {
        if (visible.get(p) && !collapsed.has(p)) edges.push({ from: p, to: n });
      }
    }

    const width = SIDE_PAD * 2 + maxCols * step - COL_GAP;
    const height = TOP_PAD + maxDepth * ROW_GAP + NODE_H + TOP_PAD;
    return { rows, pos, edges, width, height, maxDepth };
  }, [model, collapsed]);

  const toggle = (n: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const { byGrape, childrenOf } = model;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        Who descends from whom, by DNA parentage. The higher a grape sits, the
        older it is — ancient founder varieties at the top, their crosses below.
        Collapse a grape to fold away its descendants;{" "}
        <span className="font-medium text-foreground">unknown</span> parentage is
        stated, not hidden.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Highlight a grape"
          className="sm:max-w-xs"
        />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-primary" /> DNA-confirmed
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-gold" /> probable
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-muted-foreground/40" /> unknown
          </span>
        </div>
        {collapsed.size > 0 ? (
          <button
            type="button"
            onClick={() => setCollapsed(new Set())}
            className="text-xs font-medium text-primary hover:underline"
          >
            Expand all
          </button>
        ) : null}
      </div>

      <div className="relative max-h-[70vh] overflow-auto rounded-xl border border-border bg-gradient-to-b from-muted/20 to-background">
        <div
          className="relative"
          style={{ width: layout.width, height: layout.height }}
        >
          <svg
            className="pointer-events-none absolute inset-0 text-muted-foreground/40"
            width={layout.width}
            height={layout.height}
          >
            {layout.edges.map((e) => {
              const a = layout.pos.get(e.from)!;
              const b = layout.pos.get(e.to)!;
              const x1 = a.x + NODE_W / 2;
              const y1 = a.y + NODE_H;
              const x2 = b.x + NODE_W / 2;
              const y2 = b.y;
              const my = (y1 + y2) / 2;
              return (
                <path
                  key={`${e.from}->${e.to}`}
                  d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                />
              );
            })}
          </svg>

          {/* Generation labels down the left edge — the time axis. */}
          {layout.rows.map((row, d) =>
            row.length ? (
              <span
                key={`label-${d}`}
                className="absolute left-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60"
                style={{ top: TOP_PAD + d * ROW_GAP - 16 }}
              >
                {ROW_LABEL(d)}
              </span>
            ) : null,
          )}

          {[...layout.pos.entries()].map(([n, p]) => {
            const rec = byGrape.get(n);
            const conf: Confidence = rec?.confidence ?? "unknown";
            const cardId = grapeIds[n];
            const hasKids = (childrenOf.get(n)?.length ?? 0) > 0;
            const isCollapsed = collapsed.has(n);
            const match = needle.length > 0 && n.toLowerCase().includes(needle);
            return (
              <div
                key={n}
                className={cn(
                  "absolute flex flex-col justify-center rounded-lg border bg-card px-2.5 py-1.5 shadow-sm",
                  match ? "border-primary ring-2 ring-primary/40" : "border-border",
                )}
                style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-2 shrink-0 rounded-full", CONF_DOT[conf])} />
                  {cardId ? (
                    <button
                      type="button"
                      onClick={() => onOpenCard(cardId)}
                      className="min-w-0 truncate text-left text-sm font-medium hover:text-primary hover:underline"
                    >
                      {n}
                    </button>
                  ) : (
                    <span
                      className="min-w-0 truncate text-sm font-medium text-muted-foreground"
                      title="Ancestor variety — not in the library"
                    >
                      {n}
                    </span>
                  )}
                  {hasKids ? (
                    <button
                      type="button"
                      aria-label={isCollapsed ? "Expand descendants" : "Collapse descendants"}
                      onClick={() => toggle(n)}
                      className="ml-auto shrink-0 rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {isCollapsed ? "+" : "−"}
                    </button>
                  ) : null}
                </div>
                {rec?.note ? (
                  <span className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground/80">
                    {rec.note}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
