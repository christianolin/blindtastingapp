import Link from "next/link";
import { redirect } from "next/navigation";
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

  const buildHref = (params: { q?: string; color?: string }) => {
    const usp = new URLSearchParams();
    if (params.q) usp.set("q", params.q);
    if (params.color && params.color !== "ALL") usp.set("color", params.color);
    const qs = usp.toString();
    return qs ? `/knowledge/grapes?${qs}` : "/knowledge/grapes";
  };

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-8">
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
              <Card key={g.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
