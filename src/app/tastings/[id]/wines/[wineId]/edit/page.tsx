import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Legacy route (spec §C.6, D13). Editing a glass happens in the add-wine sheet's
// by-hand form, so the person who added this glass is sent to the lobby, which
// opens the sheet on it from `?editWine=`. The sheet's load and save apply the
// edit guard; this page only checks who added the glass (`is_wine_adder`).
export default async function EditWinePage({
  params,
}: {
  params: Promise<{ id: string; wineId: string }>;
}) {
  const { id: tastingId, wineId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: isAdder } = await supabase.rpc("is_wine_adder", { p_wine_id: wineId });
  if (isAdder === true) {
    redirect(`/tastings/${tastingId}?editWine=${encodeURIComponent(wineId)}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-8">
      <p>Only the person who added this glass can edit it.</p>
      <Link
        href={`/tastings/${tastingId}`}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to tasting
      </Link>
    </div>
  );
}
