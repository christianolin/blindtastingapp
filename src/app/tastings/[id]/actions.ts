"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type LobbyActionState = { error: string } | { success: string } | null;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function assertHost(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tastingId: string,
  userId: string,
) {
  const { data: tasting } = await supabase
    .from("tastings")
    .select("id, host_id, status")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting || tasting.host_id !== userId) return null;
  return tasting;
}

// Host presses "Start" — moves DRAFT → IN_PROGRESS so guessing opens. Requires
// at least one wine (nothing to guess otherwise).
export async function startTasting(
  _prev: LobbyActionState,
  formData: FormData,
): Promise<LobbyActionState> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting) return { error: "Only the host can start this tasting." };

  const { count } = await supabase
    .from("wines")
    .select("id", { count: "exact", head: true })
    .eq("tasting_id", tastingId);
  if (!count || count < 1) {
    return { error: "Add at least one wine before starting." };
  }

  const { error } = await supabase
    .from("tastings")
    .update({ status: "IN_PROGRESS" })
    .eq("id", tastingId);
  if (error) return { error: error.message };

  revalidatePath(`/tastings/${tastingId}`);
  return { success: "Tasting started — guessing is open." };
}

// Host presses "Finish" — moves IN_PROGRESS → CLOSED, one-way. Guessing and
// reveals lock, the tasting moves to the dashboard's History tab, and
// results stay viewable.
export async function finishTasting(
  _prev: LobbyActionState,
  formData: FormData,
): Promise<LobbyActionState> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting) return { error: "Only the host can finish this tasting." };
  if (tasting.status !== "IN_PROGRESS") {
    return { error: "Only a started tasting can be finished." };
  }

  const { error } = await supabase
    .from("tastings")
    .update({ status: "CLOSED" })
    .eq("id", tastingId);
  if (error) return { error: error.message };

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath("/dashboard");
  return { success: "Tasting finished — moved to History." };
}

// Host deletes the whole tasting (cascades to wines/answers/guesses/
// participants via FK on delete cascade). Redirects to the dashboard.
export async function deleteTasting(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting) return;

  await supabase.from("tastings").delete().eq("id", tastingId);
  redirect("/dashboard");
}

// Host edits the scheduled date/time. Allowed any time (harmless).
export async function updateSchedule(
  _prev: LobbyActionState,
  formData: FormData,
): Promise<LobbyActionState> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting) return { error: "Only the host can edit the schedule." };

  const raw = String(formData.get("scheduled_at") ?? "").trim();
  // datetime-local gives "YYYY-MM-DDTHH:mm" in local time; store as ISO.
  const scheduledAt = raw ? new Date(raw).toISOString() : null;

  const { error } = await supabase
    .from("tastings")
    .update({ scheduled_at: scheduledAt })
    .eq("id", tastingId);
  if (error) return { error: error.message };

  revalidatePath(`/tastings/${tastingId}`);
  return { success: "Schedule updated." };
}

// Host adds more participants after creation, while the tasting hasn't started
// yet (status DRAFT). Same insert-or-invite-by-email path as create-tasting.
export async function inviteToTasting(
  _prev: LobbyActionState,
  formData: FormData,
): Promise<LobbyActionState> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting) return { error: "Only the host can invite people." };
  if (tasting.status !== "DRAFT") {
    return { error: "Invites close once the tasting has started." };
  }

  const emails = [
    ...new Set(
      String(formData.get("emails") ?? "")
        .split(/[\n,]/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].filter((e) => e !== user.email?.toLowerCase());

  if (emails.length === 0) return { error: "Add at least one person." };

  const admin = createAdminClient();
  let added = 0;
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
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm-hash?next=/tastings/${tastingId}`,
        });
      if (inviteError) {
        console.error(`Failed to invite ${email}:`, inviteError.message);
        continue;
      }
      participantUserId = invited.user.id;
    }

    if (participantUserId) {
      // Ignore duplicates (unique on tasting_id+user_id).
      const { error } = await supabase.from("tasting_participants").insert({
        tasting_id: tastingId,
        user_id: participantUserId,
        status: "INVITED",
      });
      if (!error) added++;
    }
  }

  revalidatePath(`/tastings/${tastingId}`);
  return added > 0
    ? { success: `Invited ${added} ${added === 1 ? "person" : "people"}.` }
    : { error: "Nobody new was added (already invited?)." };
}

// Host toggles "one wine at a time" pacing.
export async function setSequentialGuessing(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting) return;
  const enabled = String(formData.get("enabled") ?? "") === "true";
  await supabase
    .from("tastings")
    .update({ sequential_guessing: enabled })
    .eq("id", tastingId);
  revalidatePath(`/tastings/${tastingId}`);
}

// Host reorders a wine one step up/down the serving order by swapping its
// position with the neighbour. The (tasting_id, position) unique constraint
// means we can't set both at once, so bounce one through a temporary slot.
export async function moveWine(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const wineId = String(formData.get("wine_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting) return;

  const { data: wines } = await supabase
    .from("wines")
    .select("id, position")
    .eq("tasting_id", tastingId)
    .order("position");
  const ordered = wines ?? [];
  const idx = ordered.findIndex((w) => w.id === wineId);
  if (idx === -1) return;
  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= ordered.length) return;

  const a = ordered[idx];
  const b = ordered[targetIdx];
  // temp slot (negative never collides with real positions)
  await supabase.from("wines").update({ position: -1 }).eq("id", a.id);
  await supabase.from("wines").update({ position: a.position }).eq("id", b.id);
  await supabase.from("wines").update({ position: b.position }).eq("id", a.id);

  revalidatePath(`/tastings/${tastingId}`);
}

// A participant responds to their invite. Accept -> JOINED (can now guess);
// decline -> DECLINED. RLS already lets a participant update their own row.
export async function respondToInvite(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const response = String(formData.get("response") ?? "");
  if (response !== "accept" && response !== "decline") return;

  await supabase
    .from("tasting_participants")
    .update(
      response === "accept"
        ? { status: "JOINED", joined_at: new Date().toISOString() }
        : { status: "DECLINED" },
    )
    .eq("tasting_id", tastingId)
    .eq("user_id", user.id);

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath("/dashboard");
}
