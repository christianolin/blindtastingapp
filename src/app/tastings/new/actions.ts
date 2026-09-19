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
import {
  pickPouredRegion,
  settingsChangeRefusal,
  type FlowChoice,
  type LockedSetup,
} from "./setup-copy";
import { normalisePlace, setTastingPlace } from "./place";
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
// it is persisted as `sequential_guessing` (any non-OPEN LIVE tasting with
// Guided chosen, spec §D.1 #1 / B6), never a column.
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
  /** The tasting's private place (B12) — raw, normalised by `normalisePlace`. */
  place?: string;
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
    // Guided pacing is a LIVE-only setting (spec §D.1 #1, B6): a self-paced
    // tasting is stored free, whatever the form's flow value says, and since
    // B6 the flag covers any non-OPEN LIVE tasting — semi-blind's pour
    // pointer needs it too, not just blind.
    sequential_guessing: f.revealMode !== "OPEN" && f.timingMode === "LIVE" && f.flow === "GUIDED",
    leaderboard_reveal: f.leaderboardReveal,
    // The cover photo and the description: a caller that leaves either
    // undefined keeps whatever is stored — never silently wipe one it didn't
    // send (this sheet has no description field yet; S4d's settings sheet,
    // BT-L4, does, and its edits must not get clobbered by a step-1 re-save).
    ...(f.imageUrl !== undefined ? { image_url: f.imageUrl?.trim() || null } : {}),
    ...(f.description !== undefined ? { description: f.description?.trim() || null } : {}),
  };
}

// Reconstructs the stored `flow` choice from `sequential_guessing` (spec §D.1
// #1: the column only means something while Guided/Free applies at all — see
// `flowApplies` in setup-copy.ts). Where it doesn't apply, the caller's own
// submitted value is the fallback, so an incidental "flow" mismatch on a
// setting that was never shown never trips `settingsChangeRefusal`.
function lockedFlowFromRow(
  row: { reveal_mode: RevealMode; timing_mode: TimingMode; sequential_guessing: boolean },
  fallback: FlowChoice,
): FlowChoice {
  const applies = row.reveal_mode !== "OPEN" && row.timing_mode === "LIVE";
  return applies ? (row.sequential_guessing ? "GUIDED" : "FREE") : fallback;
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
    place: String(formData.get("place") ?? ""),
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
  // Validated before any write (spec §13.3 item 2), so a too-long place never
  // leaves a half-written tasting behind.
  const placeCheck = normalisePlace(fields.place ?? "");
  if ("error" in placeCheck) return placeCheck;

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
      // `fieldsFromFormData` always sets `description` (never undefined), so
      // `setupColumns` already writes it here.
      ...setupColumns(fields),
      host_id: user.id,
      status: "DRAFT",
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

  // Written after the tasting row exists — `setTastingPlace` needs the id,
  // and the host-only RLS policy keys on `tastings.host_id`, already set on
  // insert. Skipped entirely when there is nothing to write.
  if (placeCheck.place !== null) {
    const placeResult = await setTastingPlace(supabase, tasting.id, fields.place ?? "");
    if ("error" in placeResult) return placeResult;
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
        // Never a deleted account (account-deletion §5.5); its email is
        // scrubbed anyway, so this only guards the lookup.
        .is("deleted_at", null)
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

async function requireHost(tastingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: tasting } = await supabase
    .from("tastings")
    .select(
      "id, host_id, status, name, reveal_mode, timing_mode, wine_source, sequential_guessing, leaderboard_reveal, async_reveal_policy",
    )
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting || tasting.host_id !== user.id) {
    return { supabase, user, tasting: null as null, error: "Only the host can edit this tasting." };
  }
  return { supabase, user, tasting, error: null };
}

// Step 1 revisited from a later step, and S4d's settings sheet after Start:
// name / mode / timing / source / schedule / rules / cover photo / place
// change in place. A mode switch keeps the wines — nothing here touches
// `wines` or `wine_answers`. `settingsChangeRefusal` (spec §3.3 item 14) is
// the single status-aware gate: DRAFT allows everything but a wine-source
// switch once the flight has bottles; IN_PROGRESS, CLOSED and legacy OPEN
// allow only name, description, image, schedule and place to change.
export async function updateTastingSetup(
  tastingId: string,
  fields: TastingSetupFields,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, tasting, error } = await requireHost(tastingId);
  if (!tasting) return { error };
  const invalid = validateSetup(fields);
  if (invalid) return invalid;
  const placeCheck = normalisePlace(fields.place ?? "");
  if ("error" in placeCheck) return placeCheck;

  // Who brings the wines can't switch once the flight has a bottle while
  // still DRAFT (spec §D.1 #3) — refused before any write. The host reads
  // every wine row of their own tasting (wines read), so the count covers
  // every glass. Once started, `settingsChangeRefusal` below refuses any
  // wine-source change outright, wine count aside.
  let wineCount = 0;
  if (tasting.status === "DRAFT" && fields.wineSource !== tasting.wine_source) {
    const { count, error: countError } = await supabase
      .from("wines")
      .select("id", { count: "exact", head: true })
      .eq("tasting_id", tastingId);
    if (countError) return { error: countError.message };
    wineCount = count ?? 0;
  }

  const before: LockedSetup = {
    revealMode: tasting.reveal_mode,
    timingMode: tasting.timing_mode,
    wineSource: tasting.wine_source,
    flow: lockedFlowFromRow(tasting, fields.flow as FlowChoice),
    leaderboardReveal: tasting.leaderboard_reveal,
    asyncRevealPolicy: tasting.async_reveal_policy,
  };
  const after: LockedSetup = {
    revealMode: fields.revealMode,
    timingMode: fields.timingMode,
    wineSource: fields.wineSource,
    flow: fields.flow as FlowChoice,
    leaderboardReveal: fields.leaderboardReveal,
    asyncRevealPolicy: fields.asyncRevealPolicy,
  };
  const refusal = settingsChangeRefusal({ status: tasting.status, wineCount, before, after });
  if (refusal) return { error: refusal };

  const { error: updateError } = await supabase
    .from("tastings")
    .update(setupColumns(fields))
    .eq("id", tastingId);
  if (updateError) return { error: updateError.message };

  const placeResult = await setTastingPlace(supabase, tastingId, fields.place ?? "");
  if ("error" in placeResult) return placeResult;

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath("/taste");
  revalidatePath("/overview");
  return { ok: true };
}

/** Step 1's second name chip — "{Region} #{n}" — for the caller (spec §2.3
    item 2, B1): the most frequent `wine_answers.region_id` among the wines of
    tastings they host, where the wine is host-added (`wines.added_by_host`,
    M6) or already revealed — a bring-your-own host's flight would otherwise
    surface every contributor's still-hidden answer key through today's
    `wine_answers read` host clause. `n` is one more than the tastings that
    poured it (`pickPouredRegion`, a pure pick). Null when nothing qualifies
    (the form then shows just the two other chips). Shared by the
    /tastings/new page (server) and the launcher sheet (called lazily on
    open), so both entry points agree. Every read runs under the caller's own
    RLS — no `guesses` read, unlike the region-suggestion helper this
    replaces. */
export async function getPouredRegionSuggestion(): Promise<{
  region: string;
  n: number;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: tastings } = await supabase.from("tastings").select("id").eq("host_id", user.id);
  const tastingIds = (tastings ?? []).map((t) => t.id);
  if (tastingIds.length === 0) return null;

  const { data: wines } = await supabase
    .from("wines")
    .select("id, tasting_id")
    .in("tasting_id", tastingIds)
    .or("added_by_host.eq.true,is_revealed.eq.true");
  const rows = wines ?? [];
  if (rows.length === 0) return null;

  const { data: answers } = await supabase
    .from("wine_answers")
    .select("wine_id, region_id")
    .in(
      "wine_id",
      rows.map((w) => w.id),
    );
  const regionByWine = new Map((answers ?? []).map((a) => [a.wine_id, a.region_id]));
  if (regionByWine.size === 0) return null;

  const regionIds = [...new Set([...regionByWine.values()])];
  const { data: regions } = await supabase.from("regions").select("id, name").in("id", regionIds);
  const names = new Map((regions ?? []).map((r) => [r.id, r.name]));

  const pickerRows = rows
    .filter((w) => regionByWine.has(w.id))
    .map((w) => ({ tastingId: w.tasting_id, regionId: regionByWine.get(w.id)! }));
  return pickPouredRegion(pickerRows, names);
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
        .select("id, position, is_revealed, reveal_step, contributor_participant_id, added_by_host")
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

  // Who added each glass (is_wine_adder's rule, M6: the host for a glass the
  // host added — `added_by_host` — else the contributor, so a glass whose
  // contributor row was deleted is nobody's) and which glasses the caller already
  // knows (spec §C.9). A contributor whose participant row this read cannot
  // see resolves to nobody, so both fail closed.
  type WineRow = (typeof rows)[number];
  const userByParticipantId = new Map(people.map((p) => [p.id, p.user_id]));
  const contributorUserId = (w: WineRow): string | null =>
    w.contributor_participant_id
      ? (userByParticipantId.get(w.contributor_participant_id) ?? null)
      : null;
  const isAdder = (w: WineRow): boolean =>
    w.added_by_host ? isHost : contributorUserId(w) === userId;
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
  // legible. Never for anyone else's hidden glass: nobody sees a hidden glass
  // they did not add (rule 1), and a bring-your-own host guesses the others'
  // bottles too.
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
