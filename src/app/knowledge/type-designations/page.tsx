import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/app-header";
import { KnowledgeTabs } from "@/components/knowledge-tabs";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Type Designations · Knowledge · Blindr",
};

// Scoring category grouping (type_designations.category) — see the picker in
// the answer-key / guess forms.
const CATEGORY_ORDER = [
  "Prädikat",
  "Quality Classification",
  "Aging Classification",
  "Sparkling Dosage",
  "Fortified Style",
  "Sweetness",
];

export default async function TypeDesignationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let query = supabase
    .from("type_designations")
    .select("id, name, category, description")
    .eq("is_active", true)
    .order("category")
    .order("sort_order");
  if (q) query = query.ilike("name", `%${q}%`);
  const { data: designations } = await query;

  const byCategory = new Map<string, typeof designations>();
  for (const d of designations ?? []) {
    const key = d.category ?? "Other";
    byCategory.set(key, [...(byCategory.get(key) ?? []), d]);
  }
  const categories = [
    ...CATEGORY_ORDER.filter((c) => byCategory.has(c)),
    ...[...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c)),
  ];
  const total = (designations ?? []).length;

  // Classification systems (wine_designations) + their ranked members. Each
  // system links to the glossary term it deep-dives (type_designation_id), so a
  // term like "Grand Cru Classé" expands inline into the château/vineyard ranks
  // — no separate Classifications section. RLS exposes PUBLISHED rows only.
  const { data: systems } = await supabase
    .from("wine_designations")
    .select("id, key, name, description, type_designation_id, sort_order")
    .order("sort_order");
  const { data: members } = await supabase
    .from("wine_designation_members")
    .select(
      "id, designation_id, member_kind, name, tier, tier_rank, commune, sort_order, wine_place_id",
    )
    .order("tier_rank")
    .order("sort_order");
  const memberPlaceIds = [
    ...new Set(
      (members ?? []).flatMap((m) => (m.wine_place_id ? [m.wine_place_id] : [])),
    ),
  ];
  const { data: memberPlaces } =
    memberPlaceIds.length > 0
      ? await supabase
          .from("wine_places")
          .select("id, name, canonical_key")
          .in("id", memberPlaceIds)
      : { data: [] as { id: string; name: string; canonical_key: string }[] };
  const memberPlaceById = new Map((memberPlaces ?? []).map((p) => [p.id, p]));

  const membersBySystem = new Map<string, NonNullable<typeof members>>();
  for (const m of members ?? []) {
    membersBySystem.set(m.designation_id, [
      ...(membersBySystem.get(m.designation_id) ?? []),
      m,
    ]);
  }
  // Systems (with members) grouped by the glossary term they deep-dive.
  const systemsByDesignation = new Map<string, NonNullable<typeof systems>>();
  for (const s of systems ?? []) {
    if (!s.type_designation_id || !membersBySystem.has(s.id)) continue;
    systemsByDesignation.set(s.type_designation_id, [
      ...(systemsByDesignation.get(s.type_designation_id) ?? []),
      s,
    ]);
  }
  // Members arrive sorted by tier_rank then sort_order, so tiers fall out of one
  // linear pass.
  const tiersFor = (systemId: string) => {
    const list = membersBySystem.get(systemId) ?? [];
    const tiers: { tier: string; members: typeof list }[] = [];
    for (const m of list) {
      const label = m.tier ?? "Members";
      const last = tiers[tiers.length - 1];
      if (last && last.tier === label) last.members.push(m);
      else tiers.push({ tier: label, members: [m] });
    }
    return tiers;
  };

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-6 sm:p-8">
        <KnowledgeTabs />

        {/* Mobile search — desktop search sits in the side nav. */}
        <form method="GET" className="lg:hidden">
          <Input name="q" defaultValue={q ?? ""} placeholder="Search designations" />
        </form>

        <div className="flex gap-8">
          {/* Side nav: search + a category jump list (a dot marks terms that
              expand into a classification deep-dive). */}
          <nav className="sticky top-20 hidden h-[calc(100vh-6rem)] w-56 shrink-0 flex-col overflow-y-auto lg:flex">
            <form method="GET" className="mb-3">
              <Input name="q" defaultValue={q ?? ""} placeholder="Search designations" />
            </form>
            <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">
              {total} designation{total === 1 ? "" : "s"}
            </p>
            <div className="flex flex-col gap-3">
              {categories.map((category) => (
                <div key={category}>
                  <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">
                    {category}
                  </p>
                  <ul className="flex flex-col">
                    {(byCategory.get(category) ?? []).map((d) => (
                      <li key={d.id}>
                        <a
                          href={`#designation-${d.id}`}
                          className="block truncate rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {d.name}
                          {systemsByDesignation.has(d.id) ? (
                            <span className="text-primary"> ·</span>
                          ) : null}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <div>
              <h1 className="font-heading text-3xl font-semibold tracking-tight">
                Type Designations
              </h1>
              <p className="mt-2 text-muted-foreground">
                Terms like Kabinett, Grand Cru, or Tawny describe a wine&apos;s
                quality tier, aging, sweetness, or style. A few — marked with a
                dot — <span className="text-primary">expand</span> into the real
                ranked systems behind them (the 1855 classification, the Burgundy
                grand crus…).
              </p>
            </div>

            {total === 0 ? (
              <p className="text-sm text-muted-foreground">No designations found.</p>
            ) : (
              categories.map((category) => (
                <Card key={category}>
                  <CardHeader>
                    <CardTitle className="text-base">{category}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-col divide-y divide-border">
                      {(byCategory.get(category) ?? []).map((d) => {
                        const dSystems = systemsByDesignation.get(d.id) ?? [];
                        return (
                          <li
                            key={d.id}
                            id={`designation-${d.id}`}
                            className="scroll-mt-20 py-2.5 first:pt-0 last:pb-0"
                          >
                            {dSystems.length === 0 ? (
                              <>
                                <p className="font-medium">{d.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {d.description ?? "No description yet."}
                                </p>
                              </>
                            ) : (
                              <details className="group">
                                <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium">
                                      {d.name}{" "}
                                      <span className="text-xs font-normal text-primary">
                                        · deep dive
                                      </span>
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {d.description ?? "No description yet."}
                                    </p>
                                  </div>
                                  <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                                </summary>
                                <div className="mt-3 flex flex-col gap-4 border-l-2 border-border pl-4">
                                  {dSystems.map((s) => {
                                    const tiers = tiersFor(s.id);
                                    const sysMembers = membersBySystem.get(s.id) ?? [];
                                    const noun =
                                      sysMembers[0]?.member_kind === "SITE"
                                        ? "vineyards"
                                        : "châteaux";
                                    return (
                                      <div
                                        key={s.id}
                                        id={`classification-${s.key}`}
                                        className="scroll-mt-20"
                                      >
                                        <p className="font-heading text-sm font-medium">
                                          {s.name}
                                        </p>
                                        <p className="mb-2 text-xs text-muted-foreground">
                                          {tiers.length > 1 ? `${tiers.length} tiers · ` : ""}
                                          {sysMembers.length} {noun}
                                          {s.description ? ` — ${s.description}` : ""}
                                        </p>
                                        {tiers.map(({ tier, members: tierMembers }) => (
                                          <div key={tier} className="mb-2">
                                            <div className="mb-1 flex items-center gap-2">
                                              <p className="text-xs font-medium">{tier}</p>
                                              <Badge variant="secondary">
                                                {tierMembers.length}
                                              </Badge>
                                            </div>
                                            <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                                              {tierMembers.map((m) => {
                                                const place = m.wine_place_id
                                                  ? memberPlaceById.get(m.wine_place_id)
                                                  : undefined;
                                                return (
                                                  <li key={m.id} className="text-sm">
                                                    {place ? (
                                                      <Link
                                                        href={`/knowledge/map?place=${place.canonical_key}`}
                                                        className="font-medium underline-offset-4 hover:underline"
                                                      >
                                                        {m.name}
                                                      </Link>
                                                    ) : (
                                                      <span className="font-medium">{m.name}</span>
                                                    )}
                                                    {m.commune ? (
                                                      <span className="text-muted-foreground">
                                                        {" "}
                                                        — {m.commune}
                                                      </span>
                                                    ) : null}
                                                  </li>
                                                );
                                              })}
                                            </ul>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })}
                                </div>
                              </details>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
