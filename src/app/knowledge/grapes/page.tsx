import Link from "next/link";
import { redirect } from "next/navigation";
import { Grape as GrapeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { GrapeColor } from "@/lib/supabase/database.types";

export const metadata = {
  title: "Grape Library · Knowledge · Blindr",
};

const COLOR_FILTERS: { value: GrapeColor | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "RED", label: "Red" },
  { value: "WHITE", label: "White" },
];

export default async function GrapeLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; color?: string }>;
}) {
  const { q, color } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Reuses the same `grapes` table every wine_answers/guesses FK points at,
  // so any grape added via a tasting's "add new" flow shows up here too
  // (initially with no profile, until one is curated).
  let query = supabase.from("grapes").select("*").order("name");
  if (q) query = query.ilike("name", `%${q}%`);
  if (color === "RED" || color === "WHITE") query = query.eq("color", color);
  const { data: grapes } = await query;

  // Where each grape is on the wine map (RLS: PUBLISHED links on VERIFIED
  // places only) — rendered as clickable map deep-links per grape.
  const { data: grapeLinks } = await supabase
    .from("wine_place_grapes")
    .select("grape_id, wine_place_id");
  const linkedPlaceIds = [
    ...new Set((grapeLinks ?? []).map((l) => l.wine_place_id)),
  ];
  const { data: linkedPlaces } =
    linkedPlaceIds.length > 0
      ? await supabase
          .from("wine_places")
          .select("id, name, canonical_key")
          .in("id", linkedPlaceIds)
      : { data: [] as { id: string; name: string; canonical_key: string }[] };
  const placeById = new Map((linkedPlaces ?? []).map((p) => [p.id, p]));
  const placesByGrape = new Map<string, { name: string; key: string }[]>();
  for (const link of grapeLinks ?? []) {
    const place = placeById.get(link.wine_place_id);
    if (!place) continue;
    const list = placesByGrape.get(link.grape_id) ?? [];
    list.push({ name: place.name, key: place.canonical_key });
    placesByGrape.set(link.grape_id, list);
  }

  const buildHref = (params: { q?: string; color?: string }) => {
    const usp = new URLSearchParams();
    if (params.q) usp.set("q", params.q);
    if (params.color && params.color !== "ALL") usp.set("color", params.color);
    const qs = usp.toString();
    return qs ? `/knowledge/grapes?${qs}` : "/knowledge/grapes";
  };

  const grapeDotColor = (c: string | null) =>
    c === "RED" ? "#7E1B26" : c === "WHITE" ? "#B78E42" : "#8A8A85";

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-8 p-6 sm:p-8">
        {/* Left nav: a dense, scrollable jump list — icon + name only —
            so you can skim the whole library and click straight to a card. */}
        <nav className="sticky top-20 hidden h-[calc(100vh-6rem)] w-52 shrink-0 flex-col overflow-y-auto lg:flex">
          <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">
            {(grapes ?? []).length} grapes
          </p>
          <ul className="flex flex-col">
            {(grapes ?? []).map((g) => (
              <li key={g.id}>
                <a
                  href={`#grape-${g.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <GrapeIcon
                    className="size-4 shrink-0"
                    style={{ color: grapeDotColor(g.color) }}
                  />
                  <span className="truncate">{g.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div>
          <Link
            href="/knowledge"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            ← Knowledge
          </Link>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Grape Library
          </h1>
          <p className="mt-2 text-muted-foreground">
            The same grape list used across every tasting, with tasting notes
            for the most common varieties.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form method="GET" className="flex-1">
            {color ? <input type="hidden" name="color" value={color} /> : null}
            <Input name="q" defaultValue={q ?? ""} placeholder="Search by name" />
          </form>
          <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
            {COLOR_FILTERS.map((f) => {
              const isActive = (color ?? "ALL") === f.value;
              return (
                <Link
                  key={f.value}
                  href={buildHref({ q, color: f.value })}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </Link>
              );
            })}
          </div>
        </div>

        {(grapes ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No grapes found.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {(grapes ?? []).map((g) => (
              <Card key={g.id} id={`grape-${g.id}`} className="scroll-mt-20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <GrapeIcon
                      className="size-5 shrink-0"
                      style={{
                        color:
                          g.color === "RED"
                            ? "#7E1B26"
                            : g.color === "WHITE"
                              ? "#B78E42"
                              : "#8A8A85",
                      }}
                    />
                    {g.name}
                    {g.color ? (
                      <Badge
                        variant="secondary"
                        className={
                          g.color === "RED"
                            ? "bg-primary/10 text-primary"
                            : "bg-gold/15 text-gold-deep"
                        }
                      >
                        {g.color === "RED" ? "Red" : "White"}
                      </Badge>
                    ) : null}
                  </CardTitle>
                  {g.skin_color ? (
                    <p className="text-xs text-muted-foreground">
                      Skin: {g.skin_color}
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {g.description ? (
                    <div className="flex flex-col gap-3">
                      <p className="text-sm text-muted-foreground">
                        {g.description}
                      </p>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                        {g.typical_aromas ? (
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              Typical aromas
                            </dt>
                            <dd>{g.typical_aromas}</dd>
                          </div>
                        ) : null}
                        {g.typical_acidity ? (
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              Acidity
                            </dt>
                            <dd>{g.typical_acidity}</dd>
                          </div>
                        ) : null}
                        {g.typical_tannin ? (
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              Tannin
                            </dt>
                            <dd>{g.typical_tannin}</dd>
                          </div>
                        ) : null}
                        {g.typical_body ? (
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              Body
                            </dt>
                            <dd>{g.typical_body}</dd>
                          </div>
                        ) : null}
                        {g.typical_alcohol ? (
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              Alcohol
                            </dt>
                            <dd>{g.typical_alcohol}</dd>
                          </div>
                        ) : null}
                        {g.main_regions ? (
                          <div className="col-span-2 sm:col-span-3">
                            <dt className="text-xs text-muted-foreground">
                              Main growing regions
                            </dt>
                            <dd>{g.main_regions}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No profile yet.
                    </p>
                  )}
                  {(placesByGrape.get(g.id) ?? []).length > 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      On the wine map:{" "}
                      {(placesByGrape.get(g.id) ?? [])
                        .slice(0, 6)
                        .map((p, i) => (
                          <span key={p.key}>
                            {i > 0 ? " · " : ""}
                            <Link
                              className="underline underline-offset-4 hover:text-foreground"
                              href={`/knowledge/map?place=${p.key}`}
                            >
                              {p.name}
                            </Link>
                          </span>
                        ))}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
