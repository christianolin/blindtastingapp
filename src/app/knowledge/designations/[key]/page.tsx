import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getDesignationSystem } from "@/lib/designations/queries";
import { DESIGNATION_CONTENT } from "@/lib/designations/content";
import { DesignationMap } from "./designation-map";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return { title: `${key} · Designations · Blindr` };
}

export default async function DesignationDeepDivePage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { key } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const detail = await getDesignationSystem(supabase, key);
  if (!detail) notFound();

  const { system, members, hasPlaces, subregions, visibleKeys } = detail;
  const content = DESIGNATION_CONTENT[key] ?? {};
  const intro = content.intro ?? system.description;
  const activeTab = tab === "list" ? "list" : "overview";
  const secondLabel =
    members[0]?.memberKind === "ESTATE" ? "Châteaux" : "Vineyards";
  const base = `/knowledge/designations/${key}`;
  const regionKey = visibleKeys[0] ?? "";

  // Group members by tier for the tiered (estate) shape; members already come
  // ordered by tier_rank, so first-seen order is correct.
  const tiers: { tier: string; members: typeof members }[] = [];
  for (const m of members) {
    const label = m.tier ?? "Classified";
    let t = tiers.find((x) => x.tier === label);
    if (!t) {
      t = { tier: label, members: [] };
      tiers.push(t);
    }
    t.members.push(m);
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <nav className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <Link href="/knowledge" className="hover:text-foreground">Library</Link>
              <span>›</span>
              <Link href="/knowledge/designations" className="hover:text-foreground">
                Designations
              </Link>
              {system.displayGroup ? (
                <>
                  <span>›</span>
                  <span>{system.displayGroup}</span>
                </>
              ) : null}
              <span>›</span>
              <span className="text-foreground">{system.name}</span>
            </nav>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              {system.name}
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">{intro}</p>
          </div>
          {content.hero ? (
            <div
              className="hidden aspect-[16/9] w-64 shrink-0 rounded-lg bg-cover bg-center sm:block"
              style={{
                backgroundImage: `linear-gradient(135deg, rgba(92,26,43,0.25), rgba(183,142,66,0.25)), url(${content.hero.src})`,
              }}
              role="img"
              aria-label={content.hero.alt}
            />
          ) : null}
        </div>

        <Tabs
          items={[
            { key: "overview", label: "Overview", href: `${base}?tab=overview` },
            {
              key: "list",
              label: secondLabel,
              href: `${base}?tab=list`,
              count: members.length,
            },
          ]}
          activeKey={activeTab}
        />

        {activeTab === "overview" ? (
          hasPlaces ? (
            <div className="flex flex-col gap-6">
              <div className="grid gap-6 lg:grid-cols-2">
                {content.hierarchy ? (
                  <div className="flex flex-col gap-2">
                    <h2 className="font-heading text-xl font-semibold">
                      The hierarchy
                    </h2>
                    <div className="flex flex-col gap-1.5">
                      {content.hierarchy.map((h, i) => (
                        <div
                          key={h.tier}
                          className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
                          style={{ width: `${100 - i * 12}%` }}
                        >
                          <span className="font-medium">{h.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {h.count ?? h.note ?? ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="min-h-[420px]">
                  {regionKey ? (
                    <DesignationMap
                      visibleKeys={visibleKeys}
                      regionKey={regionKey}
                    />
                  ) : null}
                </div>
              </div>
              {subregions.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h2 className="font-heading text-xl font-semibold">
                    By sub-region
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {subregions.map((s) => (
                      <Link
                        key={s.canonicalKey}
                        href={`/knowledge/map?place=${s.canonicalKey}`}
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                      >
                        <span className="font-medium">{s.subregion}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.count} {s.count === 1 ? "vineyard" : "vineyards"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <h2 className="font-heading text-xl font-semibold">
                The {tiers.length} growths
              </h2>
              <div className="flex flex-col gap-3">
                {tiers.map((t) => (
                  <Card key={t.tier}>
                    <CardContent className="flex flex-col gap-2 pt-6">
                      <div className="flex items-center justify-between">
                        <span className="font-heading text-lg font-semibold">
                          {t.tier}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t.members.length}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t.members.map((m) => m.name).join(" · ")}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[m.commune, m.tier].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
