import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { WineMapExplorer } from "./wine-map-explorer";

export const metadata = {
  title: "Wine Map · Knowledge · Blindr",
};

export default async function WineMapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Small, hand-curated tree (currently 14 rows) — fetched in full and built
  // into a tree client-side rather than paginated/queried per level.
  const { data: nodes } = await supabase
    .from("wine_map_nodes")
    .select("*")
    .order("sort_order");

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          <Link
            href="/knowledge"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            ← Knowledge
          </Link>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Wine Map
          </h1>
          <p className="mt-2 text-muted-foreground">
            Click through from country to region to appellation.
          </p>
        </div>

        <WineMapExplorer nodes={nodes ?? []} />
      </div>
    </div>
  );
}
