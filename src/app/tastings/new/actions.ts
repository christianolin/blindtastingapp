"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AsyncRevealPolicy,
  RevealMode,
  TimingMode,
  WineLeaderboardReveal,
  WineSourceMode,
} from "@/lib/supabase/database.types";
import { WINE_SOURCE_LOCKED } from "./setup-copy";
import { makeWineLabeler } from "@/lib/wine-label";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import type { FlightWine } from "@/app/tastings/[id]/wine-flight-list";
import { callerKnowsWine } from "@/components/add-wine/flight-knowledge";
import { parseStoredDraft } from "@/lib/wine-identity/from-sources";
import { flightRowNeeds, toIncompleteGlasses } from "@/lib/wine-identity/incomplete";
import type { WineIdentityDraft } from "@/lib/wine-identity/types";

// Success now carries the new id — the sheet continues to step 2 in place
// instead of the action redirecting to the draft page.
export type CreateTastingFormState = { id: string } | { error: string } | null;

// What step 1 edits, in the action's own vocabulary. `flow` is form-only:
// it is persisted as `sequential_guessing` (blind + LIVE + GUIDED), never a
// column.
export type TastingSetupFields = {
  name: string;
  timingMode: TimingMode;
  wineSource: WineSourceMode;
  revealMode: RevealMode;
  flow: string;
  leaderboardReveal: WineLeaderboardReveal;
  asyncRevealPolicy: AsyncRevealPolicy;
  /** ISO timestamp, or null to clear. */
  scheduledAt: string | null;
  description?: string | null;
  imageUrl?: string | null;
};

// The one validator both create and update run — same strings the form has
// always shown.
function validateSetup(f: TastingSetupFields): { error: string } | null {
  if (!f.name.trim()) return { error: "Name is required." };
  if (f.timingMode !== "LIVE" && f.timingMode !== "ASYNC") {
    return { error: "Choose a format." };
  }
  if (
    f.wineSource !== "HOST_PROVIDES" &&
    f.wineSource !== "PARTICIPANT_CONTRIBUTED"
  ) {
    return { error: "Choose who provides the wines." };
  }
  if (
    f.revealMode !== "BLIND" &&
    f.revealMode !== "SEMI_BLIND" &&
    f.revealMode !== "OPEN"
  ) {
    return { error: "Choose a tasting mode." };
  }
  return null;
}

// The columns a setup writes; shared by insert and update so a mode switch on
// step 1 recomputes exactly what creation would have.
function setupColumns(f: TastingSetupFields) {
  return {
    name: f.name.trim(),
    timing_mode: f.timingMode,
    wine_source: f.wineSource,
    reveal_mode: f.revealMode,
    scheduled_at: f.scheduledAt,
    async_reveal_policy: f.asyncRevealPolicy,
    // Guided pacing is LIVE-only (spec §D.1 #1): a self-paced tasting is
    // stored free, whatever the form's flow value says.
    sequential_guessing: f.revealMode === "BLIND" && f.timingMode === "LIVE" && f.flow === "GUIDED",
    leaderboard_reveal: f.leaderboardReveal,
    // The cover photo: a URL sets it and null clears it (a photo removed on
    // step 1 after the row exists). A caller that leaves it undefined keeps
    // whatever is stored — never silently wipe a photo it didn't send.
    ...(f.imageUrl !== undefined ? { image_url: f.imageUrl?.trim() || null } : {}),
  };
}

// FormData → fields. `scheduled_at_iso` (the client's own zone conversion)
// wins; the raw datetime-local value is the legacy fallback, parsed in the
// server's zone as before.
function fieldsFromFormData(formData: FormData): TastingSetupFields {
  const scheduledIso = String(formData.get("scheduled_at_iso") ?? "").trim();
  const scheduledRaw = String(formData.get("scheduled_at") ?? "").trim();
  const parsedRaw = scheduledRaw ? new Date(scheduledRaw) : null;
  const scheduledAt = scheduledIso
    ? scheduledIso
    : parsedRaw && !Number.isNaN(parsedRaw.getTime())
      ? parsedRaw.toISOString()
      : null;
  return {
    name: String(formData.get("name") ?? "").trim(),
    timingMode: String(formData.get("timing_mode") ?? "") as TimingMode,
    wineSource: String(formData.get("wine_source") ?? "") as WineSourceMode,
    revealMode: String(formData.get("reveal_mode") ?? "") as RevealMode,
    flow: String(formData.get("flow") ?? "GUIDED"),
    leaderboardReveal:
      String(formData.get("leaderboard_reveal") ?? "PER_ATTRIBUTE") === "PER_WINE"
        ? "PER_WINE"
        : "PER_ATTRIBUTE",
    asyncRevealPolicy:
      String(formData.get("async_reveal_policy") ?? "AFTER_ALL") === "IMMEDIATE"
        ? "IMMEDIATE"
        : "AFTER_ALL",
    scheduledAt,
    description: String(formData.get("description") ?? "").trim() || null,
    imageUrl: String(formData.get("image_url") ?? "").trim() || null,
  };
}

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

  const fields = fieldsFromFormData(formData);
  const invalid = validateSetup(fields);
  if (invalid) return invalid;

  const emailsRaw = String(formData.get("emails") ?? "");
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
      ...setupColumns(fields),
      host_id: user.id,
      status: "DRAFT",
      description: fields.description ?? null,
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

  // Still honoured when a caller posts emails (the sheet posts none — its
  // invites go through inviteToTasting on step 3).
  if (emails.length > 0) {
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
  }

  revalidatePath("/taste");
  revalidatePath("/overview");
  return { id: tasting.id };
}

async function requireHostDraft(tastingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: tasting } = await supabase
    .from("tastings")
    .select("id, host_id, status, name, reveal_mode, wine_source")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting || tasting.host_id !== user.id) {
    return { supabase, user, tasting: null as null, error: "Only the host can edit this tasting." };
  }
  return { supabase, user, tasting, error: null };
}

// Step 1 revisited from a later step: name / mode / timing / source /
// schedule / rules / cover photo change in place while DRAFT. A mode switch
// keeps the wines — nothing here touches `wines` or `wine_answers`.
export async function updateTastingSetup(
  tastingId: string,
  fields: TastingSetupFields,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, tasting, error } = await requireHostDraft(tastingId);
  if (!tasting) return { error };
  if (tasting.status !== "DRAFT") {
    return { error: "Settings lock once the tasting has started." };
  }
  const invalid = validateSetup(fields);
  if (invalid) return invalid;

  // Who brings the wines can't switch once the flight has a bottle (spec
  // §D.1 #3) — refused before any write. The host reads every wine row of
  // their own tasting (wines read), so the count covers every glass.
  if (fields.wineSource !== tasting.wine_source) {
    const { count, error: countError } = await supabase
      .from("wines")
      .select("id", { count: "exact", head: true })
      .eq("tasting_id", tastingId);
    if (countError) return { error: countError.message };
    if ((count ?? 0) > 0) return { error: WINE_SOURCE_LOCKED };
  }

  const { error: updateError } = await supabase
    .from("tastings")
    .update(setupColumns(fields))
    .eq("id", tastingId);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath("/taste");
  revalidatePath("/overview");
  return { ok: true };
}

/** Step 1's second name chip — "{Region} #{n}" — for the caller: their
    most-tasted region and one more than the tastings they have hosted.
    Null when they have no scored guesses yet (the form then shows the
    handoff's "Burgundy #1"). Shared by the /tastings/new page (server) and
    the launcher sheet (called lazily on open), so both entry points agree.
    Deliberately NOT getProfileStats — that computes category accuracy and
    the full tasting history for one chip. Every read is RLS-bound to the
    caller: a scored guess is exactly what grants wine_answers access
    (has_scored_guess), so nothing unrevealed can come back. */
export async function getNameSuggestionContext(): Promise<{
  region: string;
  n: number;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ count: hostedCount }, region] = await Promise.all([
    supabase
      .from("tastings")
      .select("id", { count: "exact", head: true })
      .eq("host_id", user.id),
    mostTastedRegionName(supabase, user.id),
  ]);
  if (!region) return null;
  return { region, n: (hostedCount ?? 0) + 1 };
}

// The mode region_id of the wine_answers behind the caller's scored guesses
// (tasting the glass, not guessing it right, is what counts as exposure —
// the same rule as profile-stats' "tasted most").
async function mostTastedRegionName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data: participants } = await supabase
    .from("tasting_participants")
    .select("id")
    .eq("user_id", userId);
  const participantIds = (participants ?? []).map((p) => p.id);
  if (participantIds.length === 0) return null;

  const { data: guesses } = await supabase
    .from("guesses")
    .select("wine_id")
    .in("participant_id", participantIds)
    .not("scored_at", "is", null);
  const wineIds = [...new Set((guesses ?? []).map((g) => g.wine_id))];
  if (wineIds.length === 0) return null;

  const { data: answers } = await supabase
    .from("wine_answers")
    .select("region_id")
    .in("wine_id", wineIds);
  const counts = new Map<string, number>();
  for (const a of answers ?? []) {
    counts.set(a.region_id, (counts.get(a.region_id) ?? 0) + 1);
  }
  let modeId: string | null = null;
  let best = 0;
  for (const [id, count] of counts) {
    if (count > best) {
      best = count;
      modeId = id;
    }
  }
  if (!modeId) return null;

  const { data: region } = await supabase
    .from("regions")
    .select("name")
    .eq("id", modeId)
    .maybeSingle();
  return region?.name ?? null;
}

// Step 3's share link: the host-only RPC mints the code on first use.
export async function getJoinLink(
  tastingId: string,
): Promise<{ url: string; code: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_join_code", {
    p_tasting_id: tastingId,
  });
  if (error || !data) {
    return { error: error?.message ?? "Couldn't create a join link." };
  }
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return { url: `${base}/j/${data}`, code: data };
}

/** One step-2 row: the lobby's FlightWine plus the title/meta the sheet's
    list draws ("Vietti, Barolo Castiglione 2017" · "Barolo DOCG · Nebbiolo").
    Title, meta and the identity line follow the knowledge rule (spec §C.9,
    D10): they are filled only for a glass the caller already knows — the host
    of a host-provides tasting, the glass's contributor, or anyone once it is
    revealed. Anyone else's hidden glass carries its label and nothing more.
    `incomplete` marks the adder's own glass with no answer key (D7): its title
    is the draft's "{producer}, {wine name}" and its meta is `flightRowNeeds`,
    drawn in dark gold. */
export type FlightRow = FlightWine & { title: string; meta: string | null; incomplete: boolean };

export type FlightSnapshot = {
  wines: FlightRow[];
  /** BYO: JOINED participants who have not added a bottle yet, by name. */
  waitingFor: string[];
  hasStarted: boolean;
};

// An incomplete glass's title: "{producer name}, {wine name}", leaving out
// empty parts (spec §C.5 A1). Null when the draft has neither.
function draftTitle(draft: WineIdentityDraft | null): string | null {
  if (!draft) return null;
  return [draft.producer?.name.trim(), draft.wineName?.trim()].filter(Boolean).join(", ") || null;
}

// A fresh read of the flight for step 2, computed with the same rules as
// tastings/[id]/page.tsx so the sheet and the lobby never disagree.
export async function listFlight(
  tastingId: string,
): Promise<FlightSnapshot | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };
  const userId = user.id;

  const [{ data: tasting }, { data: participants }, { data: wines }] =
    await Promise.all([
      supabase
        .from("tastings")
        .select("id, host_id, status, wine_source, reveal_mode")
        .eq("id", tastingId)
        .maybeSingle(),
      supabase
        .from("tasting_participants")
        .select("id, user_id, status")
        .eq("tasting_id", tastingId),
      supabase
        .from("wines")
        .select("id, position, is_revealed, reveal_step, contributor_participant_id")
        .eq("tasting_id", tastingId)
        .order("position"),
    ]);
  if (!tasting) return { error: "Tasting not found." };

  const rows = wines ?? [];
  const people = participants ?? [];
  const isHost = tasting.host_id === userId;
  const isByo = tasting.wine_source === "PARTICIPANT_CONTRIBUTED";
  const hasStarted = tasting.status !== "DRAFT";

  const userIds = [...new Set(people.map((p) => p.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds)
    : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const nameByParticipantId = new Map(
    people.map((p) => [
      p.id,
      profileById.get(p.user_id)?.display_name ??
        profileById.get(p.user_id)?.email ??
        "Someone",
    ]),
  );
  const wineLabel = makeWineLabeler(rows, tasting.wine_source, nameByParticipantId);

  // Who added each glass (is_wine_adder's rule: the host for a glass with no
  // contributor, else the contributor) and which glasses the caller already
  // knows (spec §C.9). A contributor whose participant row this read cannot
  // see resolves to nobody, so both fail closed.
  type WineRow = (typeof rows)[number];
  const userByParticipantId = new Map(people.map((p) => [p.id, p.user_id]));
  const contributorUserId = (w: WineRow): string | null =>
    w.contributor_participant_id
      ? (userByParticipantId.get(w.contributor_participant_id) ?? null)
      : null;
  const isAdder = (w: WineRow): boolean =>
    w.contributor_participant_id ? contributorUserId(w) === userId : isHost;
  const known = rows.filter((w) =>
    callerKnowsWine(
      {
        hostId: tasting.host_id,
        wineSource: tasting.wine_source,
        isRevealed: w.is_revealed,
        contributorUserId: contributorUserId(w),
      },
      userId,
    ),
  );

  // A known glass's answer key: a short identity per row keeps reordering
  // legible. Never for anyone else's hidden glass: wine_answers RLS hands a
  // bring-your-own host every answer, and they guess the others' bottles too.
  const identity = new Map<string, { title: string; meta: string | null; line: string }>();
  const answered = new Set<string>();
  if (known.length > 0) {
    const { data: answers, error: answersError } = await supabase
      .from("wine_answers")
      .select(
        "wine_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year, vintage_tawny_years, catalog_wine_id",
      )
      .in(
        "wine_id",
        known.map((w) => w.id),
      );
    // A failed read must never show the adder's finished glasses as unfinished.
    if (answersError) return { error: answersError.message };
    const list = answers ?? [];
    const catalogIds = list
      .map((a) => a.catalog_wine_id)
      .filter((id): id is string => Boolean(id));
    const regionIds = [...new Set(list.map((a) => a.region_id))];
    const grapeIds = [...new Set(list.map((a) => a.primary_grape_id))];
    const [names, { data: catalog }, { data: regions }, { data: grapes }] =
      await Promise.all([
        lookupAppellationAndProducerNames({
          appellationIds: list.map((a) => a.appellation_id),
          producerIds: list.map((a) => a.producer_id),
        }),
        catalogIds.length
          ? supabase.from("catalog_wines").select("id, wine_name").in("id", catalogIds)
          : Promise.resolve({ data: [] as { id: string; wine_name: string | null }[] }),
        regionIds.length
          ? supabase.from("regions").select("id, name").in("id", regionIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        grapeIds.length
          ? supabase.from("grapes").select("id, name").in("id", grapeIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
    const wineName = new Map((catalog ?? []).map((c) => [c.id, c.wine_name]));
    const regionName = new Map((regions ?? []).map((r) => [r.id, r.name]));
    const grapeName = new Map((grapes ?? []).map((g) => [g.id, g.name]));
    for (const a of list) {
      answered.add(a.wine_id);
      const vintage =
        a.vintage_kind === "YEAR"
          ? String(a.vintage_year ?? "")
          : a.vintage_kind === "NV"
            ? "NV"
            : a.vintage_kind === "TAWNY"
              ? `${a.vintage_tawny_years ?? ""}yr tawny`
              : "";
      const producer = a.producer_id ? names.get(a.producer_id) ?? null : null;
      const cuvee = a.catalog_wine_id ? wineName.get(a.catalog_wine_id) ?? null : null;
      const head = [producer, cuvee].filter(Boolean).join(", ");
      const title = [head, vintage].filter(Boolean).join(" ") || "Wine";
      const meta =
        [
          a.appellation_id ? names.get(a.appellation_id) : null,
          grapeName.get(a.primary_grape_id),
        ]
          .filter(Boolean)
          .join(" · ") || null;
      const line = [producer, regionName.get(a.region_id), vintage]
        .filter(Boolean)
        .join(" · ");
      identity.set(a.wine_id, { title, meta, line });
    }
  }

  // The adder's own glasses with no answer key (D7). Drafts are owner-only
  // (wine_identity_drafts RLS); a glass with no draft row, a failed second
  // write (spec §C.8), needs every field.
  const unfinished = new Set(
    known.filter((w) => isAdder(w) && !answered.has(w.id)).map((w) => w.id),
  );
  const drafts = new Map<string, { draft: unknown; missing: string[] }>();
  if (unfinished.size > 0) {
    const { data: draftRows, error: draftsError } = await supabase
      .from("wine_identity_drafts")
      .select("wine_id, draft, missing")
      .in("wine_id", [...unfinished]);
    if (draftsError) return { error: draftsError.message };
    for (const d of draftRows ?? []) {
      drafts.set(d.wine_id, { draft: d.draft, missing: d.missing });
    }
  }

  const flight: FlightRow[] = rows.map((w, i) => {
    const contributorLabel = isByo ? wineLabel(w) : null;
    const label = contributorLabel ?? `Wine ${i + 1}`;
    const incomplete = unfinished.has(w.id);
    const wine: FlightWine = {
      id: w.id,
      contributorLabel,
      isRevealed: w.is_revealed,
      isByo,
      identity: identity.get(w.id)?.line ?? null,
      // The server's edit guard (editRefusal in wines/new/tasting-wine-writes.ts,
      // plan amendment 7): the adder, never on a CLOSED tasting or a revealed
      // glass, and a complete glass only until its first reveal step.
      editable:
        isAdder(w) &&
        tasting.status !== "CLOSED" &&
        !w.is_revealed &&
        (incomplete || w.reveal_step === 0),
      canReorder: isHost && !w.is_revealed,
      canReveal: isHost && hasStarted && tasting.status !== "CLOSED" && !w.is_revealed,
    };
    if (incomplete) {
      const stored = drafts.get(w.id);
      // The draft row's keys, in contract order (the same mapping as the
      // tasting_incomplete_glasses rows).
      const missing = toIncompleteGlasses([
        { wine_id: w.id, glass: i + 1, missing: stored?.missing ?? [] },
      ]).flatMap((glass) => glass.missing);
      return {
        ...wine,
        title: draftTitle(stored ? parseStoredDraft(stored.draft) : null) ?? label,
        meta: flightRowNeeds(missing),
        incomplete: true,
      };
    }
    const answer = identity.get(w.id);
    return {
      ...wine,
      title: answer?.title ?? label,
      meta: answer?.meta ?? null,
      incomplete: false,
    };
  });

  const waitingFor = isByo
    ? people
        .filter(
          (p) =>
            p.status === "JOINED" &&
            !rows.some((w) => w.contributor_participant_id === p.id),
        )
        .map((p) => nameByParticipantId.get(p.id) ?? "Someone")
    : [];

  return { wines: flight, waitingFor, hasStarted };
}
