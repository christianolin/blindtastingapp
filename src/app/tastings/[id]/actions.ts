"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startWarning } from "@/lib/wine-identity/incomplete";
import { listIncompleteGlasses } from "@/lib/wine-identity/server/incomplete-glasses";

// `warning` rides along with a success that still needs the host's attention:
// Start's incomplete glasses, and cellar bottles that couldn't be drawn down.
export type LobbyActionState =
  | { error: string }
  | { success: string; warning?: string }
  | null;

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
    .select("id, host_id, status, reveal_mode, timing_mode")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting || tasting.host_id !== userId) return null;
  return tasting;
}

// Host presses "Start" — moves DRAFT → IN_PROGRESS so guessing opens (spec
// §C.7, as amended by the blind-tasting ledger B0). There is no wine count
// gate: wines can be added while the tasting runs. An incomplete glass never
// blocks Start either; it comes back as an inline warning, and only that
// glass's own reveal is refused. The flip matches a DRAFT row only, so a
// started or finished tasting can't be started again — which would otherwise
// draw its cellar bottles down a second time.
export async function startTasting(
  _prev: LobbyActionState,
  formData: FormData,
): Promise<LobbyActionState> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting) return { error: "Only the host can start this tasting." };

  // Read before the flip. A failed read comes back as the error and the
  // tasting stays DRAFT, instead of passing for "every glass is complete".
  let incompleteWarning: string | null;
  try {
    incompleteWarning = startWarning(
      await listIncompleteGlasses(supabase, tastingId),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  const { data: started, error } = await supabase
    .from("tastings")
    .update({ status: "IN_PROGRESS" })
    .eq("id", tastingId)
    .eq("status", "DRAFT")
    .select("id");
  if (error) return { error: error.message };
  if (!started || started.length === 0) {
    return { error: "This tasting has already started." };
  }

  // Pour every glass whose adder asked to take their bottle out of the cellar
  // (D11). The RPC never pours a glass twice; each glass it couldn't draw down
  // is named.
  const warnings = incompleteWarning ? [incompleteWarning] : [];
  const { data: pours, error: pourError } = await supabase.rpc(
    "draw_down_flight_cellar_lots",
    { p_tasting_id: tastingId },
  );
  if (pourError) {
    // The tasting has already started, so this is a warning, not the error.
    console.error(
      `draw_down_flight_cellar_lots failed for ${tastingId}:`,
      pourError.message,
    );
    warnings.push(
      "Any cellar bottles in this flight couldn't be taken out of the cellar.",
    );
  }
  for (const pour of pours ?? []) {
    if (pour.outcome !== "drawn") {
      warnings.push(
        `Glass ${pour.glass}: the bottle couldn't be taken out of the cellar.`,
      );
    }
  }

  revalidatePath(`/tastings/${tastingId}`);
  const success = "Tasting started — guessing is open.";
  return warnings.length > 0
    ? { success, warning: warnings.join(" ") }
    : { success };
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
    .eq("id", tastingId)
    .eq("status", "IN_PROGRESS");
  if (error) return { error: error.message };

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath("/taste");
  return { success: "Tasting finished — moved to History." };
}

// Host reopens a finished tasting — CLOSED -> IN_PROGRESS. Everything (guesses,
// scores, answers, reveals) is preserved; it just becomes live/continuable
// again, so wines can be added or more guessing happen.
export async function reopenTasting(
  _prev: LobbyActionState,
  formData: FormData,
): Promise<LobbyActionState> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting) return { error: "Only the host can reopen this tasting." };
  if (tasting.status !== "CLOSED") {
    return { error: "Only a finished tasting can be reopened." };
  }

  const { error } = await supabase
    .from("tastings")
    .update({ status: "IN_PROGRESS" })
    .eq("id", tastingId)
    .eq("status", "CLOSED");
  if (error) return { error: error.message };

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath("/taste");
  return { success: "Tasting reopened — it's live again." };
}

// Host deletes the whole tasting (cascades to wines/answers/guesses/
// participants via FK on delete cascade). Redirects to the dashboard.
export async function deleteTasting(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting) return;

  await supabase.from("tastings").delete().eq("id", tastingId);
  redirect("/taste");
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

  // `scheduled_at_iso` (the client's own zone conversion, as in
  // tastings/new/actions.ts) wins; the raw datetime-local value is the
  // legacy fallback, parsed in the server's zone as before.
  const iso = String(formData.get("scheduled_at_iso") ?? "").trim();
  const raw = String(formData.get("scheduled_at") ?? "").trim();
  const parsed = raw ? new Date(raw) : null;
  const scheduledAt = iso
    ? iso
    : parsed && !Number.isNaN(parsed.getTime())
      ? parsed.toISOString()
      : null;

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
  // OPEN (group Taste & Rate) has nothing to protect, so people can be added
  // on the go — even after it's started and wines exist. Blind/semi-blind
  // still lock invites at start so late joiners can't game the guessing.
  if (tasting.status !== "DRAFT" && tasting.reveal_mode !== "OPEN") {
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

// Host toggles "one wine at a time" pacing. Guided pacing is for LIVE
// tastings only (spec §D.1 #1): a self-paced tasting ignores the request, and
// any flag an older ASYNC row still stores is ignored wherever it is read.
export async function setSequentialGuessing(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting || tasting.timing_mode === "ASYNC") return;
  const enabled = String(formData.get("enabled") ?? "") === "true";
  await supabase
    .from("tastings")
    .update({ sequential_guessing: enabled })
    .eq("id", tastingId);
  revalidatePath(`/tastings/${tastingId}`);
}

// Host switches when the leaderboard moves during a progressive reveal (after
// each attribute vs after the full wine). Exposed only in the draft menu; the
// value only changes how partial reveals are aggregated, never scoring itself.
export async function setLeaderboardReveal(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting) return;
  const value =
    String(formData.get("value") ?? "") === "PER_WINE"
      ? "PER_WINE"
      : "PER_ATTRIBUTE";
  await supabase
    .from("tastings")
    .update({ leaderboard_reveal: value })
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

// Host removes a wine from a draft flight (the create sheet's per-row ✕).
// Deletes the `wines` row — wine_answers / guesses cascade — then closes the
// gap in `position` so the next add (count + 1) can't collide with a
// surviving row on the (tasting_id, position) unique constraint. Shifting
// ascending is safe: each row moves into the slot the previous one just left.
export async function removeWine(
  tastingId: string,
  wineId: string,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, user } = await requireUser();
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting) return { error: "Only the host can remove wines." };
  if (tasting.status !== "DRAFT") {
    return { error: "Wines can only be removed before the tasting starts." };
  }

  const { data: wines } = await supabase
    .from("wines")
    .select("id, position")
    .eq("tasting_id", tastingId)
    .order("position");
  const ordered = wines ?? [];
  const removed = ordered.find((w) => w.id === wineId);
  if (!removed) return { error: "That wine is no longer in the flight." };

  const { error } = await supabase.from("wines").delete().eq("id", wineId);
  if (error) return { error: error.message };

  for (const w of ordered) {
    if (w.position > removed.position) {
      await supabase
        .from("wines")
        .update({ position: w.position - 1 })
        .eq("id", w.id);
    }
  }

  revalidatePath(`/tastings/${tastingId}`);
  return { ok: true };
}

// A participant responds to their invite. Accept -> JOINED (can now guess);
// decline -> DECLINED. RLS already lets a participant update their own row.
// A finished (CLOSED) tasting can no longer be accepted (spec §D.4 #5). The
// lobby card and the bell stop offering Accept there, so the refusal carries
// no message and the Promise<void> form-action signature stays. Decline stays
// allowed.
export async function respondToInvite(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const response = String(formData.get("response") ?? "");
  if (response !== "accept" && response !== "decline") return;

  if (response === "accept") {
    const { data: tasting } = await supabase
      .from("tastings")
      .select("status")
      .eq("id", tastingId)
      .maybeSingle();
    if (!tasting || tasting.status === "CLOSED") return;
  }

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
  revalidatePath("/taste");
  revalidatePath("/overview");
}
