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

    const { data: existingWine } = await supabase
      .from("wines")
      .select("id")
      .eq("tasting_id", tastingId)
      .eq("contributor_participant_id", participant.id)
      .maybeSingle();

    if (existingWine) {
      return (
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-8">
          <p>You&apos;ve already added your wine to this tasting.</p>
          <Link
            href={`/tastings/${tastingId}`}
            className="text-sm underline underline-offset-4"
          >
            ← Back to tasting
          </Link>
        </div>
      );
    }
  }

  const [
    { data: countries },
    { data: regions },
    { data: appellations },
    { data: grapes },
    { data: producers },
    { data: typeDesignations },
  ] = await Promise.all([
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("regions").select("id, name, country_id").order("name"),
    supabase.from("appellations").select("id, name, region_id").order("name"),
    supabase.from("grapes").select("id, name").order("name"),
    supabase.from("producers").select("id, name").order("name"),
    supabase.from("type_designations").select("id, name").order("name"),
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
            appellations={appellations ?? []}
            grapes={grapes ?? []}
            producers={producers ?? []}
            typeDesignations={typeDesignations ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
