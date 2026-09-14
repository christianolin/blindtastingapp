"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startWarning } from "@/lib/wine-identity/incomplete";
import { listIncompleteGlasses } from "@/lib/wine-identity/server/incomplete-glasses";
import { INVITES_CLOSE_WHEN_ENDED } from "@/lib/lobby-copy";
import { glassRemoveRefusal } from "@/lib/flight-glass-rules";
import { startLandsOnConsole } from "@/lib/tasting-lifecycle-copy";
import {
  encodeStartResult,
  startResultCookieName,
  startResultCookiePath,
} from "@/lib/start-result-cookie";

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
    .select("id, host_id, status, reveal_mode, timing_mode, wine_source")
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
    // The tasting is running by now, so this is a warning, not the error.
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
  const warning = warnings.length > 0 ? warnings.join(" ") : undefined;

  // Started from the lobby (HostControls sends carry_result): the status flip
  // swaps LobbyView for RunningView in this same round trip, so the Start form
  // and its action state unmount before this result arrives. It rides a
  // one-shot cookie instead, which RunningView shows the host once (BT-V3
  // A-08). A clean success that lands on the console needs none, because
  // HostControls pushes there; the create sheet shows its own result and
  // sends no flag.
  if (formData.get("carry_result") === "1") {
    const toConsole = startLandsOnConsole({
      timingMode: tasting.timing_mode,
      revealMode: tasting.reveal_mode,
      wineSource: tasting.wine_source,
    });
    if (warning || !toConsole) {
      (await cookies()).set(
        startResultCookieName(tastingId),
        encodeStartResult({ success, warning: warning ?? null, toConsole }),
        {
          path: startResultCookiePath(tastingId),
          maxAge: 120,
          sameSite: "lax",
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
        },
      );
    }
  }

  return warning ? { success, warning } : { success };
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
//
// The delete's error is checked and reported rather than discarded: this used
// to redirect to /taste whatever happened, so a refused delete read to the host
// as a successful one and the tasting was still there when they looked again.
export async function deleteTasting(
  _prev: LobbyActionState,
  formData: FormData,
): Promise<LobbyActionState> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting) return { error: "Only the host can delete this tasting." };

  const { error } = await supabase.from("tastings").delete().eq("id", tastingId);
  if (error) return { error: error.message };
  redirect("/taste");
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
  // B4/Q6: invites stay open until the tasting ends — a late joiner is
  // eligible for every glass not yet revealed (glass-eligibility.ts covers
  // the read side). The old OPEN-only exemption folds into this one check.
  if (tasting.status === "CLOSED") {
    return { error: INVITES_CLOSE_WHEN_ENDED };
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
// value only changes how partial reveals are aggregated, never scoring
// itself. DRAFT only (spec §3.3 item 14, "the rules lock") — once a tasting
// has started, mode/timing/rules/wine-source all lock together, and this
// setting rides along with them.
export async function setLeaderboardReveal(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const tastingId = String(formData.get("tasting_id") ?? "");
  const tasting = await assertHost(supabase, tastingId, user.id);
  if (!tasting || tasting.status !== "DRAFT") return;
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

// Removes a wine from the flight (the lobby's Remove, and the create sheet's
// per-row ✕) — spec §3.3 item 12. `glassRemoveRefusal` names the same rule
// `remove_flight_glass` enforces, so the app fails fast with its own copy
// before touching anything; the RPC (host or adder, DRAFT clean-up, never a
// started semi-blind flight, never while a later glass has been seen) is
// still the floor. It deletes and renumbers in one transaction whoever the
// adder is.
export async function removeWine(
  tastingId: string,
  wineId: string,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, user } = await requireUser();

  const { data: tasting } = await supabase
    .from("tastings")
    .select("id, host_id, status, reveal_mode")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return { error: "Tasting not found." };

  const { data: wine } = await supabase
    .from("wines")
    .select("id, position, is_revealed, reveal_step")
    .eq("id", wineId)
    .eq("tasting_id", tastingId)
    .maybeSingle();
  if (!wine) return { error: "That wine is no longer in the flight." };

  const { data: laterWines } = await supabase
    .from("wines")
    .select("is_revealed, reveal_step")
    .eq("tasting_id", tastingId)
    .gt("position", wine.position);
  const laterGlassSeen = (laterWines ?? []).some(
    (w) => w.is_revealed || w.reveal_step > 0,
  );

  const { data: isAdder } = await supabase.rpc("is_wine_adder", {
    p_wine_id: wineId,
  });

  const refusal = glassRemoveRefusal({
    tastingStatus: tasting.status,
    revealMode: tasting.reveal_mode,
    isRevealed: wine.is_revealed,
    revealStep: wine.reveal_step,
    viewerIsAdder: isAdder === true,
    viewerIsHost: tasting.host_id === user.id,
    laterGlassSeen,
  });
  if (refusal) return { error: refusal };

  const { error } = await supabase.rpc("remove_flight_glass", {
    p_wine_id: wineId,
  });
  if (error) return { error: error.message };

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
