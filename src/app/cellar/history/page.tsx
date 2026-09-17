import { redirect } from "next/navigation";
import { PageHeader } from "@/components/patterns/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCellarHistory } from "@/lib/cellar/history";
import { CellarSubNav } from "../cellar-sub-nav";
import { HistoryView } from "./history-view";

// CC-U6, spec §5.7, D5, D8; refinements 12, 22, 23. Every bottle that has
// left the owner's cellar — always private (`cellar_consumptions` has no
// read policy beyond the owner), even when the cellar itself is PUBLIC.
export default async function CellarHistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rows = await getCellarHistory(supabase, user.id);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
      <PageHeader title="History" />
      <CellarSubNav current="history" />
      <div className="max-md:hidden">
        <h2 className="font-heading text-2xl font-semibold">
          Every bottle that has left your cellar
        </h2>
        <p className="text-sm text-muted-foreground">
          Always private, even when your cellar is not
        </p>
      </div>
      <p className="text-sm text-muted-foreground md:hidden">
        Always private, even when your cellar is not
      </p>
      <HistoryView rows={rows} />
    </div>
  );
}
