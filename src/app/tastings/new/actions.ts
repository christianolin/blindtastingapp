"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AsyncRevealPolicy,
  RevealMode,
  TimingMode,
  WineSourceMode,
} from "@/lib/supabase/database.types";

export type CreateTastingFormState = { error: string } | null;

export async function createTasting(
  _prevState: CreateTastingFormState,
  formData: FormData,
): Promise<CreateTastingFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const name = String(formData.get("name") ?? "").trim();
  const timingMode = String(formData.get("timing_mode") ?? "") as TimingMode;
  const wineSource = String(
    formData.get("wine_source") ?? "",
  ) as WineSourceMode;
  const revealMode = String(formData.get("reveal_mode") ?? "") as RevealMode;
  const flow = String(formData.get("flow") ?? "GUIDED");
  const leaderboardReveal =
    String(formData.get("leaderboard_reveal") ?? "PER_ATTRIBUTE") === "PER_WINE"
      ? "PER_WINE"
      : "PER_ATTRIBUTE";
  const asyncRevealPolicy = (String(
    formData.get("async_reveal_policy") ?? "AFTER_ALL",
  ) === "IMMEDIATE"
    ? "IMMEDIATE"
    : "AFTER_ALL") as AsyncRevealPolicy;
  const emailsRaw = String(formData.get("emails") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const imageUrl = String(formData.get("image_url") ?? "").trim() || null;
  const scheduledAtRaw = String(formData.get("scheduled_at") ?? "").trim();
  const scheduledAt = scheduledAtRaw
    ? new Date(scheduledAtRaw).toISOString()
    : null;

  if (!name) {
    return { error: "Name is required." };
  }
  if (timingMode !== "LIVE" && timingMode !== "ASYNC") {
    return { error: "Choose a format." };
  }
  if (
    wineSource !== "HOST_PROVIDES" &&
    wineSource !== "PARTICIPANT_CONTRIBUTED"
  ) {
    return { error: "Choose who provides the wines." };
  }
  if (revealMode !== "BLIND" && revealMode !== "SEMI_BLIND") {
    return { error: "Choose a blindness level." };
  }

  const emails = [
    ...new Set(
      emailsRaw
        .split(/[\n,]/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].filter((e) => e !== user.email?.toLowerCase());

  const { data: tasting, error: tastingError } = await supabase
    .from("tastings")
    .insert({
      name,
      host_id: user.id,
      timing_mode: timingMode,
      wine_source: wineSource,
      reveal_mode: revealMode,
      status: "DRAFT",
      description,
      image_url: imageUrl,
      scheduled_at: scheduledAt,
      async_reveal_policy: asyncRevealPolicy,
      sequential_guessing: revealMode === "BLIND" && flow === "GUIDED",
      leaderboard_reveal: leaderboardReveal,
    })
    .select()
    .single();
  if (tastingError || !tasting) {
    return { error: tastingError?.message ?? "Could not create the tasting." };
  }

  const { error: hostParticipantError } = await supabase
    .from("tasting_participants")
    .insert({
      tasting_id: tasting.id,
      user_id: user.id,
      status: "JOINED",
      joined_at: new Date().toISOString(),
    });
  if (hostParticipantError) {
    return { error: hostParticipantError.message };
  }

  const admin = createAdminClient();
  for (const email of emails) {
    let participantUserId: string | null = null;

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      participantUserId = existingProfile.id;
    } else {
      const { data: invited, error: inviteError } =
        await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm-hash?next=/tastings/${tasting.id}`,
        });
      if (inviteError) {
        console.error(`Failed to invite ${email}:`, inviteError.message);
        continue;
      }
      participantUserId = invited.user.id;
    }

    if (participantUserId) {
      const { error: participantError } = await supabase
        .from("tasting_participants")
        .insert({
          tasting_id: tasting.id,
          user_id: participantUserId,
          status: "INVITED",
        });
      if (participantError) {
        console.error(`Failed to add participant ${email}:`, participantError.message);
      }
    }
  }

  redirect(`/tastings/${tasting.id}`);
}
