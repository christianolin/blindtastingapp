import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getDesignationSystem } from "@/lib/designations/queries";
import { DESIGNATION_CONTENT } from "@/lib/designations/content";
import { ClassificationPyramid } from "./classification-pyramid";
import { SubregionCrus } from "./subregion-crus";

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
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const detail = await getDesignationSystem(supabase, key);
  if (!detail) notFound();

  const { system, members, hasPlaces, subregions } = detail;
  const content = DESIGNATION_CONTENT[key] ?? {};
  const intro = content.intro ?? system.description;

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
                  <Link
                    href="/knowledge/designations"
                    className="hover:text-foreground"
                  >
                    {system.displayGroup}
                  </Link>
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

        {hasPlaces ? (
          <div
            className={
              content.pyramid
                ? "grid gap-8 lg:grid-cols-2 lg:items-start"
                : "flex flex-col gap-6"
            }
          >
            {content.pyramid ? (
              <section className="flex flex-col gap-3">
                <h2 className="font-heading text-xl font-semibold">
                  The hierarchy
                </h2>
                <ClassificationPyramid tiers={content.pyramid} />
              </section>
            ) : null}
            <section className="flex flex-col gap-3">
              <h2 className="font-heading text-xl font-semibold">
                {subregions.length > 0 ? "Vineyards by sub-region" : "Vineyards"}
              </h2>
              {subregions.length > 0 ? (
                <SubregionCrus subregions={subregions} />
              ) : (
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {members.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <span className="text-sm font-medium">{m.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.commune ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <h2 className="font-heading text-xl font-semibold">Classification</h2>
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
        )}
      </div>
    </div>
  );
}
