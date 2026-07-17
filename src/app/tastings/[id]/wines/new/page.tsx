import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { WineForm } from "./wine-form";

export default async function NewWinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tastingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: tasting } = await supabase
    .from("tastings")
    .select("*")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) {
    notFound();
  }

  const isHost = tasting.host_id === user.id;

  if (tasting.wine_source === "HOST_PROVIDES") {
    if (!isHost) {
      return (
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-8">
          <p>Only the host adds wines for this tasting.</p>
          <Link
            href={`/tastings/${tastingId}`}
            className="text-sm underline underline-offset-4"
          >
            ← Back to tasting
          </Link>
        </div>
      );
    }
  } else {
    const { data: participant } = await supabase
      .from("tasting_participants")
      .select("id")
      .eq("tasting_id", tastingId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!participant) {
      return (
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-8">
          <p>You&apos;re not a participant in this tasting.</p>
        </div>
      );
    }
    // Bring-your-own allows any number of bottles per person, so no
    // already-added guard here.
  }

  const [
    { data: countries },
    { data: regions },
    { data: grapes },
    { data: typeDesignations },
  ] = await Promise.all([
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("regions").select("id, name, country_id").order("name"),
    supabase.from("grapes").select("id, name").order("name"),
    supabase
      .from("type_designations")
      .select("id, name, category, country_id")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-8">
      <Link
        href={`/tastings/${tastingId}`}
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Back to tasting
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Add a wine</CardTitle>
        </CardHeader>
        <CardContent>
          <WineForm
            tastingId={tastingId}
            countries={countries ?? []}
            regions={regions ?? []}
            grapes={grapes ?? []}
            typeDesignations={typeDesignations ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
