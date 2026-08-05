"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CRU_BOURGEOIS, DESIGNATION_CONTENT } from "@/lib/designations/content";
import type { TabSystem, TabSystemMember } from "@/lib/designations/page-data";
import { PyramidBands } from "./pyramid-bands";

type BordeauxTier = { tier: string; members: TabSystemMember[] };

// Group a system's members into tiers, preserving arrival order (page-data
// returns them tier_rank-ordered) so the pyramid reads top growth first.
function tiersOf(system: TabSystem): BordeauxTier[] {
  const out: BordeauxTier[] = [];
  for (const m of system.members) {
    const label = m.tier ?? "Classified";
    let t = out.find((x) => x.tier === label);
    if (!t) {
      t = { tier: label, members: [] };
      out.push(t);
    }
    t.members.push(m);
  }
  return out;
}

export function BordeauxClassification({
  systems,
  systemKeys,
}: {
  systems: TabSystem[];
  systemKeys: string[];
}) {
  const chosen = systemKeys
    .map((k) => systems.find((s) => s.key === k))
    .filter((s): s is TabSystem => !!s && s.members.length > 0);

  const [activeKey, setActiveKey] = useState(chosen[0]?.key ?? "");
  const [activeTier, setActiveTier] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const system = chosen.find((s) => s.key === activeKey) ?? chosen[0];
  const tiers = useMemo(() => (system ? tiersOf(system) : []), [system]);

  if (!system) return null;

  const meta = DESIGNATION_CONTENT[system.key]?.pyramid ?? [];
  const intro = DESIGNATION_CONTENT[system.key]?.intro;
  const q = query.trim().toLowerCase();
  const rows = system.members.filter(
    (m) =>
      (!activeTier || m.tier === activeTier) &&
      (!q || m.name.toLowerCase().includes(q)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {chosen.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              setActiveKey(s.key);
              setActiveTier(null);
              setQuery("");
            }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              s.key === system.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      {intro ? (
        <p className="max-w-2xl text-sm text-muted-foreground">{intro}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <PyramidBands
          bands={tiers.map((t, i) => ({
            key: t.tier,
            label: t.tier,
            count: `${t.members.length} châteaux`,
            color: meta[i]?.color ?? "#8A3D52",
            textColor: meta[i]?.textColor,
            rank: meta[i]?.rank,
          }))}
          activeKey={activeTier}
          onSelect={(key) => setActiveTier(activeTier === key ? null : key)}
        />

        <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search châteaux…"
          className="min-w-[180px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <span className="text-sm font-medium text-primary">
          {activeTier
            ? `${rows.length} · ${activeTier}`
            : `All ${system.members.length} châteaux`}
        </span>
        {activeTier ? (
          <button
            type="button"
            onClick={() => setActiveTier(null)}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            Show all
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Growth</th>
              <th className="px-3 py-2 font-medium">Château</th>
              <th className="px-3 py-2 font-medium">Commune</th>
              <th className="px-3 py-2 font-medium">Appellation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={`${m.name}-${i}`} className="border-t border-border">
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {m.tier}
                </td>
                <td className="px-3 py-2">
                  <span className="font-medium">{m.name}</span>
                  {m.localNote ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {m.localNote}
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {m.commune ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {m.appellationKey ? (
                    <Link
                      href={`/knowledge/map?place=${m.appellationKey}`}
                      className="text-primary hover:text-primary/80"
                    >
                      {m.appellationName ?? m.commune} →
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">
                      {m.commune ?? "—"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h3 className="font-heading text-lg font-semibold">
          {CRU_BOURGEOIS.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{CRU_BOURGEOIS.body}</p>
      </div>
    </div>
  );
}
