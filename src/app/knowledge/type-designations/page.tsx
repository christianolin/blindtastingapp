import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/app-header";
import { KnowledgeTabs } from "@/components/knowledge-tabs";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Type Designations · Knowledge · Blindr",
};

// Same category grouping used for scoring (type_designations.category) — see
// the type-designation-field.tsx picker used in the answer-key/guess forms.
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
  if (!user) {
    redirect("/login");
  }

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

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-6 sm:p-8">
        <KnowledgeTabs />

        {/* Mobile search — the desktop search sits in the side nav (hidden
            below lg). */}
        <form method="GET" className="lg:hidden">
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search designations"
          />
        </form>

        <div className="flex gap-8">
          {/* Side nav: search + a scrollable jump list grouped by category;
              click a name to scroll to its card. */}
          <nav className="sticky top-20 hidden h-[calc(100vh-6rem)] w-56 shrink-0 flex-col overflow-y-auto lg:flex">
            <form method="GET" className="mb-3">
              <Input
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search designations"
              />
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
                quality tier, aging, sweetness, or style — grouped here by
                category.
              </p>
            </div>

            {total === 0 ? (
              <p className="text-sm text-muted-foreground">
                No designations found.
              </p>
            ) : (
              categories.map((category) => (
                <Card key={category}>
                  <CardHeader>
                    <CardTitle className="text-base">{category}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-col divide-y divide-border">
                      {(byCategory.get(category) ?? []).map((d) => (
                        <li
                          key={d.id}
                          id={`designation-${d.id}`}
                          className="scroll-mt-20 py-2.5 first:pt-0 last:pb-0"
                        >
                          <p className="font-medium">{d.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {d.description ?? "No description yet."}
                          </p>
                        </li>
                      ))}
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
