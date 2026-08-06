import { requireUser } from "@/lib/auth/dal";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { NewWineForm } from "./new-wine-form";

export default async function NewCellarWinePage() {
  const supabase = await createClient();
  const user = await requireUser();

  const [{ data: countries }, { data: regions }, { data: grapes }, { data: typeDesignations }] =
    await Promise.all([
      supabase.from("countries").select("id, name").order("name"),
      supabase.from("regions").select("id, name, country_id").order("name"),
      supabase.from("grapes").select("id, name").order("name"),
      supabase.from("type_designations").select("id, name").eq("is_active", true).order("sort_order"),
    ]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-6">
      <Link href="/catalog" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        ← Back to catalog
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Add a wine</CardTitle>
        </CardHeader>
        <CardContent>
          <NewWineForm
            countries={countries ?? []}
            regions={regions ?? []}
            grapes={grapes ?? []}
            typeDesignations={typeDesignations ?? []}
            userId={user.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
