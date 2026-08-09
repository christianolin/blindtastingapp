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

// Lineage as a stack of small family trees. Each connected family (a set of
// grapes joined by parent/child links) is laid out top-down on its own — older
// grapes higher, their crosses below, connected by curves — and the families
// stack vertically so the page scrolls DOWN through families rather than
// sideways across one giant founders row. Grapes on no line of descent sit in
// a separate list at the bottom.

const NODE_W = 150;
const NODE_H = 52;
const COL_GAP = 24;
const ROW_GAP = 96;
const PAD = 18;
const STEP = NODE_W + COL_GAP;

const CONF_DOT: Record<Confidence, string> = {
  confirmed: "bg-primary",
  probable: "bg-gold",
  unknown: "bg-muted-foreground/40",
};

type Layout = {
  rows: string[][];
  pos: Map<string, { x: number; y: number }>;
  edges: { from: string; to: string }[];
  width: number;
  height: number;
};

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

    const isolated = [...nodeSet]
      .filter((n) => parentsOf(n).length === 0 && !(childrenOf.get(n)?.length))
      .sort((a, b) => a.localeCompare(b));
    const isolatedSet = new Set(isolated);

    // Connected families over the undirected parent/child graph.
    const linked = [...nodeSet].filter((n) => !isolatedSet.has(n));
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
      (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
    };
    for (const n of linked)
      for (const p of parentsOf(n)) link(n, p);
    const seen = new Set<string>();
    const families: string[][] = [];
    for (const start of linked) {
      if (seen.has(start)) continue;
      const comp: string[] = [];
      const queue = [start];
      seen.add(start);
      while (queue.length) {
        const cur = queue.shift()!;
        comp.push(cur);
        for (const nb of adj.get(cur) ?? [])
          if (!seen.has(nb)) {
            seen.add(nb);
            queue.push(nb);
          }
      }
      families.push(comp);
    }
    // Biggest, oldest-rooted families first.
    families.sort((a, b) => b.length - a.length);

    return { byGrape, parentsOf, childrenOf, depth, isolated, families };
  }, []);

  const familyLayouts = useMemo(() => {
    const { parentsOf, childrenOf, depth } = model;
    return model.families.map((comp): Layout => {
      const compSet = new Set(comp);
      // Collapse-aware visibility within the family.
      const ordered = [...comp].sort((a, b) => depth.get(a)! - depth.get(b)!);
      const visible = new Map<string, boolean>();
      for (const n of ordered) {
        const ps = parentsOf(n).filter((p) => compSet.has(p));
        visible.set(
          n,
          ps.length === 0
            ? true
            : ps.some((p) => visible.get(p) && !collapsed.has(p)),
        );
      }
      const vis = ordered.filter((n) => visible.get(n)!);
      const visSet = new Set(vis);
      const pOf = (n: string) => parentsOf(n).filter((p) => visSet.has(p));
      const cOf = (n: string) =>
        (childrenOf.get(n) ?? []).filter((c) => visSet.has(c));

      // Re-base depth to the family's own top so every family starts at row 0.
      const minDepth = Math.min(...vis.map((n) => depth.get(n)!));
      const rowOf = (n: string) => depth.get(n)! - minDepth;
      const maxRow = Math.max(0, ...vis.map(rowOf));
      const rows: string[][] = Array.from({ length: maxRow + 1 }, () => []);
      for (const n of vis) rows[rowOf(n)].push(n);
      rows.forEach((r) => r.sort((a, b) => a.localeCompare(b)));

      // Crossing reduction on order indices.
      const idx = new Map<string, number>();
      rows.forEach((r) => r.forEach((n, i) => idx.set(n, i)));
      const mean = (ns: string[], self: string) =>
        ns.length
          ? ns.reduce((s, n) => s + idx.get(n)!, 0) / ns.length
          : idx.get(self)!;
      for (let iter = 0; iter < 4; iter += 1) {
        for (let d = 1; d < rows.length; d += 1) {
          rows[d].sort((a, b) => mean(pOf(a), a) - mean(pOf(b), b));
          rows[d].forEach((n, i) => idx.set(n, i));
        }
        for (let d = rows.length - 2; d >= 0; d -= 1) {
          rows[d].sort((a, b) => mean(cOf(a), a) - mean(cOf(b), b));
          rows[d].forEach((n, i) => idx.set(n, i));
        }
      }

      // X by barycentre, settle down/up/down.
      const x = new Map<string, number>();
      rows[0]?.forEach((n, i) => x.set(n, i * STEP));
      const down = () =>
        rows.forEach((row, d) =>
          row.forEach((n, i) => {
            const rel = d === 0 ? [] : pOf(n).filter((p) => x.has(p));
            let xi = rel.length
              ? rel.reduce((s, p) => s + x.get(p)!, 0) / rel.length
              : (x.get(n) ?? (i > 0 ? x.get(row[i - 1])! + STEP : 0));
            if (i > 0) xi = Math.max(xi, x.get(row[i - 1])! + STEP);
            x.set(n, xi);
          }),
        );
      const up = () => {
        for (let d = rows.length - 2; d >= 0; d -= 1)
          rows[d].forEach((n, i) => {
            const cs = cOf(n).filter((c) => x.has(c));
            let xi = cs.length
              ? cs.reduce((s, c) => s + x.get(c)!, 0) / cs.length
              : x.get(n)!;
            if (i > 0) xi = Math.max(xi, x.get(rows[d][i - 1])! + STEP);
            x.set(n, xi);
          });
      };
      down();
      up();
      down();
      const minX = Math.min(...[...x.values()]);
      for (const [n, v] of x) x.set(n, v - minX + PAD);

      const pos = new Map<string, { x: number; y: number }>();
      for (const n of vis) pos.set(n, { x: x.get(n)!, y: PAD + rowOf(n) * ROW_GAP });
      const edges: { from: string; to: string }[] = [];
      for (const n of vis)
        for (const p of pOf(n)) if (!collapsed.has(p)) edges.push({ from: p, to: n });

      const width = Math.max(...[...x.values()]) + NODE_W + PAD;
      const height = PAD + maxRow * ROW_GAP + NODE_H + PAD;
      return { rows, pos, edges, width, height };
    });
  }, [model, collapsed]);

  const toggle = (n: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const { byGrape, childrenOf, isolated } = model;

  const renderFamily = (layout: Layout, key: number) => (
    <div key={key} className="overflow-x-auto rounded-xl border border-border bg-gradient-to-b from-muted/20 to-background">
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
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        Who descends from whom, by DNA parentage. Each block is one family; the
        higher a grape sits, the older it is — the founder cross on top, its
        offspring below. Collapse a grape (−) to fold away its descendants.
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

      <div className="flex flex-col gap-3">
        {familyLayouts.map(renderFamily)}
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
