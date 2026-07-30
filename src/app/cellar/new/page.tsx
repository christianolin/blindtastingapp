import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { CellarLotForm } from "./cellar-lot-form";

export default async function NewCellarLotPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: countries },
    { data: regions },
    { data: grapes },
    { data: typeDesignations },
    { data: profile },
  ] = await Promise.all([
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("regions").select("id, name, country_id").order("name"),
    supabase.from("grapes").select("id, name").order("name"),
    supabase
      .from("type_designations")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("profiles")
      .select("preferred_currency")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-6">
      <Link
        href="/cellar"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Back to cellar
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Add a wine to your cellar</CardTitle>
        </CardHeader>
        <CardContent>
          <CellarLotForm
            countries={countries ?? []}
            regions={regions ?? []}
            grapes={grapes ?? []}
            typeDesignations={typeDesignations ?? []}
            defaultCurrency={profile?.preferred_currency ?? "DKK"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
