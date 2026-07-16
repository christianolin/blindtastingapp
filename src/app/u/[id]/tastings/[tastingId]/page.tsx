import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";

const CATEGORY_LABELS: Record<string, string> = {
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  primary_grape: "Primary grape",
  secondary_grape: "Secondary grape",
  producer: "Producer",
  type_designation: "Type designation",
  vintage: "Vintage",
};

export default async function ProfileTastingHistoryPage({
  params,
}: {
  params: Promise<{ id: string; tastingId: string }>;
}) {
  const { id, tastingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", id)
    .maybeSingle();
  if (!profile) {
    notFound();
  }

  const { data: tasting } = await supabase
    .from("tastings")
    .select("id, name")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) {
    notFound();
  }

  const { data: participant } = await supabase
    .from("tasting_participants")
    .select("id")
    .eq("tasting_id", tastingId)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (!participant) {
    notFound();
  }

  const [
    { data: wines },
    { data: countries },
    { data: regions },
    { data: grapes },
    { data: typeDesignations },
  ] = await Promise.all([
    supabase
      .from("wines")
      .select("id, position")
      .eq("tasting_id", tastingId)
      .eq("is_revealed", true)
      .order("position"),
    supabase.from("countries").select("id, name"),
    supabase.from("regions").select("id, name"),
    supabase.from("grapes").select("id, name"),
    supabase.from("type_designations").select("id, name"),
  ]);

  const wineIds = (wines ?? []).map((w) => w.id);
  const [{ data: answers }, { data: guesses }] = await Promise.all([
    supabase.from("wine_answers").select("*").in("wine_id", wineIds.length > 0 ? wineIds : [""]),
    supabase
      .from("guesses")
      .select("*")
      .eq("participant_id", participant.id)
      .in("wine_id", wineIds.length > 0 ? wineIds : [""]),
  ]);
  const answerByWineId = new Map((answers ?? []).map((a) => [a.wine_id, a]));
  const guessByWineId = new Map((guesses ?? []).map((g) => [g.wine_id, g]));

  const nameById = new Map<string, string>();
  for (const list of [countries, regions, grapes, typeDesignations]) {
    for (const row of list ?? []) nameById.set(row.id, row.name);
  }
  const lookedUpNames = await lookupAppellationAndProducerNames({
    appellationIds: [
      ...(answers ?? []).map((a) => a.appellation_id),
      ...(guesses ?? []).map((g) => g.appellation_id),
    ],
    producerIds: [
      ...(answers ?? []).map((a) => a.producer_id),
      ...(guesses ?? []).map((g) => g.producer_id),
    ],
  });
  for (const [nid, name] of lookedUpNames) nameById.set(nid, name);

  function vintageLabel(row: {
    vintage_kind: string | null;
    vintage_year: number | null;
    vintage_tawny_years: number | null;
  } | null) {
    if (!row || !row.vintage_kind) return "—";
    if (row.vintage_kind === "YEAR") return String(row.vintage_year ?? "—");
    if (row.vintage_kind === "NV") return "NV";
    if (row.vintage_kind === "TAWNY") return `${row.vintage_tawny_years ?? "?"} years tawny`;
    return "—";
  }

  function describe(row: {
    country_id: string | null;
    region_id: string | null;
    appellation_id: string | null;
    primary_grape_id: string | null;
    secondary_grape_id: string | null;
    producer_id: string | null;
    type_designation_id: string | null;
  } | null) {
    if (!row) return "No guess submitted.";
    const name = (nid: string | null) => (nid ? (nameById.get(nid) ?? "—") : "—");
    return (
      `${name(row.country_id)} · ${name(row.region_id)}` +
      `${row.appellation_id ? ` · ${name(row.appellation_id)}` : ""}` +
      ` — ` +
      `${name(row.primary_grape_id)}` +
      `${row.secondary_grape_id ? ` / ${name(row.secondary_grape_id)}` : ""}` +
      ` — ${name(row.producer_id)}` +
      `${row.type_designation_id ? ` (${name(row.type_designation_id)})` : ""}`
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        userId={user.id}
        displayName={me?.display_name ?? user.email ?? ""}
        avatarUrl={me?.avatar_url ?? null}
      />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
        <Link
          href={`/u/${profile.id}`}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Back to {profile.display_name}&apos;s profile
        </Link>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {tasting.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {profile.display_name}&apos;s guesses
        </p>

        {(wines ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No revealed wines yet.</p>
        ) : null}

        {(wines ?? []).map((wine) => {
          const answer = answerByWineId.get(wine.id);
          const guess = guessByWineId.get(wine.id);
          return (
            <Card key={wine.id}>
              <CardHeader>
                <CardTitle>Wine {wine.position}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div>
                  <h3 className="mb-1 text-sm font-medium">Answer</h3>
                  {answer?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={answer.image_url}
                      alt=""
                      className="mb-2 max-h-64 rounded-lg object-cover"
                    />
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {describe(answer ?? null)} — {vintageLabel(answer ?? null)}
                  </p>
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-medium">
                    Guess — {guess?.total_points ?? 0} points
                  </h3>
                  <p className="mb-2 text-sm text-muted-foreground">
                    {describe(guess ?? null)}
                    {guess ? ` — ${vintageLabel(guess)}` : ""}
                  </p>
                  {guess ? (
                    <table className="w-full text-sm">
                      <tbody>
                        {(
                          [
                            ["country", guess.country_points],
                            ["region", guess.region_points],
                            ["appellation", guess.appellation_points],
                            ["primary_grape", guess.primary_grape_points],
                            ["secondary_grape", guess.secondary_grape_points],
                            ["producer", guess.producer_points],
                            ["type_designation", guess.type_designation_points],
                            ["vintage", guess.vintage_points],
                          ] as const
                        ).map(([key, points]) => (
                          <tr key={key} className="border-b last:border-0">
                            <td className="py-1 text-muted-foreground">
                              {CATEGORY_LABELS[key]}
                            </td>
                            <td className="py-1 text-right">
                              {points === null ? "—" : points}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
