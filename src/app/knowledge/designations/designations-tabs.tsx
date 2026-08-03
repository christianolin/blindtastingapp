"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Globe,
  Grape,
  Home,
  Info,
  Landmark,
  Layers,
  Map as MapIcon,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DESIGNATION_TABS, type DesignationTab } from "@/lib/designations/tabs";
import type {
  DesignationsPageData,
  TabGlossaryTerm,
  TabSystem,
} from "@/lib/designations/page-data";
import {
  BLIND_TASTING_NOTE,
  DESIGNATION_CONTENT,
  OVERVIEW_INTRO,
  VARIATION_CARDS,
  VARIATION_INTRO,
  WHY_CARDS,
} from "@/lib/designations/content";
import { BurgundyPyramid } from "./burgundy-pyramid";

const WHY_ICONS = [Landmark, ScrollText, Layers, Sparkles];
const VARIATION_ICONS = [Globe, MapIcon, Home, Grape];

type SearchEntry = { label: string; sub: string; tab: string; norm: string };

// Punctuation/accent-insensitive so "cote de nuits" finds "Côte de Nuits" and
// hyphenated crus match spaced queries (mirrors the DB search normalisation).
const normText = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

// Flat search index across every tab: systems + their members, glossary terms,
// and all Burgundy vineyards — each tagged with the tab that hosts it.
function buildIndex(data: DesignationsPageData): SearchEntry[] {
  const out: SearchEntry[] = [];
  const push = (label: string, sub: string, tab: string) =>
    out.push({ label, sub, tab, norm: normText(label) });
  for (const t of DESIGNATION_TABS) {
    if (t.kind === "systems") {
      for (const key of t.systemKeys ?? []) {
        const sys = data.systems.find((s) => s.key === key);
        if (!sys) continue;
        push(sys.name, t.label, t.slug);
        for (const m of sys.members) push(m.name, sys.name, t.slug);
      }
    }
    for (const term of t.glossaryTerms ?? []) push(term, t.label, t.slug);
  }
  for (const tier of data.burgundy.tiers) {
    for (const sr of tier.subregions) {
      for (const v of sr.villages) {
        for (const vy of v.vineyards) {
          push(vy.name, `${tier.label} · ${sr.subregion}`, "burgundy");
        }
      }
    }
  }
  return out;
}

// Single-page Designations: one client tab shell that switches content from
// already-loaded props (no navigation/refetch). The tab bar wraps; `?tab=` is
// kept in sync via history.replaceState so links are shareable without reload.
export function DesignationsTabs({
  data,
  initialTab,
}: {
  data: DesignationsPageData;
  initialTab: string;
}) {
  const valid = DESIGNATION_TABS.some((t) => t.slug === initialTab)
    ? initialTab
    : "overview";
  const [active, setActive] = useState(valid);
  const [query, setQuery] = useState("");
  const index = useMemo(() => buildIndex(data), [data]);
  const q = normText(query.trim());
  const results =
    q.length >= 2 ? index.filter((e) => e.norm.includes(q)).slice(0, 14) : [];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (active === "overview") params.delete("tab");
    else params.set("tab", active);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `?${qs}` : window.location.pathname,
    );
  }, [active]);

  const tab =
    DESIGNATION_TABS.find((t) => t.slug === active) ?? DESIGNATION_TABS[0];
  const glossaryByName = new Map(data.glossary.map((g) => [g.name, g]));

  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search designations, classifications, crus…"
          className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        {results.length > 0 ? (
          <ul className="absolute z-20 mt-1 max-h-80 w-full max-w-md overflow-y-auto rounded-lg border border-border bg-background shadow-md">
            {results.map((r, i) => (
              <li key={`${r.tab}-${r.label}-${i}`}>
                <button
                  type="button"
                  onClick={() => {
                    setActive(r.tab);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                >
                  <span className="font-medium">{r.label}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    {r.sub}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {DESIGNATION_TABS.map((t) => (
          <button
            key={t.slug}
            type="button"
            onClick={() => setActive(t.slug)}
            aria-current={t.slug === active ? "page" : undefined}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              t.slug === active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab.kind === "overview" ? (
        <OverviewPanel />
      ) : tab.kind === "burgundy" ? (
        <BurgundyPyramid
          hierarchy={data.burgundy}
          meta={DESIGNATION_CONTENT["burgundy-grand-cru"]?.pyramid ?? []}
        />
      ) : tab.kind === "champagne" ? (
        <ChampagnePanel />
      ) : tab.kind === "systems" ? (
        <SystemsPanel
          tab={tab}
          systems={data.systems}
          glossaryByName={glossaryByName}
        />
      ) : (
        <GlossaryList tab={tab} glossaryByName={glossaryByName} bare />
      )}
    </div>
  );
}

function OverviewPanel() {
  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-2xl text-muted-foreground">{OVERVIEW_INTRO}</p>
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold">
          Why designations matter
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_CARDS.map((c, i) => {
            const Icon = WHY_ICONS[i];
            return (
              <div key={c.title} className="flex flex-col gap-2">
                <Icon className="size-6 text-primary" />
                <h3 className="font-medium">{c.title}</h3>
                <p className="text-sm text-muted-foreground">{c.body}</p>
              </div>
            );
          })}
        </div>
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold">Variation in wine</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {VARIATION_INTRO}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VARIATION_CARDS.map((c, i) => {
            const Icon = VARIATION_ICONS[i];
            return (
              <div key={c.title} className="flex flex-col gap-2">
                <Icon className="size-6 text-primary" />
                <h3 className="font-medium">{c.title}</h3>
                <p className="text-sm text-muted-foreground">{c.body}</p>
              </div>
            );
          })}
        </div>
      </section>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <Info className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">{BLIND_TASTING_NOTE}</p>
      </div>
    </div>
  );
}

function SystemsPanel({
  tab,
  systems,
  glossaryByName,
}: {
  tab: DesignationTab;
  systems: TabSystem[];
  glossaryByName: Map<string, TabGlossaryTerm>;
}) {
  const chosen = (tab.systemKeys ?? [])
    .map((k) => systems.find((s) => s.key === k))
    .filter((s): s is TabSystem => !!s && s.members.length > 0);

  return (
    <div className="flex flex-col gap-8">
      {chosen.map((s) => {
        const tiers: { tier: string; names: string[] }[] = [];
        for (const m of s.members) {
          const label = m.tier ?? "Classified";
          let t = tiers.find((x) => x.tier === label);
          if (!t) {
            t = { tier: label, names: [] };
            tiers.push(t);
          }
          t.names.push(m.name);
        }
        return (
          <section key={s.key} className="flex flex-col gap-3">
            <h2 className="font-heading text-xl font-semibold">{s.name}</h2>
            <div className="flex flex-col gap-3">
              {tiers.map((t) => (
                <Card key={t.tier}>
                  <CardContent className="flex flex-col gap-2 pt-6">
                    <div className="flex items-center justify-between">
                      <span className="font-heading text-lg font-semibold">
                        {t.tier}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t.names.length}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t.names.join(" · ")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
      <GlossaryList tab={tab} glossaryByName={glossaryByName} />
    </div>
  );
}

function GlossaryList({
  tab,
  glossaryByName,
  bare,
}: {
  tab: DesignationTab;
  glossaryByName: Map<string, TabGlossaryTerm>;
  bare?: boolean;
}) {
  const terms = (tab.glossaryTerms ?? [])
    .map((n) => glossaryByName.get(n))
    .filter((t): t is TabGlossaryTerm => !!t);
  if (terms.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {!bare ? (
        <h2 className="font-heading text-xl font-semibold">Related terms</h2>
      ) : null}
      {terms.map((t) => (
        <Card key={t.name}>
          <CardContent className="flex flex-col gap-1 pt-6">
            <h3 className="font-heading text-lg font-semibold">{t.name}</h3>
            {t.description ? (
              <p className="text-sm text-muted-foreground">{t.description}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChampagnePanel() {
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Champagne is ranked by the Échelle des Crus — its Grand Cru and Premier
        Cru villages are mapped on the wine map.
      </p>
      <Link
        href="/knowledge/map?place=france.champagne"
        className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
      >
        Explore Champagne on the wine map →
      </Link>
    </div>
  );
}
