import Link from "next/link";
import { redirect } from "next/navigation";
import { FileUp, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/patterns/page-header";
import { AddWineButton } from "@/components/add-wine-button";
import { getCellarBottles } from "@/lib/cellar/bottles";
import { headerStats, headerSubtitle } from "@/lib/cellar/cellar-rows";
import { CellarBottles } from "./cellar-bottles";
import { CellarSubNav } from "./cellar-sub-nav";
import { CellarVisibilityControl } from "./cellar-visibility-control";

// Bottles (CC-U3, spec §3 routes, §5.1, D5, D6). `?tab=` redirects to the two
// other sub-pages (D5); `?lot=`/`?do=` are consumed by `CellarBottles` itself
// (D6) — this page only needs to type them through.
export default async function CellarPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; lot?: string; do?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  // Notes moved to Taste > Tasting notes: old /cellar?tab=notes links land there.
  if (tabParam === "notes") redirect("/taste/notes");
  if (tabParam === "history") redirect("/cellar/history");
  if (tabParam === "stats") redirect("/cellar/collection");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("cellar_visibility")
    .eq("id", user.id)
    .maybeSingle();
  const visibility = profile?.cellar_visibility ?? "PRIVATE";

  const rows = await getCellarBottles(supabase, user.id, user.id, { readOnly: false });
  const stats = headerStats(rows);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Cellar"
        subtitle={
          <>
            <span className="max-md:hidden">
              {headerSubtitle(stats, { phone: false, readOnly: false })}
            </span>
            <span className="md:hidden">
              {headerSubtitle(stats, { phone: true, readOnly: false })}
            </span>
          </>
        }
        actions={
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/cellar/import"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted md:pointer-fine:min-h-9"
              >
                <FileUp className="size-4" />
                Import CSV
              </Link>
              <AddWineButton
                kind="cellar"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 md:pointer-fine:min-h-9"
              >
                <Plus className="size-4" />
                Add a bottle
              </AddWineButton>
            </div>
            <CellarVisibilityControl userId={user.id} current={visibility} />
          </div>
        }
      />

      <CellarSubNav current="bottles" />

      <CellarBottles rows={rows} readOnly={false} />
    </div>
  );
}
