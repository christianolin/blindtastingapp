import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
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

export default async function TypeDesignationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: designations } = await supabase
    .from("type_designations")
    .select("id, name, category, description")
    .eq("is_active", true)
    .order("category")
    .order("sort_order");

  const byCategory = new Map<string, typeof designations>();
  for (const d of designations ?? []) {
    const key = d.category ?? "Other";
    byCategory.set(key, [...(byCategory.get(key) ?? []), d]);
  }
  const categories = [
    ...CATEGORY_ORDER.filter((c) => byCategory.has(c)),
    ...[...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

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
            Type Designations
          </h1>
          <p className="mt-2 text-muted-foreground">
            Terms like Kabinett, Grand Cru, or Tawny describe a wine&apos;s
            quality tier, aging, sweetness, or style — grouped here by
            category.
          </p>
        </div>

        {categories.map((category) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="text-base">{category}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y divide-border">
                {(byCategory.get(category) ?? []).map((d) => (
                  <li key={d.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="font-medium">{d.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {d.description ?? "No description yet."}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
