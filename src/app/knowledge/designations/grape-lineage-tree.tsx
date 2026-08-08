"use client";

import { useMemo, useState } from "react";
import { ChevronRight, HelpCircle, Grape as GrapeIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  GRAPE_PARENTAGE,
  GRAPE_SYNONYMS,
  GRAPE_MUTATIONS,
  type Confidence,
} from "@/lib/grape-lineage";

// Interactive parentage explorer: pick a grape, expand its parents (and their
// parents), each edge labelled by confidence, unknown parentage stated. A
// grape that exists in the library links to its profile card.
export function GrapeLineageTree({
  grapeIds,
  onOpenCard,
}: {
  // name -> profile card id, so known grapes deep-link to their card.
  grapeIds: Record<string, string>;
  onOpenCard: (id: string) => void;
}) {
  const byGrape = useMemo(
    () => new Map(GRAPE_PARENTAGE.map((p) => [p.grape, p])),
    [],
  );

  // Roots: grapes we hold parentage facts for, minus those that are only ever
  // someone's parent (they still appear as ancestor nodes when expanded).
  const roots = useMemo(
    () =>
      GRAPE_PARENTAGE.map((p) => p.grape)
        .filter((g) => !GRAPE_SYNONYMS[g] && !GRAPE_MUTATIONS[g])
        .sort((a, b) => a.localeCompare(b)),
    [],
  );

  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? roots.filter((g) => g.toLowerCase().includes(needle))
    : roots;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        Who descends from whom, by DNA parentage. Expand a grape to walk back
        through its parents; <span className="font-medium text-foreground">unknown</span>{" "}
        means the parentage isn&apos;t recorded, not that none exists.
      </div>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a grape"
        className="sm:max-w-xs"
      />
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No lineage recorded for that grape yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shown.map((g) => (
            <li key={g}>
              <LineageNode
                grape={g}
                byGrape={byGrape}
                grapeIds={grapeIds}
                onOpenCard={onOpenCard}
                depth={0}
                seen={new Set([g])}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CONF_STYLE: Record<Confidence, { label: string; cls: string }> = {
  confirmed: { label: "DNA-confirmed", cls: "bg-primary/10 text-primary" },
  probable: { label: "probable", cls: "bg-gold/15 text-gold-deep" },
  unknown: { label: "unknown", cls: "bg-muted text-muted-foreground" },
};

function LineageNode({
  grape,
  byGrape,
  grapeIds,
  onOpenCard,
  depth,
  seen,
}: {
  grape: string;
  byGrape: Map<string, (typeof GRAPE_PARENTAGE)[number]>;
  grapeIds: Record<string, string>;
  onOpenCard: (id: string) => void;
  depth: number;
  // Guards against a cycle in the data looping the render forever.
  seen: Set<string>;
}) {
  const record = byGrape.get(grape);
  const parents = record?.parents ?? [];
  const hasParents = parents.length > 0;
  const [open, setOpen] = useState(depth === 0 ? false : true);
  const cardId = grapeIds[grape];

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border px-3 py-2",
          depth === 0 ? "bg-card" : "bg-muted/20",
        )}
      >
        {hasParents ? (
          <button
            type="button"
            aria-label={open ? "Collapse parents" : "Show parents"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight
              className={cn("size-4 transition-transform", open && "rotate-90")}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <GrapeIcon className="size-4 shrink-0 text-muted-foreground" />
        {cardId ? (
          <button
            type="button"
            onClick={() => onOpenCard(cardId)}
            className="font-medium hover:text-primary hover:underline"
          >
            {grape}
          </button>
        ) : (
          <span className="font-medium" title="Not in the library — an ancestor variety">
            {grape}
          </span>
        )}

        {record ? (
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
              CONF_STYLE[record.confidence].cls,
            )}
          >
            {hasParents
              ? CONF_STYLE[record.confidence].label
              : "founder / unknown"}
          </span>
        ) : null}
      </div>

      {record?.note ? (
        <p className="mt-0.5 pl-9 text-xs text-muted-foreground">{record.note}</p>
      ) : null}
      {record && !hasParents && record.confidence === "unknown" ? (
        <p className="mt-0.5 flex items-center gap-1 pl-9 text-xs text-muted-foreground/80">
          <HelpCircle className="size-3" /> Parentage not recorded
        </p>
      ) : null}

      {open && hasParents ? (
        <ul className="mt-1.5 ml-4 flex flex-col gap-1.5 border-l border-border pl-3">
          {parents.map((p) =>
            seen.has(p) ? (
              <li key={p} className="text-xs italic text-muted-foreground">
                {p} (already shown above)
              </li>
            ) : (
              <li key={p}>
                <LineageNode
                  grape={p}
                  byGrape={byGrape}
                  grapeIds={grapeIds}
                  onOpenCard={onOpenCard}
                  depth={depth + 1}
                  seen={new Set([...seen, p])}
                />
              </li>
            ),
          )}
        </ul>
      ) : null}
    </div>
  );
}
