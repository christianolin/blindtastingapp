import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, MapPin, Wine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDateTime } from "@/components/local-date-time";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getParticipantRows,
  getTastingRow,
  getWineRows,
} from "@/lib/tasting-request-cache";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { getBulkProfileSummaries } from "@/lib/profile-stats";
import { makeWineLabeler } from "@/lib/wine-label";
import type { UnrevealedGlass } from "@/lib/tasting-lifecycle-copy";
import { parseStoredDraft } from "@/lib/wine-identity/from-sources";
import {
  flightRowNeeds,
  toIncompleteGlasses,
} from "@/lib/wine-identity/incomplete";
import type { WineIdentityDraft } from "@/lib/wine-identity/types";
import type { AddedVia } from "@/components/add-wine/types";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "@/components/auto-refresh";
import { HostControls } from "./host-controls";
import { HostControlsMenu } from "./host-controls-menu";
import { StandingsPanel } from "./standings-panel";
import {
  AddToFlightButton,
  type FlightDestination,
} from "./tasting-add-wine-button";
import { TastingScanRegistrar } from "@/components/tasting-scan-registrar";
import { PlayExperience } from "./play/play-experience";
import { OpenBoard } from "./open-board";
import { SheetFromQuery } from "./sheet-from-query";
import {
  WineFlightList,
  type FlightWine,
  type FlightWineLines,
  type WaitingContributor,
} from "./wine-flight-list";
import { respondToInvite } from "./actions";

// How the adder's identity line ends: where the glass came from (spec §C.5 A1,
// wines.added_via). A legacy glass with no added_via leaves it out.
const ADDED_VIA_COPY: Record<AddedVia, string> = {
  SCAN: "scanned",
  CATALOG: "from the catalog",
  CELLAR: "from my cellar",
  BY_HAND: "by hand",
};

// An incomplete glass's title: "{producer name}, {wine name}", leaving out
// empty parts (spec §C.5 A1). Null when the draft has neither.
function draftTitle(draft: WineIdentityDraft | null): string | null {
  if (!draft) return null;
  return (
    [draft.producer?.name.trim(), draft.wineName?.trim()]
      .filter(Boolean)
      .join(", ") || null
  );
}

export default async function TastingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  // Shared reads go through the per-request cache: PlayExperience and
  // StandingsPanel render inside this page and need the same rows.
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const tasting = await getTastingRow(id);
  if (!tasting) {
    notFound();
  }

  const participantRows = await getParticipantRows(id);

  const userIds = (participantRows ?? []).map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email, avatar_url, location, favorite_wine_type")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  // Cross-tasting stats for the participants card (tastings attended, avg
  // points) — one batched query via the shared helper, not per-person.
  const statsByUserId = await getBulkProfileSummaries(userIds);

  const wines = await getWineRows(id);

  const isHost = tasting.host_id === user.id;
  const myParticipant = (participantRows ?? []).find(
    (p) => p.user_id === user.id,
  );
  const myStatus = myParticipant?.status ?? null;
  // Mirrors get_tasting_leaderboard's own guard, which is
  // `is_tasting_host(...) or is_tasting_participant(...)`. Deliberately not
  // myStatus === "JOINED": is_tasting_participant admits ANY participant row
  // whatever its status, so an INVITED user does get real standings from the
  // RPC, and a stricter gate here would hide a board they are entitled to.
  const canSeeStandings = isHost || Boolean(myParticipant);
  const hasStarted = tasting.status !== "DRAFT";
  const wineCount = (wines ?? []).length;
  // The running (started) view is a 3-column board; the draft lobby stays a
  // focused single column.
  const running = hasStarted;
  const revealedCount = (wines ?? []).filter((w) => w.is_revealed).length;
  const progressPct =
    wineCount > 0 ? Math.round((revealedCount / wineCount) * 100) : 0;
  // The wine currently in play (first not-yet-revealed) — its chip gets the
  // filled "active" treatment in the navigator, matching the prototype.
  const activeChipId = (wines ?? []).find((w) => !w.is_revealed)?.id ?? null;
  // Glasses whose answers ending the tasting would leave hidden (reveal-4).
  // Numbered by list order, not the stored position, like every other glass
  // number in the app; a glass part-way through a step reveal is "half".
  const unrevealedGlasses: UnrevealedGlass[] = [];
  (wines ?? []).forEach((w, i) => {
    if (!w.is_revealed) {
      unrevealedGlasses.push({
        glass: i + 1,
        state: w.reveal_step > 0 ? "half" : "hidden",
      });
    }
  });
  const participantCount = (participantRows ?? []).length;
  // Derived session state — "All revealed" and "Completed" are real phases,
  // not "In progress" sitting at 100% (owner: status must reflect actual state).
  const derivedStatus =
    tasting.status === "CLOSED"
      ? "Completed"
      : tasting.status === "IN_PROGRESS"
        ? wineCount > 0 && revealedCount === wineCount
          ? "All revealed"
          : "In progress"
        : "Not started";

  // OPEN (group Taste & Rate): nothing hidden. No guessing, no reveal — a
  // shared, ranked scoreboard — and people/wines can join at any time.
  const isOpen = tasting.reveal_mode === "OPEN";
  const isByo = tasting.wine_source === "PARTICIPANT_CONTRIBUTED";
  const nameByParticipantId = new Map(
    (participantRows ?? []).map((p) => [
      p.id,
      profileById.get(p.user_id)?.display_name ??
        profileById.get(p.user_id)?.email ??
        "Someone",
    ]),
  );
  const joinedParticipants = (participantRows ?? []).filter(
    (p) => p.status === "JOINED",
  );
  const wineLabel = makeWineLabeler(
    wines ?? [],
    tasting.wine_source,
    nameByParticipantId,
  );
  const participantsWithoutWine = isByo
    ? joinedParticipants.filter(
        (p) =>
          !(wines ?? []).some((w) => w.contributor_participant_id === p.id),
      )
    : [];

  // Who may add (spec §C.5 A1; scan-7, sources-5, entry-2): nobody once the
  // tasting is CLOSED; otherwise the host of a host-provides tasting, or a
  // JOINED participant in bring-your-own. It gates every Add button and the
  // registered header camera, as the server's resolveTastingAdder does.
  const canAddWine =
    tasting.status !== "CLOSED" &&
    (tasting.wine_source === "HOST_PROVIDES" ? isHost : myStatus === "JOINED");

  // Friends for the host's "invite more people" picker (only fetched for the
  // host, and only needed while the tasting is still in draft).
  let friends: { id: string; display_name: string; email: string }[] = [];
  // OPEN tastings have nothing to protect, so the host can invite after the
  // tasting has started too — not only while it's a draft.
  if (isHost && (!hasStarted || isOpen)) {
    const { data: friendRows } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id);
    const friendIds = (friendRows ?? []).map((f) => f.friend_id);
    const { data: friendProfiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", friendIds.length > 0 ? friendIds : [""])
      .order("display_name");
    friends = friendProfiles ?? [];
  }

  const canGuess = myStatus === "JOINED" && hasStarted && wineCount > 0;

  // The glasses the viewer added — is_wine_adder's rule: the host's for a glass
  // with no contributor, otherwise the contributor's own bottle.
  const isAdder = (w: { contributor_participant_id: string | null }) =>
    w.contributor_participant_id
      ? w.contributor_participant_id === myParticipant?.id
      : isHost;
  const myWineIds = (wines ?? []).filter(isAdder).map((w) => w.id);

  // The adder's two lines on their own glasses (spec §C.5 A1; D10, §C.9). Only
  // the viewer's own ids are read: wine_answers RLS hands a bring-your-own host
  // every answer, and they guess the others' bottles too.
  const linesByWineId = new Map<string, FlightWineLines>();
  if (myWineIds.length > 0) {
    const [{ data: answers, error: answersError }, { data: sources }] =
      await Promise.all([
        supabase
          .from("wine_answers")
          .select(
            "wine_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year, vintage_tawny_years, catalog_wine_id",
          )
          .in("wine_id", myWineIds),
        supabase.from("wines").select("id, added_via").in("id", myWineIds),
      ]);
    // A failed read must never show a finished glass as unfinished, so it
    // leaves every row without its lines.
    if (!answersError) {
      const list = answers ?? [];
      const answered = new Set(list.map((a) => a.wine_id));
      // A glass with no answer key is incomplete (D7).
      const unfinishedIds = myWineIds.filter((wineId) => !answered.has(wineId));
      const catalogIds = [
        ...new Set(
          list
            .map((a) => a.catalog_wine_id)
            .filter((wineId): wineId is string => Boolean(wineId)),
        ),
      ];
      const regionIds = [...new Set(list.map((a) => a.region_id))];
      const grapeIds = [...new Set(list.map((a) => a.primary_grape_id))];
      const [
        names,
        { data: catalog },
        { data: regions },
        { data: grapes },
        { data: drafts },
      ] = await Promise.all([
        lookupAppellationAndProducerNames({
          appellationIds: list.map((a) => a.appellation_id),
          producerIds: list.map((a) => a.producer_id),
        }),
        catalogIds.length > 0
          ? supabase
              .from("catalog_wines")
              .select("id, wine_name")
              .in("id", catalogIds)
          : Promise.resolve({
              data: [] as { id: string; wine_name: string | null }[],
            }),
        regionIds.length > 0
          ? supabase.from("regions").select("id, name").in("id", regionIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        grapeIds.length > 0
          ? supabase.from("grapes").select("id, name").in("id", grapeIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        // Drafts are owner-only (wine_identity_drafts RLS).
        unfinishedIds.length > 0
          ? supabase
              .from("wine_identity_drafts")
              .select("wine_id, draft, missing")
              .in("wine_id", unfinishedIds)
          : Promise.resolve({
              data: [] as { wine_id: string; draft: unknown; missing: string[] }[],
            }),
      ]);
      const wineName = new Map((catalog ?? []).map((c) => [c.id, c.wine_name]));
      const regionName = new Map((regions ?? []).map((r) => [r.id, r.name]));
      const grapeName = new Map((grapes ?? []).map((g) => [g.id, g.name]));
      const addedVia = new Map((sources ?? []).map((s) => [s.id, s.added_via]));
      for (const a of list) {
        const vintage =
          a.vintage_kind === "YEAR"
            ? String(a.vintage_year ?? "")
            : a.vintage_kind === "NV"
              ? "NV"
              : a.vintage_kind === "TAWNY"
                ? `${a.vintage_tawny_years ?? ""}yr tawny`
                : "";
        const producer = a.producer_id
          ? (names.get(a.producer_id) ?? null)
          : null;
        const cuvee = a.catalog_wine_id
          ? (wineName.get(a.catalog_wine_id) ?? null)
          : null;
        const via = addedVia.get(a.wine_id);
        linesByWineId.set(a.wine_id, {
          // "Vietti, Barolo Castiglione 2017"
          title:
            [[producer, cuvee].filter(Boolean).join(", "), vintage]
              .filter(Boolean)
              .join(" ") || null,
          // "{appellation} · {region} · {primary grape} · {source}"
          meta:
            [
              a.appellation_id ? names.get(a.appellation_id) : null,
              regionName.get(a.region_id),
              grapeName.get(a.primary_grape_id),
              via ? ADDED_VIA_COPY[via] : null,
            ]
              .filter(Boolean)
              .join(" · ") || null,
          incomplete: false,
        });
      }
      // The draft row's keys in contract order, the same mapping as the
      // tasting_incomplete_glasses rows. A glass with no draft row (a failed
      // second write, spec §C.8) needs every field.
      const draftByWineId = new Map((drafts ?? []).map((d) => [d.wine_id, d]));
      const unfinished = new Set(unfinishedIds);
      (wines ?? []).forEach((w, i) => {
        if (!unfinished.has(w.id)) return;
        const stored = draftByWineId.get(w.id);
        const missing = toIncompleteGlasses([
          { wine_id: w.id, glass: i + 1, missing: stored?.missing ?? [] },
        ]).flatMap((glass) => glass.missing);
        linesByWineId.set(w.id, {
          title: draftTitle(stored ? parseStoredDraft(stored.draft) : null),
          meta: flightRowNeeds(missing),
          incomplete: true,
        });
      });
    }
  }

  // Per-wine display state for the flight list, computed here (server) so the
  // WineFlightList client component only owns the *order* — reordering is
  // optimistic there, moveWine persists it. `contributorLabel` null => the row
  // is numbered positionally from its live index.
  const flightWines: FlightWine[] = (wines ?? []).map((w) => {
    const lines = linesByWineId.get(w.id) ?? null;
    return {
      id: w.id,
      contributorLabel: isByo ? wineLabel(w) : null,
      isRevealed: w.is_revealed,
      isByo,
      lines,
      // The server's edit guard (editRefusal in wines/new/tasting-wine-writes.ts,
      // plan amendment 7), for the adder only: never on a CLOSED tasting or a
      // revealed glass; a complete glass only until its first reveal step, an
      // incomplete one while the tasting runs.
      editable:
        isAdder(w) &&
        tasting.status !== "CLOSED" &&
        !w.is_revealed &&
        (lines?.incomplete === true || w.reveal_step === 0),
      canReorder: isHost && !w.is_revealed,
      canReveal:
        isHost && hasStarted && tasting.status !== "CLOSED" && !w.is_revealed,
    };
  });
  const editableWineIds = flightWines
    .filter((w) => w.editable)
    .map((w) => w.id);
  // No bring-your-own slots: one waiting row per JOINED participant without a
  // bottle, even while the flight is empty.
  const waitingFor: WaitingContributor[] = participantsWithoutWine.map((p) => ({
    participantId: p.id,
    name: nameByParticipantId.get(p.id) ?? "Someone",
  }));

  // The universal add-wine sheet's flight destination: the next glass number
  // is the live count + 1 (the page re-renders after every add).
  const flightDestination: FlightDestination = {
    kind: "flight",
    tastingId: id,
    tastingName: tasting.name,
    revealMode: tasting.reveal_mode,
    wineSource: tasting.wine_source,
    position: wineCount + 1,
  };
  const addWineButton = canAddWine ? (
    <AddToFlightButton destination={flightDestination} />
  ) : null;

  // The wine list (serving order + reveal state). Shown to everyone while
  // setting up: the host gets the reveal / reorder / add affordances, each adder
  // their own glasses' lines and Edit, and guessers a read-only flight overview.
  // While running it sits above the play cards for the host and for anyone who
  // added a glass, so mid-tasting adds, edits and reorders of unrevealed wines
  // happen on the page, not only in the console — its Edit is how a
  // bring-your-own contributor finishes their own glass once the tasting runs.
  const showWinesWhileRunning = isHost || myWineIds.length > 0;
  const winesPanel = (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">
          Wines
          {/* Only the host of a host-provides tasting gets a subtitle (spec
              §2.1 row 15): in bring-your-own each contributor sees only their
              own bottles. */}
          {isHost && !isByo ? (
            <span className="text-[12px] font-normal text-muted-foreground">
              {wineCount} {wineCount === 1 ? "wine" : "wines"} · only you can
              see them
            </span>
          ) : null}
          {addWineButton ? <span className="ml-auto">{addWineButton}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {wineCount === 0 && waitingFor.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wines added yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {isHost && !isByo && wineCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                This is the serving order — use the arrows to reorder.
              </p>
            ) : null}
            <WineFlightList
              tastingId={id}
              wines={flightWines}
              waitingFor={waitingFor}
              destination={flightDestination}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Full participant roster with cross-tasting stats — the draft lobby view.
  // Once running, the right-rail StandingsPanel takes over (ranked + room).
  const participantsCard = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Participants
          <span className="text-sm font-normal text-muted-foreground">
            {(participantRows ?? []).length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1">
          {(participantRows ?? []).map((p) => {
            const profile = profileById.get(p.user_id);
            const name = profile?.display_name ?? profile?.email ?? "Someone";
            const stats = statsByUserId.get(p.user_id);
            const infoBits = [
              profile?.location ? (
                <span key="loc" className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {profile.location}
                </span>
              ) : null,
              profile?.favorite_wine_type ? (
                <span key="wine" className="flex items-center gap-1">
                  <Wine className="size-3" />
                  {profile.favorite_wine_type}
                </span>
              ) : null,
              stats && stats.winesGuessed > 0 ? (
                <span key="stats">
                  {stats.tastingsAttended} tasting
                  {stats.tastingsAttended === 1 ? "" : "s"} ·{" "}
                  {stats.averagePoints.toFixed(1)} avg pts
                </span>
              ) : null,
            ].filter(Boolean);
            return (
              <li key={p.user_id}>
                <Link
                  href={`/u/${p.user_id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {profile?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.avatar_url}
                        alt=""
                        className="size-9 shrink-0 rounded-full object-cover ring-1 ring-border"
                      />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm">
                        {name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{name}</span>
                        {p.user_id === tasting.host_id ? (
                          <Badge variant="secondary">Host</Badge>
                        ) : null}
                      </span>
                      {infoBits.length > 0 ? (
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {infoBits}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <Badge variant={p.status === "JOINED" ? "default" : "outline"}>
                    {p.status === "JOINED"
                      ? "In"
                      : p.status === "INVITED"
                        ? "Invited"
                        : "Declined"}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );

  // entry-6: there is nothing left to accept on a CLOSED tasting, so the card
  // says so and drops Accept. Decline stays — it is how the invite is cleared.
  const inviteClosed = tasting.status === "CLOSED";
  const inviteCard =
    myStatus === "INVITED" ? (
      <Card
        className={
          inviteClosed
            ? "border-border bg-muted/40"
            : "border-primary/40 bg-primary/5"
        }
      >
        <CardHeader>
          <CardTitle className="text-base">You&apos;re invited</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {inviteClosed ? (
              "This tasting has finished. Decline to clear it from your invites."
            ) : (
              <>
                {profileById.get(tasting.host_id)?.display_name ?? "The host"}{" "}
                invited you to this tasting. Accept to take part.
              </>
            )}
          </p>
          <div className="flex gap-2">
            {inviteClosed ? null : (
              <form action={respondToInvite}>
                <input type="hidden" name="tasting_id" value={id} />
                <input type="hidden" name="response" value="accept" />
                <Button type="submit">Accept</Button>
              </form>
            )}
            <form action={respondToInvite}>
              <input type="hidden" name="tasting_id" value={id} />
              <input type="hidden" name="response" value="decline" />
              <Button type="submit" variant="outline">
                Decline
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    ) : null;

  // The host's way into the dark console while a blind / semi-blind tasting
  // runs: reveal glass by glass and watch who has locked in.
  const hostConsoleCard =
    isHost && hasStarted && !isOpen && tasting.status !== "CLOSED" ? (
      <Link
        href={`/tastings/${id}/host`}
        className="flex items-center gap-4 rounded-[13px] bg-primary p-[14px_18px] text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors hover:bg-[#4A1523]"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="font-heading text-[21px] font-semibold leading-[1.05]">
            Host console
          </span>
          <span className="text-[12.5px] text-primary-foreground/78">
            Reveal glass by glass, watch who has locked in.
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0" aria-hidden />
      </Link>
    ) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8">
      {hasStarted ? <AutoRefresh /> : null}
      {/* Registered whenever the viewer may add — running or not: adding
          mid-tasting is normal, so the header camera keeps targeting this
          flight. Never on a CLOSED tasting. The status and timing give the
          flight hint its phase. */}
      {canAddWine ? (
        <TastingScanRegistrar
          tastingId={id}
          tastingName={tasting.name}
          revealMode={tasting.reveal_mode}
          wineSource={tasting.wine_source}
          position={wineCount + 1}
          timingMode={tasting.timing_mode}
          status={tasting.status}
        />
      ) : null}
      {/* Where the legacy add and edit routes land: ?addWine=byhand and
          ?editWine=<wineId> open the sheet once (spec §C.6). */}
      <Suspense fallback={null}>
        <SheetFromQuery
          destination={flightDestination}
          canAddWine={canAddWine}
          editableWineIds={editableWineIds}
        />
      </Suspense>
      {/* Header: title + host settings, one prominent status, and secondary
          metadata as inline text rather than a row of equal-weight pills. The
          tasting photo rides alongside the title as a thumbnail — as a full
          3:1 banner it ate the whole first screen for very little information. */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          {tasting.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tasting.image_url}
              alt=""
              className="size-16 shrink-0 rounded-xl border border-border object-cover sm:size-20"
            />
          ) : null}
          <div className="min-w-0 flex-1">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {tasting.name}
          </h1>
          {tasting.description ? (
            <p className="mt-1.5 text-muted-foreground">{tasting.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Badge variant={hasStarted ? "default" : "outline"}>
              {derivedStatus}
            </Badge>
            <span className="text-muted-foreground">
              {wineCount} {wineCount === 1 ? "wine" : "wines"} ·{" "}
              {participantCount}{" "}
              {participantCount === 1 ? "participant" : "participants"}
              {tasting.scheduled_at ? (
                <>
                  {" · "}
                  <LocalDateTime iso={tasting.scheduled_at} />
                </>
              ) : null}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {tasting.timing_mode === "LIVE" ? "Live session" : "Self-paced"} ·{" "}
            {tasting.wine_source === "HOST_PROVIDES"
              ? "Host-selected wines"
              : "Everyone brings wines"}{" "}
            ·{" "}
            <Link
              href="/rules"
              className="text-primary transition-colors hover:text-primary/80"
            >
              {tasting.reveal_mode === "SEMI_BLIND"
                ? "Semi-blind scoring"
                : "Danish Championship scoring"}
            </Link>
          </p>
          </div>
        </div>
        {isHost ? (
          <div className="shrink-0">
            <HostControlsMenu
              tastingId={id}
              status={tasting.status}
              scheduledAt={tasting.scheduled_at}
              friends={friends}
              sequentialGuessing={tasting.sequential_guessing}
              // Guided pacing is LIVE-only (create-1, play-1, reveal-2): a
              // self-paced tasting has no shared "current glass" to gate on.
              showSequentialToggle={
                tasting.reveal_mode === "BLIND" &&
                tasting.timing_mode === "LIVE"
              }
              leaderboardReveal={tasting.leaderboard_reveal}
              // The standings setting only bites on a guided LIVE blind
              // tasting, where attributes are revealed one at a time (create-8).
              showLeaderboardToggle={
                tasting.reveal_mode === "BLIND" &&
                tasting.timing_mode === "LIVE" &&
                tasting.sequential_guessing
              }
              invitesStayOpen={isOpen}
              unrevealedGlasses={unrevealedGlasses}
            />
          </div>
        ) : null}
      </div>

      {inviteCard}

      {/* Start sits at a slot the draft and running trees share, never inside
          one branch. startTasting revalidates this page, so the lobby
          re-renders into the running board in the same commit that delivers
          its { success, warning }; mounted inside the draft column, the
          surface and its action state would unmount with that commit and the
          warning would never show (spec §C.7, amendment 2). Once running, it
          renders only that result. */}
      {isHost ? (
        <HostControls
          tastingId={id}
          status={tasting.status}
          // All three, so Start can decide where it lands (reveal-5):
          // only a LIVE blind host-provides host goes to the console.
          timingMode={tasting.timing_mode}
          revealMode={tasting.reveal_mode}
          wineSource={tasting.wine_source}
          surface="start"
        />
      ) : null}

      {running && isOpen ? (
        <div className="flex flex-col gap-4">
          {addWineButton ? (
            <div className="flex justify-end">{addWineButton}</div>
          ) : null}
          <OpenBoard
            tastingId={id}
            userId={user.id}
            canRate={myStatus === "JOINED"}
          />
        </div>
      ) : running ? (
        <>
          {/* Compact progress + wine navigator — replaces the old left rail. */}
          {wineCount > 0 ? (
            <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent px-4 py-3.5">
              <div className="flex flex-wrap gap-2">
                {(wines ?? []).map((w, i) => {
                  const active =
                    derivedStatus !== "Completed" && w.id === activeChipId;
                  return (
                    <a
                      key={w.id}
                      href={`#wine-${w.id}`}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : w.is_revealed
                            ? "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10"
                            : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          active
                            ? "bg-primary-foreground"
                            : w.is_revealed
                              ? "bg-primary"
                              : "bg-muted-foreground/40",
                        )}
                      />
                      Wine {i + 1}
                    </a>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                  {derivedStatus === "Completed"
                    ? "Completed"
                    : `${revealedCount} of ${wineCount} wines`}
                </span>
              </div>
            </div>
          ) : null}

          {/* The Wines card (below) carries its own Add button; a
              bring-your-own contributor with no glass here yet keeps this one. */}
          {addWineButton && !showWinesWhileRunning ? (
            <div className="flex justify-end">{addWineButton}</div>
          ) : null}

          {/* Results (~70%) + standings (~30%), or one column when the viewer
              is not entitled to the standings and the rail would be dead space. */}
          <div
            className={
              canSeeStandings
                ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]"
                : "grid gap-6"
            }
          >
            <div className="flex min-w-0 flex-col gap-6">
              {hostConsoleCard}
              {showWinesWhileRunning ? winesPanel : null}
              {canGuess ? (
                <PlayExperience tastingId={id} embedded />
              ) : (
                <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                  Guessing is for people taking part in this tasting.
                </p>
              )}
            </div>
            {/* An outsider must not get a board at all. get_tasting_leaderboard
                withholds the scores from them, but it does so by returning NO
                ROWS, and the panel builds its rows from tasting_participants and
                profiles, which are readable under RLS. Rendering it anyway
                produced a scoreboard that looked live and said everyone was on
                zero — indistinguishable from a tasting where nobody has scored,
                and wrong: the players had points. Withholding the numbers is not
                the same as withholding the board. */}
            {canSeeStandings ? (
              <aside
                id="standings"
                className="scroll-mt-24 lg:sticky lg:top-8 lg:self-start"
              >
                {/* Streamed: the standings do their own leaderboard query, and
                    gating the revealed category behind it made every reveal feel
                    slow for host and participants alike. */}
                <Suspense
                  fallback={
                    <div className="h-40 animate-pulse rounded-lg bg-muted/40" />
                  }
                >
                  <StandingsPanel tastingId={id} />
                </Suspense>
              </aside>
            ) : null}
          </div>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
          <div className="flex min-w-0 flex-col gap-6">
            {myStatus === "JOINED" && !isHost ? (
              <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                Waiting for the host to start the tasting.
              </p>
            ) : null}
            {winesPanel}
          </div>
          <aside className="lg:sticky lg:top-8 lg:self-start">
            {participantsCard}
          </aside>
        </div>
      )}
    </div>
  );
}
