import { redirect } from "next/navigation";
import { OpenSheetOnLoad } from "@/components/add-wine/open-sheet-on-load";
import { createClient } from "@/lib/supabase/server";

// Catalog dedupe (owner, 2026-10-03): this page's own form created catalog wines
// without the "Already in the catalog?" check, so it now opens the add-wine
// sheet (cellar destination) over /cellar instead.
export default async function NewCellarLotPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <OpenSheetOnLoad kind="cellar" back="/cellar" backLabel="← Back to cellar" />;
}
