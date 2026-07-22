import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { WineForm } from "../../new/wine-form";

// Edit a wine's answer key after it's been added — only while the tasting is
// still DRAFT, and only by whoever added the wine (the host for host-entered
// wines, the contributing participant for their own BYO bottle). The
// updateWine action re-validates all of this server-side; this page is the
// friendly-guard layer.
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

  const { data: tasting } = await supabase
    .from("tastings")
    .select("*")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) {
    notFound();
  }

  const { data: wine } = await supabase
    .from("wines")
    .select("id, tasting_id, contributor_participant_id, is_revealed")
    .eq("id", wineId)
    .maybeSingle();
  if (!wine || wine.tasting_id !== tastingId) {
    notFound();
  }

  const backLink = (
    <Link
      href={`/tastings/${tastingId}`}
      className="text-sm text-muted-foreground underline underline-offset-4"
    >
      ← Back to tasting
    </Link>
  );

  if (tasting.status !== "DRAFT" || wine.is_revealed) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-8">
        <p>Wines can only be edited before the tasting starts.</p>
        {backLink}
      </div>
    );
  }

  let canEdit = false;
  if (wine.contributor_participant_id) {
    const { data: contributor } = await supabase
      .from("tasting_participants")
      .select("user_id")
      .eq("id", wine.contributor_participant_id)
      .maybeSingle();
    canEdit = contributor?.user_id === user.id;
  } else {
    canEdit = tasting.host_id === user.id;
  }
  if (!canEdit) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-8">
        <p>Only whoever added this wine can edit it.</p>
        {backLink}
      </div>
    );
  }

  const { data: answer } = await supabase
    .from("wine_answers")
    .select("*")
    .eq("wine_id", wineId)
    .maybeSingle();
  if (!answer) {
    notFound();
  }

  const [
    { data: countries },
    { data: regions },
    { data: grapes },
    { data: typeDesignations },
    nameById,
  ] = await Promise.all([
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("regions").select("id, name, country_id").order("name"),
    supabase.from("grapes").select("id, name").order("name"),
    supabase
      .from("type_designations")
      .select("id, name, category, country_id")
      .eq("is_active", true)
      .order("sort_order"),
    lookupAppellationAndProducerNames({
      appellationIds: [],
      producerIds: [answer.producer_id],
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-8">
      {backLink}
      <Card>
        <CardHeader>
          <CardTitle>Edit wine</CardTitle>
        </CardHeader>
        <CardContent>
          <WineForm
            tastingId={tastingId}
            wineId={wineId}
            countries={countries ?? []}
            regions={regions ?? []}
            grapes={grapes ?? []}
            typeDesignations={typeDesignations ?? []}
            initial={{
              country_id: answer.country_id,
              region_id: answer.region_id,
              appellation_id: answer.appellation_id,
              primary_grape_id: answer.primary_grape_id,
              secondary_grape_id: answer.secondary_grape_id,
              producer_id: answer.producer_id,
              producer_name: answer.producer_id
                ? (nameById.get(answer.producer_id) ?? null)
                : null,
              type_designation_id: answer.type_designation_id,
              vintage_kind: answer.vintage_kind,
              vintage_year: answer.vintage_year,
              vintage_tawny_years: answer.vintage_tawny_years,
              image_url: answer.image_url,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
