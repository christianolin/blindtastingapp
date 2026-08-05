"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { CRU_BOURGEOIS, DESIGNATION_CONTENT } from "@/lib/designations/content";
import type { TabSystem, TabSystemMember } from "@/lib/designations/page-data";
import { PyramidBands } from "./pyramid-bands";
import { DesignationHero } from "./designation-hero";
import { ClassificationTable } from "./classification-table";

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
  // Champagne classifies villages and Alsace classifies vineyards, so each
  // member already IS a place on the map; the Bordeaux systems classify
  // châteaux, which merely sit inside one.
  const selfPlaced =
    system.key === "champagne-echelle-des-crus" ||
    system.key === "alsace-grand-cru";
  const unitPlural =
    system.key === "champagne-echelle-des-crus"
      ? "villages"
      : system.key === "alsace-grand-cru"
        ? "grand crus"
        : "châteaux";
  const q = query.trim().toLowerCase();
  const rows = system.members.filter(
    (m) =>
      (!activeTier || m.tier === activeTier) &&
      (!q || m.name.toLowerCase().includes(q)),
  );

  return (
    <div className="relative flex flex-col gap-6">
      {/* Blurred backdrop for the whole classification — it runs behind the
          pyramid on purpose, bleeding to the right edge and dissolving into the
          parchment, like the overview hero. */}
      {DESIGNATION_CONTENT[system.key]?.hero ? (
        <div className="pointer-events-none absolute -top-6 right-0 -mr-6 hidden h-[540px] w-[52%] max-w-[620px] overflow-hidden sm:-mr-8 sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={DESIGNATION_CONTENT[system.key]!.hero!.src}
            alt=""
            aria-hidden
            // Kept sharp: the overview hero's effect is the multiply blend and
            // the fade, not blur — and this source is small enough that any
            // blur on top of the upscale just turns it to mush.
            className="size-full object-cover object-center mix-blend-multiply [filter:sepia(0.25)_saturate(0.9)_brightness(1.04)]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background from-0% via-background/55 via-30% to-transparent to-85%" />
          {/* Keeps the château table legible where it overlaps the photo. */}
          <div className="absolute inset-0 bg-background/35" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background to-transparent" />
        </div>
      ) : null}
      <div className="relative flex flex-wrap gap-2">
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

      <div className="relative">
        <DesignationHero
          inset={DESIGNATION_CONTENT[system.key]?.inset}
          intro={intro}
        />
      </div>

      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
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

        <ClassificationTable
          columns={
            // The classified unit differs by system: a château in the Médoc, a
            // whole village in Champagne, a single vineyard in Alsace.
            system.key === "champagne-echelle-des-crus"
              ? ["Village", "Rank", "Sub-region"]
              : system.key === "alsace-grand-cru"
                ? ["Grand Cru", "Rank", "Commune"]
                : ["Château", "Growth", "Commune"]
          }
          rows={rows.map((m, i) => ({
            id: `${m.name}-${i}`,
            cells: [m.name, m.tier, m.commune],
            note: m.localNote,
            placeKey: m.appellationKey,
            // Where the member IS the place, the button would just repeat the
            // name in the first column — say "Map" instead.
            placeLabel: selfPlaced ? "Map" : (m.appellationName ?? m.commune ?? "Map"),
          }))}
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder={`Search ${unitPlural}…`}
          summary={
            activeTier
              ? `${rows.length} · ${activeTier}`
              : `All ${system.members.length} ${unitPlural}`
          }
          onClearFilter={activeTier ? () => setActiveTier(null) : undefined}
          mapColumnLabel={selfPlaced ? "Map" : "Appellation"}
        />
      </div>

      {/* Bordeaux-only footnote — this view also serves Alsace. */}
      {systemKeys.includes("medoc-1855") ? (
        <div className="relative rounded-lg border border-border bg-muted/30 p-4">
          <h3 className="font-heading text-lg font-semibold">
            {CRU_BOURGEOIS.title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {CRU_BOURGEOIS.body}
          </p>
        </div>
      ) : null}
    </div>
  );
}
