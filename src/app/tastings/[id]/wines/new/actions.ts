"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";

type ReferenceOption = { id: string; name: string };

// Two lookups + an insert, kept simple and type-safe by taking the already
// -built find/create queries as closures rather than a dynamic table name
// (Supabase's typed client can't take a table name as a plain string).
async function findOrCreate(
  find: () => PromiseLike<{ data: ReferenceOption | null }>,
  create: () => PromiseLike<{
    data: ReferenceOption | null;
    error: { code?: string; message: string } | null;
  }>,
): Promise<ReferenceOption> {
  const { data: existing } = await find();
  if (existing) return existing;

  const { data: created, error } = await create();
  if (!error && created) return created;

  // Unique-constraint race: someone else inserted the same row between our
  // check and our insert. Re-select rather than surface a spurious error.
  if (error?.code === "23505") {
    const { data: retried } = await find();
    if (retried) return retried;
  }

  throw new Error(error?.message ?? "Could not create entry.");
}

export async function createCountry(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () =>
      supabase.from("countries").select("id, name").eq("name", trimmed).maybeSingle(),
    () => supabase.from("countries").insert({ name: trimmed }).select("id, name").single(),
  );
}

export async function createGrape(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () => supabase.from("grapes").select("id, name").eq("name", trimmed).maybeSingle(),
    () => supabase.from("grapes").insert({ name: trimmed }).select("id, name").single(),
  );
}

export async function createProducer(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () => supabase.from("producers").select("id, name").eq("name", trimmed).maybeSingle(),
    () => supabase.from("producers").insert({ name: trimmed }).select("id, name").single(),
  );
}

export async function createTypeDesignation(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () =>
      supabase
        .from("type_designations")
        .select("id, name")
        .eq("name", trimmed)
        .maybeSingle(),
    () =>
      supabase
        .from("type_designations")
        .insert({ name: trimmed })
        .select("id, name")
        .single(),
  );
}

export async function createRegion(countryId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () =>
      supabase
        .from("regions")
        .select("id, name")
        .eq("country_id", countryId)
        .eq("name", trimmed)
        .maybeSingle(),
    () =>
      supabase
        .from("regions")
        .insert({ country_id: countryId, name: trimmed })
        .select("id, name")
        .single(),
  );
}

export async function createAppellation(regionId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () =>
      supabase
        .from("appellations")
        .select("id, name")
        .eq("region_id", regionId)
        .eq("name", trimmed)
        .maybeSingle(),
    () =>
      supabase
        .from("appellations")
        .insert({ region_id: regionId, name: trimmed })
        .select("id, name")
        .single(),
  );
}

export type AddWineFormState = { error: string } | null;

export async function addWine(
  _prevState: AddWineFormState,
  formData: FormData,
): Promise<AddWineFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const tastingId = String(formData.get("tasting_id") ?? "");
  const countryId = String(formData.get("country_id") ?? "");
  const regionId = String(formData.get("region_id") ?? "");
  const appellationId = String(formData.get("appellation_id") ?? "") || null;
  const primaryGrapeId = String(formData.get("primary_grape_id") ?? "");
  const secondaryGrapeId =
    String(formData.get("secondary_grape_id") ?? "") || null;
  const producerId = String(formData.get("producer_id") ?? "");
  const typeDesignationId =
    String(formData.get("type_designation_id") ?? "") || null;
  const vintageKind = String(formData.get("vintage_kind") ?? "") as VintageKind;
  const vintageYearRaw = String(formData.get("vintage_year") ?? "");
  const vintageTawnyYearsRaw = String(
    formData.get("vintage_tawny_years") ?? "",
  );

  if (!countryId || !regionId || !primaryGrapeId || !producerId) {
    return { error: "Please fill in all required fields." };
  }
  if (!["YEAR", "NV", "TAWNY"].includes(vintageKind)) {
    return { error: "Choose a vintage type." };
  }

  let vintageYear: number | null = null;
  let vintageTawnyYears: number | null = null;
  if (vintageKind === "YEAR") {
    vintageYear = parseInt(vintageYearRaw, 10);
    if (!Number.isFinite(vintageYear)) {
      return { error: "Enter a vintage year." };
    }
  } else if (vintageKind === "TAWNY") {
    vintageTawnyYears = parseInt(vintageTawnyYearsRaw, 10);
    if (!Number.isFinite(vintageTawnyYears)) {
      return { error: "Choose the tawny age statement." };
    }
  }

  const { data: tasting } = await supabase
    .from("tastings")
    .select("*")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) {
    return { error: "Tasting not found." };
  }

  let contributorParticipantId: string | null = null;
  if (tasting.wine_source === "PARTICIPANT_CONTRIBUTED") {
    const { data: participant } = await supabase
      .from("tasting_participants")
      .select("id")
      .eq("tasting_id", tastingId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!participant) {
      return { error: "You're not a participant in this tasting." };
    }
    contributorParticipantId = participant.id;

    const { data: existingWine } = await supabase
      .from("wines")
      .select("id")
      .eq("tasting_id", tastingId)
      .eq("contributor_participant_id", participant.id)
      .maybeSingle();
    if (existingWine) {
      return { error: "You've already added your wine." };
    }
  } else if (tasting.host_id !== user.id) {
    return { error: "Only the host can add wines to this tasting." };
  }

  const { count } = await supabase
    .from("wines")
    .select("id", { count: "exact", head: true })
    .eq("tasting_id", tastingId);
  const position = (count ?? 0) + 1;

  const { data: wine, error: wineError } = await supabase
    .from("wines")
    .insert({
      tasting_id: tastingId,
      position,
      contributor_participant_id: contributorParticipantId,
    })
    .select()
    .single();
  if (wineError || !wine) {
    return { error: wineError?.message ?? "Could not add the wine." };
  }

  const { error: answerError } = await supabase.from("wine_answers").insert({
    wine_id: wine.id,
    country_id: countryId,
    region_id: regionId,
    appellation_id: appellationId,
    primary_grape_id: primaryGrapeId,
    secondary_grape_id: secondaryGrapeId,
    producer_id: producerId,
    type_designation_id: typeDesignationId,
    vintage_kind: vintageKind,
    vintage_year: vintageYear,
    vintage_tawny_years: vintageTawnyYears,
  });
  if (answerError) {
    await supabase.from("wines").delete().eq("id", wine.id);
    return { error: answerError.message };
  }

  redirect(`/tastings/${tastingId}`);
}
