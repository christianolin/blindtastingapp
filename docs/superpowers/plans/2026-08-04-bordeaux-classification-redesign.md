# Bordeaux Classifications Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat Bordeaux classification list with an interactive growth-pyramid-plus-château-table view, and link classified growths to their appellations both ways via the wine map.

**Architecture:** A new `"bordeaux"` designation tab renders a client `BordeauxClassification` component (segmented switch over four systems → an interactive pyramid that filters a château table). A new `wine_designation_members.appellation_wine_place_id` FK (backfilled from a total commune→canonical_key map) drives the table's map deep-links; the `get_wine_place_context` RPC gains `classified_members` so a place page (e.g. Pauillac) lists its classified growths.

**Tech Stack:** Next.js 16 (App Router) + React 19, TypeScript, Tailwind, Supabase Postgres (hand-maintained `database.types.ts`), `pg` + `node:test` for DB tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-bordeaux-classification-redesign-design.md`.
- Every TS/UI increment ends with `tsc --noEmit` clean — clear `.next` first: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit` (expect `EXIT=0`, no output).
- Migrations: `node scripts/scratch-apply.mjs --file <path> --mode dry` then `--mode live`. Set `$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'` in the shell first. Next free versions: `20260829263300`, `20260829263400` (highest existing = `...263200`).
- DB tests: `node --test scripts/<name>.test.mjs` (also needs `$env:DB_PASSWORD`).
- Commit per task. Push with `git push` from the repo root (stderr may print "RemoteException" but `EXIT=0` / a ref line = success).
- Policy: canonical-only; link via `wine_places`, never the flat `appellations` table.
- Non-goals (do NOT do): château→producer linking, a Cru Bourgeois château list, admin/edit UI.

## File Structure

**Create:**
- `supabase/migrations/20260829263300_designation_member_appellation_link.sql` — column + index + total commune backfill + self-assert.
- `supabase/migrations/20260829263400_wine_place_context_classified_members.sql` — `get_wine_place_context` gains `classified_members`.
- `src/app/knowledge/designations/bordeaux-classification.tsx` — the interactive Bordeaux panel (client).
- `scripts/bordeaux-appellation-link.test.mjs` — backfill invariant + spot checks.
- `scripts/wine-place-classified-members.test.mjs` — RPC returns growths for Pauillac.

**Modify:**
- `src/lib/supabase/database.types.ts` — add `appellation_wine_place_id` to `wine_designation_members`.
- `src/lib/designations/page-data.ts` — extend `TabSystemMember` + query + place resolution.
- `src/lib/designations/content.ts` — per-system pyramid meta + `CRU_BOURGEOIS` prose.
- `src/lib/designations/tabs.ts` — Bordeaux tab `kind: "systems"` → `"bordeaux"`.
- `src/app/knowledge/designations/designations-tabs.tsx` — new `bordeaux` branch + search index.
- `src/lib/wine-map/context.ts` — `WineClassifiedMember` type + `classified_members`.
- `src/app/knowledge/map/knowledge-sections.tsx` — "Classified growths" section.

---

### Task 1: DB — appellation link column + total commune backfill

**Files:**
- Create: `supabase/migrations/20260829263300_designation_member_appellation_link.sql`
- Create: `scripts/bordeaux-appellation-link.test.mjs`

**Interfaces:**
- Produces: column `wine_designation_members.appellation_wine_place_id uuid` (FK → `wine_places.id`), populated for all 189 Bordeaux ESTATE members.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260829263300_designation_member_appellation_link.sql`:

```sql
-- Link 1855 / Graves / Saint-Émilion classified members (châteaux) to their
-- appellation wine_place, powering the Library Bordeaux panel deep-links and
-- the map place page's "classified growths" list. Backfill is total: every
-- distinct commune maps to a real wine_places.canonical_key (verified against
-- live data 2026-08-04).

alter table wine_designation_members
  add column if not exists appellation_wine_place_id uuid references wine_places(id);

create index if not exists wine_designation_members_appellation_idx
  on wine_designation_members (appellation_wine_place_id);

update wine_designation_members m
set appellation_wine_place_id = wp.id
from (values
  ('Pauillac', 'france.bordeaux.haut-medoc.pauillac'),
  ('Margaux', 'france.bordeaux.haut-medoc.margaux'),
  ('Saint-Julien', 'france.bordeaux.haut-medoc.saint-julien'),
  ('Saint-Estèphe', 'france.bordeaux.haut-medoc.saint-estephe'),
  ('Haut-Médoc', 'france.bordeaux.haut-medoc'),
  ('Pessac (Graves)', 'france.bordeaux.pessac-leognan'),
  ('Cadaujac', 'france.bordeaux.pessac-leognan'),
  ('Léognan', 'france.bordeaux.pessac-leognan'),
  ('Martillac', 'france.bordeaux.pessac-leognan'),
  ('Pessac', 'france.bordeaux.pessac-leognan'),
  ('Talence', 'france.bordeaux.pessac-leognan'),
  ('Villenave-d''Ornon', 'france.bordeaux.pessac-leognan'),
  ('Sauternes', 'france.bordeaux.sauternes'),
  ('Bommes', 'france.bordeaux.sauternes'),
  ('Fargues', 'france.bordeaux.sauternes'),
  ('Preignac', 'france.bordeaux.sauternes'),
  ('Barsac', 'france.bordeaux.sauternes.barsac'),
  ('Saint-Émilion', 'france.bordeaux.saint-emilion'),
  ('Saint-Christophe-des-Bardes', 'france.bordeaux.saint-emilion'),
  ('Saint-Étienne-de-Lisse', 'france.bordeaux.saint-emilion'),
  ('Saint-Hippolyte', 'france.bordeaux.saint-emilion'),
  ('Saint-Laurent-des-Combes', 'france.bordeaux.saint-emilion'),
  ('Saint-Pey-d''Armens', 'france.bordeaux.saint-emilion'),
  ('Saint-Sulpice-de-Faleyrens', 'france.bordeaux.saint-emilion')
) as map(commune, key)
join wine_places wp on wp.canonical_key = map.key
where m.member_kind = 'ESTATE' and m.commune = map.commune;

-- Self-assert: no Bordeaux ESTATE member left unlinked. A new/renamed commune
-- trips this and must be added to the map above.
do $$
declare n int;
begin
  select count(*) into n
  from wine_designation_members m
  join wine_designations d on d.id = m.designation_id
  where d.key in ('medoc-1855','sauternes-1855','saint-emilion-grand-cru-classe','graves-cru-classe')
    and m.member_kind = 'ESTATE'
    and m.appellation_wine_place_id is null;
  if n <> 0 then
    raise exception 'Bordeaux members with no appellation link: %', n;
  end if;
end $$;
```

- [ ] **Step 2: Dry-run the migration**

Run: `$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'; node scripts/scratch-apply.mjs --file supabase/migrations/20260829263300_designation_member_appellation_link.sql --mode dry`
Expected: `DRY-OK 20260829263300 designation_member_appellation_link` (the self-assert passed inside the rolled-back transaction).

- [ ] **Step 3: Live-apply the migration**

Run: `$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'; node scripts/scratch-apply.mjs --file supabase/migrations/20260829263300_designation_member_appellation_link.sql --mode live`
Expected: `LIVE-APPLIED 20260829263300 designation_member_appellation_link`.

- [ ] **Step 4: Write the DB test**

Create `scripts/bordeaux-appellation-link.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

test("every Bordeaux classified estate links to an appellation", async () => {
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    const { rows } = await client.query(`
      select count(*)::int as n
      from wine_designation_members m
      join wine_designations d on d.id = m.designation_id
      where d.key in ('medoc-1855','sauternes-1855','saint-emilion-grand-cru-classe','graves-cru-classe')
        and m.member_kind = 'ESTATE'
        and m.appellation_wine_place_id is null;
    `);
    assert.equal(rows[0].n, 0, "unlinked Bordeaux estates remain");
  } finally {
    await client.end();
  }
});

test("known châteaux resolve to the expected appellation", async () => {
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    const { rows } = await client.query(`
      select m.name, wp.canonical_key as key
      from wine_designation_members m
      join wine_places wp on wp.id = m.appellation_wine_place_id
      where m.name in ('Château Lafite Rothschild','Château Latour','Château Haut-Brion');
    `);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.key]));
    assert.equal(byName["Château Lafite Rothschild"], "france.bordeaux.haut-medoc.pauillac");
    assert.equal(byName["Château Latour"], "france.bordeaux.haut-medoc.pauillac");
    assert.equal(byName["Château Haut-Brion"], "france.bordeaux.pessac-leognan");
  } finally {
    await client.end();
  }
});

test("sub-commune mappings resolve (Barsac/Sauternes, Graves, Haut-Médoc)", async () => {
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    const { rows } = await client.query(`
      select wp.canonical_key as key, count(*)::int as n
      from wine_designation_members m
      join wine_places wp on wp.id = m.appellation_wine_place_id
      where wp.canonical_key in (
        'france.bordeaux.sauternes.barsac','france.bordeaux.sauternes',
        'france.bordeaux.pessac-leognan','france.bordeaux.haut-medoc'
      )
      group by wp.canonical_key;
    `);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.n]));
    assert.ok(byKey["france.bordeaux.sauternes.barsac"] >= 1, "no Barsac links");
    assert.ok(byKey["france.bordeaux.sauternes"] >= 1, "no Sauternes links");
    assert.ok(byKey["france.bordeaux.pessac-leognan"] >= 16, "Graves not linked");
    assert.ok(byKey["france.bordeaux.haut-medoc"] >= 5, "Haut-Médoc not linked");
  } finally {
    await client.end();
  }
});
```

- [ ] **Step 5: Run the test**

Run: `$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'; node --test scripts/bordeaux-appellation-link.test.mjs`
Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/20260829263300_designation_member_appellation_link.sql scripts/bordeaux-appellation-link.test.mjs
git commit -m "Bordeaux: link classified members to their appellation wine_place (backfill + test)"
```

---

### Task 2: Types + page-data extension

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (`wine_designation_members` Row + Insert)
- Modify: `src/lib/designations/page-data.ts`

**Interfaces:**
- Consumes: `appellation_wine_place_id` column (Task 1).
- Produces: `TabSystemMember` with `{ name, tier, tierRank, commune, localNote, appellationKey, appellationName }`.

- [ ] **Step 1: Add the column to the Row type**

In `src/lib/supabase/database.types.ts`, in `wine_designation_members` → `Row`, replace:

```ts
          wine_place_id: string | null;
          local_note: string | null;
```

with:

```ts
          wine_place_id: string | null;
          appellation_wine_place_id: string | null;
          local_note: string | null;
```

- [ ] **Step 2: Add the column to the Insert type**

In the same table's `Insert`, replace:

```ts
          wine_place_id?: string | null;
          local_note?: string | null;
```

with:

```ts
          wine_place_id?: string | null;
          appellation_wine_place_id?: string | null;
          local_note?: string | null;
```

- [ ] **Step 3: Extend `TabSystemMember`**

In `src/lib/designations/page-data.ts`, replace:

```ts
export type TabSystemMember = {
  name: string;
  tier: string | null;
  commune: string | null;
};
```

with:

```ts
export type TabSystemMember = {
  name: string;
  tier: string | null;
  tierRank: number | null;
  commune: string | null;
  localNote: string | null;
  appellationKey: string | null;
  appellationName: string | null;
};
```

- [ ] **Step 4: Extend the member select**

In the same file's `Promise.all`, replace:

```ts
      supabase
        .from("wine_designation_members")
        .select("designation_id, name, tier, commune")
        .order("tier_rank", { ascending: true })
        .order("sort_order", { ascending: true }),
```

with:

```ts
      supabase
        .from("wine_designation_members")
        .select(
          "designation_id, name, tier, tier_rank, commune, local_note, appellation_wine_place_id",
        )
        .order("tier_rank", { ascending: true })
        .order("sort_order", { ascending: true }),
```

- [ ] **Step 5: Resolve appellation places and map members**

Replace the block:

```ts
  const keyById = new Map((sys ?? []).map((s) => [s.id, s.key]));
  const membersByKey = new Map<string, TabSystemMember[]>();
  for (const m of mem ?? []) {
    const key = keyById.get(m.designation_id);
    if (!key) continue;
    const list = membersByKey.get(key) ?? [];
    list.push({
      name: m.name,
      tier: m.tier == null ? null : String(m.tier),
      commune: m.commune,
    });
    membersByKey.set(key, list);
  }
```

with:

```ts
  const apIds = [
    ...new Set(
      (mem ?? [])
        .map((m) => m.appellation_wine_place_id)
        .filter((v): v is string => !!v),
    ),
  ];
  const placeById = new Map<string, { name: string; canonicalKey: string }>();
  if (apIds.length > 0) {
    const { data: places } = await supabase
      .from("wine_places")
      .select("id, name, canonical_key")
      .in("id", apIds);
    for (const p of places ?? [])
      placeById.set(p.id, { name: p.name, canonicalKey: p.canonical_key });
  }

  const keyById = new Map((sys ?? []).map((s) => [s.id, s.key]));
  const membersByKey = new Map<string, TabSystemMember[]>();
  for (const m of mem ?? []) {
    const key = keyById.get(m.designation_id);
    if (!key) continue;
    const ap = m.appellation_wine_place_id
      ? placeById.get(m.appellation_wine_place_id)
      : undefined;
    const list = membersByKey.get(key) ?? [];
    list.push({
      name: m.name,
      tier: m.tier == null ? null : String(m.tier),
      tierRank: m.tier_rank,
      commune: m.commune,
      localNote: m.local_note,
      appellationKey: ap?.canonicalKey ?? null,
      appellationName: ap?.name ?? null,
    });
    membersByKey.set(key, list);
  }
```

- [ ] **Step 6: Typecheck**

Run: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`
Expected: `EXIT=0`, no output.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/supabase/database.types.ts src/lib/designations/page-data.ts
git commit -m "Designations: carry tierRank/localNote/appellation link on TabSystemMember"
```

---

### Task 3: Content — per-system pyramid meta + Cru Bourgeois prose

**Files:**
- Modify: `src/lib/designations/content.ts`

**Interfaces:**
- Produces: `DESIGNATION_CONTENT[<system key>].pyramid` for the four systems (tier colours in `tier_rank` order); `CRU_BOURGEOIS = { title, body }`.

- [ ] **Step 1: Add pyramid meta for the four systems**

In `src/lib/designations/content.ts`, replace the `"medoc-1855"` entry:

```ts
  "medoc-1855": {
    hero: { src: "/designations/medoc-1855.jpg", alt: "A château in the Médoc" },
    intro:
      "The Classification of 1855 was created for the Exposition Universelle in Paris. It ranks the top châteaux of the Médoc into five growths based on reputation and market price at the time.",
  },
```

with:

```ts
  "medoc-1855": {
    hero: { src: "/designations/medoc-1855.jpg", alt: "A château in the Médoc" },
    intro:
      "The Classification of 1855 was created for the Exposition Universelle in Paris. It ranks the top châteaux of the Médoc into five growths based on reputation and market price at the time.",
    pyramid: [
      { name: "Premier Cru", color: "#5C1A2B" },
      { name: "Deuxième Cru", color: "#7A2A3D" },
      { name: "Troisième Cru", color: "#8A3D52" },
      { name: "Quatrième Cru", color: "#9A7B4F" },
      { name: "Cinquième Cru", color: "#B78E42", textColor: "#2b0f18" },
    ],
  },
  "sauternes-1855": {
    intro:
      "The 1855 ranking also classified the sweet wines of Sauternes and Barsac: one Premier Cru Supérieur (Château d'Yquem), then the Premiers Crus and the Deuxièmes Crus.",
    pyramid: [
      { name: "Premier Cru Supérieur", color: "#5C1A2B" },
      { name: "Premier Cru", color: "#8A3D52" },
      { name: "Deuxième Cru", color: "#B78E42", textColor: "#2b0f18" },
    ],
  },
  "saint-emilion-grand-cru-classe": {
    intro:
      "Saint-Émilion's classification is revised roughly every ten years. It runs from Premier Grand Cru Classé A, to Premier Grand Cru Classé B, to Grand Cru Classé.",
    pyramid: [
      { name: "Premier Grand Cru Classé A", color: "#5C1A2B" },
      { name: "Premier Grand Cru Classé B", color: "#8A3D52" },
      { name: "Grand Cru Classé", color: "#B78E42", textColor: "#2b0f18" },
    ],
  },
  "graves-cru-classe": {
    intro:
      "The Cru Classé de Graves (1959) is a single flat tier — châteaux classified for red wine, white wine, or both. All lie within what is now Pessac-Léognan.",
    pyramid: [{ name: "Cru Classé", color: "#5C1A2B" }],
  },
```

- [ ] **Step 2: Add the Cru Bourgeois prose export**

In the same file, replace:

```ts
};

export const OVERVIEW_INTRO =
```

with:

```ts
};

export const CRU_BOURGEOIS = {
  title: "Cru Bourgeois du Médoc",
  body:
    "A separate Médoc classification sitting below the 1855 growths, re-ranked on a rolling basis (currently every five years) — so its roster changes too often to fix here. Since 2020 it has three levels, from the top: Cru Bourgeois Exceptionnel, Cru Bourgeois Supérieur, and Cru Bourgeois, awarded on quality and production standards rather than 1855's historic hierarchy.",
};

export const OVERVIEW_INTRO =
```

- [ ] **Step 3: Typecheck**

Run: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`
Expected: `EXIT=0`, no output.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/designations/content.ts
git commit -m "Designations: Bordeaux per-system pyramid meta + Cru Bourgeois explainer"
```

---

### Task 4: Bordeaux panel component + wire-in

**Files:**
- Create: `src/app/knowledge/designations/bordeaux-classification.tsx`
- Modify: `src/lib/designations/tabs.ts`
- Modify: `src/app/knowledge/designations/designations-tabs.tsx`

**Interfaces:**
- Consumes: `TabSystem` / `TabSystemMember` (Task 2), `DESIGNATION_CONTENT` + `CRU_BOURGEOIS` (Task 3).
- Produces: `BordeauxClassification({ systems, systemKeys })`; tab kind `"bordeaux"`.

- [ ] **Step 1: Create the component**

Create `src/app/knowledge/designations/bordeaux-classification.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CRU_BOURGEOIS, DESIGNATION_CONTENT } from "@/lib/designations/content";
import type { TabSystem, TabSystemMember } from "@/lib/designations/page-data";

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

      <div className="flex flex-col items-center gap-1">
        {tiers.map((t, i) => {
          const m = meta[i];
          const width =
            tiers.length === 1
              ? 70
              : 46 + (48 * i) / Math.max(tiers.length - 1, 1);
          const isActive = activeTier === t.tier;
          return (
            <button
              key={t.tier}
              type="button"
              onClick={() => setActiveTier(isActive ? null : t.tier)}
              style={{
                width: `${width}%`,
                backgroundColor: m?.color ?? "#8A3D52",
                color: m?.textColor ?? "#ffffff",
                outline: isActive
                  ? "2px solid #2b0f18"
                  : "2px solid transparent",
                outlineOffset: "2px",
              }}
              className="flex items-center justify-between gap-3 rounded-md px-4 py-3 font-heading transition-transform hover:-translate-y-px"
            >
              <span className="font-semibold">{t.tier}</span>
              <span className="text-xs opacity-90">
                {t.members.length} châteaux
              </span>
            </button>
          );
        })}
      </div>

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

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h3 className="font-heading text-lg font-semibold">
          {CRU_BOURGEOIS.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{CRU_BOURGEOIS.body}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `"bordeaux"` to the tab-kind union**

In `src/lib/designations/tabs.ts`, replace:

```ts
export type DesignationTabKind =
  | "overview"
  | "burgundy"
  | "systems"
  | "glossary"
  | "champagne";
```

with:

```ts
export type DesignationTabKind =
  | "overview"
  | "burgundy"
  | "bordeaux"
  | "systems"
  | "glossary"
  | "champagne";
```

- [ ] **Step 3: Switch the Bordeaux tab to the new kind**

In the same file, in the `DESIGNATION_TABS` array, replace:

```ts
  {
    slug: "bordeaux",
    label: "Bordeaux",
    kind: "systems",
    systemKeys: [
```

with:

```ts
  {
    slug: "bordeaux",
    label: "Bordeaux",
    kind: "bordeaux",
    systemKeys: [
```

- [ ] **Step 4: Import the component**

In `src/app/knowledge/designations/designations-tabs.tsx`, replace:

```tsx
import { BurgundyPyramid } from "./burgundy-pyramid";
```

with:

```tsx
import { BurgundyPyramid } from "./burgundy-pyramid";
import { BordeauxClassification } from "./bordeaux-classification";
```

- [ ] **Step 5: Add the render branch**

In the same file's panel selector, replace:

```tsx
      ) : tab.kind === "champagne" ? (
        <ChampagnePanel />
      ) : tab.kind === "systems" ? (
```

with:

```tsx
      ) : tab.kind === "champagne" ? (
        <ChampagnePanel />
      ) : tab.kind === "bordeaux" ? (
        <div className="flex flex-col gap-8">
          <BordeauxClassification
            systems={data.systems}
            systemKeys={tab.systemKeys ?? []}
          />
          <GlossaryList tab={tab} glossaryByName={glossaryByName} />
        </div>
      ) : tab.kind === "systems" ? (
```

- [ ] **Step 6: Index Bordeaux members in search**

In the same file's `buildIndex`, replace:

```ts
    if (t.kind === "systems") {
```

with:

```ts
    if (t.kind === "systems" || t.kind === "bordeaux") {
```

- [ ] **Step 7: Typecheck**

Run: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`
Expected: `EXIT=0`, no output.

- [ ] **Step 8: Commit and push**

```powershell
git add src/app/knowledge/designations/bordeaux-classification.tsx src/lib/designations/tabs.ts src/app/knowledge/designations/designations-tabs.tsx
git commit -m "Library: interactive Bordeaux classification (pyramid + château table + map links)"
git push
```

- [ ] **Step 9: QA after deploy (owner screenshots)**

Verify on `/knowledge` → Designations → Bordeaux: the four systems appear as a segmented switch; the pyramid renders per system (5/3/3/1 bands); clicking a band filters the table and "Show all" resets; the château table shows Growth/Château/Commune/Appellation with notes (e.g. Mouton's 1973 promotion); an Appellation link (e.g. Pauillac) opens `/knowledge/map?place=france.bordeaux.haut-medoc.pauillac`; the Cru Bourgeois explainer shows; the Library search finds a château (e.g. "Pontet-Canet") and jumps to the Bordeaux tab.

---

### Task 5: Map RPC — `classified_members`

**Files:**
- Create: `supabase/migrations/20260829263400_wine_place_context_classified_members.sql`
- Create: `scripts/wine-place-classified-members.test.mjs`

**Interfaces:**
- Consumes: `appellation_wine_place_id` (Task 1).
- Produces: `get_wine_place_context(...)` returns a new top-level `classified_members` array of `{ name, tier, tier_rank, system_key, system_name, local_note }`.

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260829263400_wine_place_context_classified_members.sql`. Its body is a `create or replace function public.get_wine_place_context(p_place_key text)` **identical to the current definition** in `supabase/migrations/20260808093000_wine_place_context_v2.sql` (copy it verbatim, header comment below), with exactly two additions.

Start the file with:

```sql
-- Extend get_wine_place_context: add classified_members — the classified
-- growths (1855 / Graves / Saint-Émilion châteaux) whose appellation is this
-- place, so the map place page can list e.g. Pauillac's First Growths.
-- create-or-replace: identical to 20260808093000 plus a classified_member_list
-- CTE and one output key.
```

**Addition 1 — the CTE.** In the copied body, find the end of the `dual_label_list` CTE (the last CTE before the final select) and replace:

```sql
    join wine_places o on o.id = x.other_id
  )
  select case
```

with:

```sql
    join wine_places o on o.id = x.other_id
  ),
  classified_member_list as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', m.name, 'tier', m.tier, 'tier_rank', m.tier_rank,
          'system_key', d.key, 'system_name', d.name, 'local_note', m.local_note
        )
        order by d.sort_order, m.tier_rank, m.sort_order
      ),
      '[]'::jsonb
    ) as items
    from wine_designation_members m
    join wine_designations d on d.id = m.designation_id
    join target t on m.appellation_wine_place_id = t.id
    where m.member_kind = 'ESTATE'
  )
  select case
```

**Addition 2 — the output key.** In the final `jsonb_build_object`, replace:

```sql
      'dual_labels', (select items from dual_label_list)
    )
  end
```

with:

```sql
      'dual_labels', (select items from dual_label_list),
      'classified_members', (select items from classified_member_list)
    )
  end
```

- [ ] **Step 2: Dry-run**

Run: `$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'; node scripts/scratch-apply.mjs --file supabase/migrations/20260829263400_wine_place_context_classified_members.sql --mode dry`
Expected: `DRY-OK 20260829263400 wine_place_context_classified_members`.

- [ ] **Step 3: Live-apply**

Run: `$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'; node scripts/scratch-apply.mjs --file supabase/migrations/20260829263400_wine_place_context_classified_members.sql --mode live`
Expected: `LIVE-APPLIED 20260829263400 wine_place_context_classified_members`.

- [ ] **Step 4: Write the RPC test**

Create `scripts/wine-place-classified-members.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

test("get_wine_place_context lists classified growths for Pauillac", async () => {
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    const { rows } = await client.query(
      "select get_wine_place_context('france.bordeaux.haut-medoc.pauillac') as ctx;",
    );
    const names = (rows[0].ctx.classified_members ?? []).map((m) => m.name);
    assert.ok(names.includes("Château Lafite Rothschild"), "Lafite missing");
    assert.ok(names.includes("Château Latour"), "Latour missing");
    assert.ok(names.includes("Château Mouton Rothschild"), "Mouton missing");
    assert.ok(names.length >= 18, `expected >=18 growths, got ${names.length}`);
  } finally {
    await client.end();
  }
});

test("a place with no classification returns an empty array", async () => {
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    const { rows } = await client.query(
      "select get_wine_place_context('france.bordeaux.pomerol') as ctx;",
    );
    assert.deepEqual(rows[0].ctx.classified_members, []);
  } finally {
    await client.end();
  }
});
```

- [ ] **Step 5: Run the test**

Run: `$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'; node --test scripts/wine-place-classified-members.test.mjs`
Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/20260829263400_wine_place_context_classified_members.sql scripts/wine-place-classified-members.test.mjs
git commit -m "Map: get_wine_place_context returns classified growths for a place"
```

---

### Task 6: Map UI — context type + "Classified growths" section

**Files:**
- Modify: `src/lib/wine-map/context.ts`
- Modify: `src/app/knowledge/map/knowledge-sections.tsx`

**Interfaces:**
- Consumes: RPC `classified_members` (Task 5).
- Produces: `WineClassifiedMember` type; a "Classified growths" section on the place page.

- [ ] **Step 1: Add the type + context field**

In `src/lib/wine-map/context.ts`, replace:

```ts
export type WineDualLabel = WinePlaceSummary & {
  direction: "MAY_BE_SOLD_AS" | "ALSO_SOLD_AS_THIS";
  note: string | null;
};

export type WinePlaceContext = {
```

with:

```ts
export type WineDualLabel = WinePlaceSummary & {
  direction: "MAY_BE_SOLD_AS" | "ALSO_SOLD_AS_THIS";
  note: string | null;
};

export type WineClassifiedMember = {
  name: string;
  tier: string | null;
  tier_rank: number;
  system_key: string;
  system_name: string;
  local_note: string | null;
};

export type WinePlaceContext = {
```

Then, in the same type, replace:

```ts
  nearby: WinePlaceSummary[];
  dual_labels: WineDualLabel[];
};
```

with:

```ts
  nearby: WinePlaceSummary[];
  dual_labels: WineDualLabel[];
  classified_members: WineClassifiedMember[];
};
```

- [ ] **Step 2: Default the field in the fetcher**

In the same file's `fetchWinePlaceContext` return, replace:

```ts
    nearby: data.nearby ?? [],
    dual_labels: data.dual_labels ?? [],
  };
```

with:

```ts
    nearby: data.nearby ?? [],
    dual_labels: data.dual_labels ?? [],
    classified_members: data.classified_members ?? [],
  };
```

- [ ] **Step 3: Update imports**

In `src/app/knowledge/map/knowledge-sections.tsx`, replace:

```ts
import { Award, Grape, MapPin, Tags, Wine } from "lucide-react";
```

with:

```ts
import { Award, Grape, MapPin, Medal, Tags, Wine } from "lucide-react";
```

And replace:

```ts
import type { WinePlaceContext, WinePlaceGrape } from "@/lib/wine-map/context";
```

with:

```ts
import type {
  WineClassifiedMember,
  WinePlaceContext,
  WinePlaceGrape,
} from "@/lib/wine-map/context";
```

- [ ] **Step 4: Add the grouping helper**

In the same file, replace:

```ts
export function grapeIconColor(color: string | null) {
  if (color === "RED") return "#7E1B26";
  if (color === "WHITE") return "#B78E42";
  return "#8A8A85";
}
```

with:

```ts
export function grapeIconColor(color: string | null) {
  if (color === "RED") return "#7E1B26";
  if (color === "WHITE") return "#B78E42";
  return "#8A8A85";
}

// Group classified growths by system, then tier, preserving the RPC's order
// (system sort_order → tier_rank → member sort_order).
function groupClassified(members: WineClassifiedMember[]) {
  const bySys = new Map<
    string,
    { systemName: string; tiers: Map<string, string[]> }
  >();
  for (const m of members) {
    let s = bySys.get(m.system_key);
    if (!s) {
      s = { systemName: m.system_name, tiers: new Map() };
      bySys.set(m.system_key, s);
    }
    const label = m.tier ?? "Classified";
    const names = s.tiers.get(label) ?? [];
    names.push(m.name);
    s.tiers.set(label, names);
  }
  return [...bySys.entries()].map(([systemKey, s]) => ({
    systemKey,
    systemName: s.systemName,
    tiers: [...s.tiers.entries()].map(([tier, names]) => ({ tier, names })),
  }));
}
```

- [ ] **Step 5: Destructure the field and render the section**

In the same file, replace:

```ts
  const { grapes, designations, nearby, dual_labels: dualLabels } = context;
```

with:

```ts
  const {
    grapes,
    designations,
    nearby,
    dual_labels: dualLabels,
    classified_members: classifiedMembers,
  } = context;
```

Then, immediately after the Designations section block:

```tsx
      {designations.length > 0 ? (
        <div>
          <SectionHeading icon={Award}>Designations</SectionHeading>
          <div className="flex flex-col gap-1.5 text-sm">
            {designations.map((d) => (
              <div key={d.key}>
                <span className="font-medium">{d.name}</span>
                <span className="text-muted-foreground"> — {d.description}</span>
                {d.local_note ? (
                  <span className="text-muted-foreground"> {d.local_note}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
```

insert:

```tsx
      {classifiedMembers.length > 0 ? (
        <div>
          <SectionHeading icon={Medal}>Classified growths</SectionHeading>
          <div className="flex flex-col gap-3 text-sm">
            {groupClassified(classifiedMembers).map((sys) => (
              <div key={sys.systemKey}>
                <p className="font-medium">{sys.systemName}</p>
                {sys.tiers.map((t) => (
                  <p key={t.tier} className="text-muted-foreground">
                    <span className="text-foreground">{t.tier}:</span>{" "}
                    {t.names.join(", ")}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
```

- [ ] **Step 6: Typecheck**

Run: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`
Expected: `EXIT=0`, no output.

- [ ] **Step 7: Commit and push**

```powershell
git add src/lib/wine-map/context.ts src/app/knowledge/map/knowledge-sections.tsx
git commit -m "Map: show a place's classified growths (Pauillac lists its 1855 châteaux)"
git push
```

- [ ] **Step 8: QA after deploy (owner screenshots)**

On `/knowledge/map?place=france.bordeaux.haut-medoc.pauillac`: a "Classified growths" section lists the 1855 Médoc châteaux grouped by growth (Premier: Lafite, Latour, Mouton; etc.). On `france.bordeaux.pomerol` (no classification): the section is absent. Round-trip: from the Library Bordeaux table, click Pauillac's Appellation link → lands on the map with the growths listed.

---

## Self-Review

**Spec coverage:**
- Presentation (pyramid + table, 4 systems, Cru Bourgeois prose): Tasks 3–4. ✓
- Data model (`appellation_wine_place_id` + total backfill + zero-NULL assert): Task 1. ✓
- Château→appellation link: Task 2 (data) + Task 4 (table Link). ✓
- Appellation→châteaux (RPC + section): Tasks 5–6. ✓
- Testing (backfill invariant, RPC output): Tasks 1, 5. ✓
- Non-goals respected (no producer link, no Cru Bourgeois list, no admin UI). ✓

**Type consistency:** `TabSystemMember` fields (`tierRank`, `localNote`, `appellationKey`, `appellationName`) are produced in Task 2 and consumed in Task 4. `WineClassifiedMember` fields (`system_key`, `system_name`, `tier`, `tier_rank`, `name`, `local_note`) match the RPC JSON (Task 5), the context type (Task 6 Step 1), and `groupClassified` (Task 6 Step 4). Output key `classified_members` is identical across RPC, context, and fetcher.

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Note: Tasks 1 and 5 apply live migrations and hit the live DB (need `$env:DB_PASSWORD`); they can't run in a sandbox without DB access.
