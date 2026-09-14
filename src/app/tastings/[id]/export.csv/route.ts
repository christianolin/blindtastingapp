import type { NextRequest } from "next/server";
import { deaccent } from "@/lib/deaccent";
import { csvDocument } from "@/lib/csv";
import {
  exportAllowed,
  flightCsvRows,
  type CsvAnswer,
  type CsvGlass,
  type CsvViewerRole,
} from "@/lib/flight-csv";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { createClient } from "@/lib/supabase/server";

// "Export the flight" (S13; spec §11.3 item 17), on the `calendar.ics`
// pattern: a 404 for anyone but the host and JOINED participants of a
// CLOSED tasting, so this route never confirms a tasting exists, is running,
// or who is in it to anyone else — the same reasoning `calendar.ics/route.ts`
// documents. `flightCsvRows` and `exportAllowed` (`flight-csv.ts`) hold every
// rule about which columns and rows appear; this route only loads rows and
// resolves reference ids to the names it renders (never a whole
// appellations/producers table — CLAUDE.md).

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}

const MAX_SLUG_LENGTH = 60;

/** "Barolo night, Østerbro!" -> "barolo-night-osterbro-flight.csv", the same
    ASCII-slug shape `icsFilename` (`src/lib/ics.ts`) builds, with the
    "-flight.csv" suffix the spec names instead of ics's own ".ics". */
function flightCsvFilename(name: string): string {
  const slug = deaccent(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");
  return `${slug || "tasting"}-flight.csv`;
}

function vintageLabel(row: {
  vintage_kind: string | null;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
}): string {
  if (row.vintage_kind === "YEAR") return row.vintage_year != null ? String(row.vintage_year) : "";
  if (row.vintage_kind === "NV") return "NV";
  if (row.vintage_kind === "TAWNY") {
    return row.vintage_tawny_years != null ? `${row.vintage_tawny_years} years` : "";
  }
  return "";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tastingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return notFound();

  const { data: tasting } = await supabase
    .from("tastings")
    .select("id, name, host_id, wine_source, status")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return notFound();

  const isHost = tasting.host_id === user.id;
  const { data: participant } = await supabase
    .from("tasting_participants")
    .select("id, status")
    .eq("tasting_id", tastingId)
    .eq("user_id", user.id)
    .maybeSingle();

  const viewerRole: CsvViewerRole = isHost
    ? tasting.wine_source === "HOST_PROVIDES"
      ? "host-provides-host"
      : "host"
    : participant?.status === "JOINED"
      ? "competitor"
      : "other";

  if (!exportAllowed({ status: tasting.status, viewerRole })) return notFound();

  const { data: wineRows } = await supabase
    .from("wines")
    .select("id, position, is_revealed, contributor_participant_id")
    .eq("tasting_id", tastingId)
    .order("position");
  const wines = wineRows ?? [];
  const revealedWineIds = wines.filter((w) => w.is_revealed).map((w) => w.id);

  const [
    { data: answerRows },
    { data: countries },
    { data: regions },
    { data: grapes },
    { data: typeDesignations },
    { data: participantRows },
    { data: guessRows },
  ] = await Promise.all([
    revealedWineIds.length > 0
      ? supabase
          .from("wine_answers")
          .select(
            "wine_id, country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, catalog_wine_id, unidentified_wine_id",
          )
          .in("wine_id", revealedWineIds)
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("countries").select("id, name"),
    supabase.from("regions").select("id, name"),
    supabase.from("grapes").select("id, name"),
    supabase.from("type_designations").select("id, name"),
    supabase.from("tasting_participants").select("id, user_id").eq("tasting_id", tastingId),
    participant && revealedWineIds.length > 0
      ? supabase
          .from("guesses")
          .select("wine_id, total_points")
          .eq("participant_id", participant.id)
          .in("wine_id", revealedWineIds)
      : Promise.resolve({ data: [] as { wine_id: string; total_points: number | null }[] }),
  ]);

  const nameById = new Map<string, string>();
  for (const list of [countries, regions, grapes, typeDesignations]) {
    for (const row of list ?? []) nameById.set(row.id, row.name);
  }

  const answers = answerRows ?? [];
  const catalogIds = [
    ...new Set(answers.map((a) => a.catalog_wine_id).filter((id): id is string => Boolean(id))),
  ];
  const unidentifiedIds = [
    ...new Set(answers.map((a) => a.unidentified_wine_id).filter((id): id is string => Boolean(id))),
  ];

  const [{ data: catalogRows }, { data: unidentifiedRows }, referenceNames] = await Promise.all([
    catalogIds.length > 0
      ? supabase.from("catalog_wines").select("id, wine_name").in("id", catalogIds)
      : Promise.resolve({ data: [] as { id: string; wine_name: string | null }[] }),
    unidentifiedIds.length > 0
      ? supabase.from("catalog_wines_unidentified").select("id, wine_name").in("id", unidentifiedIds)
      : Promise.resolve({ data: [] as { id: string; wine_name: string | null }[] }),
    lookupAppellationAndProducerNames({
      appellationIds: answers.map((a) => a.appellation_id),
      producerIds: answers.map((a) => a.producer_id),
    }),
  ]);
  const wineNameByCatalogId = new Map((catalogRows ?? []).map((c) => [c.id, c.wine_name]));
  const wineNameByUnidentifiedId = new Map((unidentifiedRows ?? []).map((c) => [c.id, c.wine_name]));

  const answersByWineId = new Map<string, CsvAnswer>(
    answers.map((a) => [
      a.wine_id,
      {
        producer: a.producer_id ? (referenceNames.get(a.producer_id) ?? "") : "",
        wineName: a.catalog_wine_id
          ? (wineNameByCatalogId.get(a.catalog_wine_id) ?? null)
          : a.unidentified_wine_id
            ? (wineNameByUnidentifiedId.get(a.unidentified_wine_id) ?? null)
            : null,
        vintage: vintageLabel(a),
        country: nameById.get(a.country_id) ?? "",
        region: nameById.get(a.region_id) ?? "",
        appellation: a.appellation_id ? (referenceNames.get(a.appellation_id) ?? null) : null,
        primaryGrape: nameById.get(a.primary_grape_id) ?? "",
        secondaryGrape: a.secondary_grape_id ? (nameById.get(a.secondary_grape_id) ?? null) : null,
        typeDesignation: a.type_designation_id
          ? (nameById.get(a.type_designation_id) ?? null)
          : null,
      },
    ]),
  );

  const userIdByParticipantId = new Map((participantRows ?? []).map((p) => [p.id, p.user_id]));
  const contributorUserIds = wines
    .map((w) => (w.contributor_participant_id ? userIdByParticipantId.get(w.contributor_participant_id) : null))
    .filter((id): id is string => Boolean(id));
  const { data: contributorProfiles } =
    contributorUserIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", contributorUserIds)
      : { data: [] as { id: string; display_name: string | null }[] };
  const profileNameByUserId = new Map((contributorProfiles ?? []).map((p) => [p.id, p.display_name]));

  const pointsByWineId = new Map((guessRows ?? []).map((g) => [g.wine_id, g.total_points]));

  const glasses: CsvGlass[] = wines.map((w, i) => {
    const contributorUserId = w.contributor_participant_id
      ? (userIdByParticipantId.get(w.contributor_participant_id) ?? null)
      : null;
    return {
      glass: i + 1,
      wineId: w.id,
      isRevealed: w.is_revealed,
      broughtBy: contributorUserId ? (profileNameByUserId.get(contributorUserId) ?? null) : null,
      viewerPoints: pointsByWineId.get(w.id) ?? null,
    };
  });

  const rows = flightCsvRows({
    glasses,
    answersByWineId,
    viewer: { role: viewerRole, wineSource: tasting.wine_source },
  });

  return new Response(csvDocument(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${flightCsvFilename(tasting.name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
