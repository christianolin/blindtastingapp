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
// founder varieties at the top, their crosses below — so scrolling down moves
// forward in time. It's a DAG (a grape has up to two parents, a parent many
// children), so each child is placed at the horizontal barycentre of its
// parents and links run near-vertically. Grapes with neither recorded parents
// nor recorded children aren't part of any line, so they sit in a separate
// list instead of bloating the founders row.

const NODE_W = 150;
const NODE_H = 52;
const COL_GAP = 26;
const ROW_GAP = 108;
const PAD = 20;
const STEP = NODE_W + COL_GAP;

const CONF_DOT: Record<Confidence, string> = {
  confirmed: "bg-primary",
  probable: "bg-gold",
  unknown: "bg-muted-foreground/40",
};

const ROW_LABEL = (d: number) =>
  d === 0
    ? "Founders / ancient"
    : d === 1
      ? "First-generation crosses"
      : `Generation ${d}`;

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
    const nodeSet = new Set<string>();
    for (const p of GRAPE_PARENTAGE) {
      nodeSet.add(p.grape);
      for (const parent of p.parents) nodeSet.add(parent);
    }
    for (const n of [...nodeSet]) {
      if (GRAPE_SYNONYMS[n] || GRAPE_MUTATIONS[n]) nodeSet.delete(n);
    }
    const parentsOf = (n: string) =>
      (byGrape.get(n)?.parents ?? []).filter((p) => nodeSet.has(p));
    const childrenOf = new Map<string, string[]>();
    for (const n of nodeSet)
      for (const parent of parentsOf(n))
        childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), n]);

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

    // A grape with no parents and no children is on no line of descent.
    const isolated = [...nodeSet]
      .filter((n) => parentsOf(n).length === 0 && !(childrenOf.get(n)?.length))
      .sort((a, b) => a.localeCompare(b));

    return { byGrape, nodeSet, parentsOf, childrenOf, depth, isolated };
  }, []);

  const layout = useMemo(() => {
    const { nodeSet, parentsOf, childrenOf, depth, isolated } = model;
    const isolatedSet = new Set(isolated);

    // Collapse-aware visibility, then keep only nodes that are on a line.
    const ordered = [...nodeSet].sort((a, b) => depth.get(a)! - depth.get(b)!);
    const visible = new Map<string, boolean>();
    for (const n of ordered) {
      const ps = parentsOf(n);
      visible.set(
        n,
        ps.length === 0 ? true : ps.some((p) => visible.get(p) && !collapsed.has(p)),
      );
    }
    const graph = ordered.filter((n) => visible.get(n) && !isolatedSet.has(n));
    const graphSet = new Set(graph);

    const maxDepth = Math.max(0, ...graph.map((n) => depth.get(n)!));
    const rows: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
    for (const n of graph) rows[depth.get(n)!].push(n);
    rows.forEach((r) => r.sort((a, b) => a.localeCompare(b)));

    const pOf = (n: string) => parentsOf(n).filter((p) => graphSet.has(p));
    const cOf = (n: string) =>
      (childrenOf.get(n) ?? []).filter((c) => graphSet.has(c));

    // Crossing reduction: alternate barycentre sweeps on ORDER indices.
    const idx = new Map<string, number>();
    const reindex = () =>
      rows.forEach((r) => r.forEach((n, i) => idx.set(n, i)));
    reindex();
    const mean = (ns: string[], self: string) =>
      ns.length ? ns.reduce((s, n) => s + idx.get(n)!, 0) / ns.length : idx.get(self)!;
    for (let iter = 0; iter < 5; iter += 1) {
      for (let d = 1; d < rows.length; d += 1) {
        rows[d].sort((a, b) => mean(pOf(a), a) - mean(pOf(b), b));
        rows[d].forEach((n, i) => idx.set(n, i));
      }
      for (let d = rows.length - 2; d >= 0; d -= 1) {
        rows[d].sort((a, b) => mean(cOf(a), a) - mean(cOf(b), b));
        rows[d].forEach((n, i) => idx.set(n, i));
      }
    }

    // Coordinates: place each node at the barycentre of the relatives above/
    // below it, pushing right to keep spacing. A down/up/down settle aligns
    // parents over their children and vice-versa.
    const x = new Map<string, number>();
    rows[0]?.forEach((n, i) => x.set(n, i * STEP));
    const settleDown = () => {
      rows.forEach((row, d) => {
        row.forEach((n, i) => {
          const rel = d === 0 ? [] : pOf(n).filter((p) => x.has(p));
          let xi = rel.length
            ? rel.reduce((s, p) => s + x.get(p)!, 0) / rel.length
            : (x.get(n) ?? (i > 0 ? x.get(row[i - 1])! + STEP : 0));
          if (i > 0) xi = Math.max(xi, x.get(row[i - 1])! + STEP);
          x.set(n, xi);
        });
      });
    };
    const settleUp = () => {
      for (let d = rows.length - 2; d >= 0; d -= 1) {
        rows[d].forEach((n, i) => {
          const cs = cOf(n).filter((c) => x.has(c));
          let xi = cs.length
            ? cs.reduce((s, c) => s + x.get(c)!, 0) / cs.length
            : x.get(n)!;
          if (i > 0) xi = Math.max(xi, x.get(rows[d][i - 1])! + STEP);
          x.set(n, xi);
        });
      }
    };
    settleDown();
    settleUp();
    settleDown();

    // Shift so the leftmost node sits at PAD.
    const minX = Math.min(...[...x.values()]);
    for (const [n, v] of x) x.set(n, v - minX + PAD);

    const pos = new Map<string, { x: number; y: number }>();
    for (const n of graph)
      pos.set(n, { x: x.get(n)!, y: PAD + 16 + depth.get(n)! * ROW_GAP });

    const edges: { from: string; to: string }[] = [];
    for (const n of graph)
      for (const p of pOf(n))
        if (!collapsed.has(p)) edges.push({ from: p, to: n });

    const width = Math.max(...[...x.values()]) + NODE_W + PAD;
    const height = PAD + 16 + maxDepth * ROW_GAP + NODE_H + PAD;
    return { rows, pos, edges, width, height };
  }, [model, collapsed]);

  const toggle = (n: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const { byGrape, childrenOf, isolated } = model;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        Who descends from whom, by DNA parentage. The higher a grape sits, the
        older it is — founder varieties at the top, their crosses below.
        Collapse a grape (−) to fold away its descendants.
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
            <span className="size-2 rounded-full bg-primary" /> confirmed
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
        <div className="relative" style={{ width: layout.width, height: layout.height }}>
          <svg
            className="pointer-events-none absolute inset-0 text-muted-foreground/45"
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

          {layout.rows.map((row, d) =>
            row.length ? (
              <span
                key={`label-${d}`}
                className="pointer-events-none absolute left-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60"
                style={{ top: PAD + d * ROW_GAP }}
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
                      className="ml-auto flex size-5 shrink-0 items-center justify-center rounded text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
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

      {isolated.length > 0 ? (
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-medium">No recorded parentage</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ancient or unstudied varieties with no established parent cross yet.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {isolated.map((n) => {
              const cardId = grapeIds[n];
              return cardId ? (
                <button
                  key={n}
                  type="button"
                  onClick={() => onOpenCard(cardId)}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs transition-colors hover:bg-muted"
                >
                  {n}
                </button>
              ) : (
                <span
                  key={n}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  {n}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
