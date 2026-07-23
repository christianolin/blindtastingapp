import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronUp, MapPin, Wine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDateTime } from "@/components/local-date-time";
import { createClient } from "@/lib/supabase/server";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { getBulkProfileSummaries } from "@/lib/profile-stats";
import { makeWineLabeler } from "@/lib/wine-label";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "@/components/auto-refresh";
import { HostControls } from "./host-controls";
import { HostControlsMenu } from "./host-controls-menu";
import { StandingsPanel } from "./standings-panel";
import { RevealButton } from "./play/reveal-button";
import { PlayExperience } from "./play/play-experience";
import { respondToInvite, moveWine } from "./actions";

export default async function TastingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: tasting } = await supabase
    .from("tastings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!tasting) {
    notFound();
  }

  const { data: participantRows } = await supabase
    .from("tasting_participants")
    .select("id, user_id, status")
    .eq("tasting_id", id);

  const userIds = (participantRows ?? []).map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email, avatar_url, location, favorite_wine_type")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  // Cross-tasting stats for the participants card (tastings attended, avg
  // points) — one batched query via the shared helper, not per-person.
  const statsByUserId = await getBulkProfileSummaries(userIds);

  const { data: wines } = await supabase
    .from("wines")
    .select("id, position, is_revealed, contributor_participant_id")
    .eq("tasting_id", id)
    .order("position");

  const isHost = tasting.host_id === user.id;
  const myParticipant = (participantRows ?? []).find(
    (p) => p.user_id === user.id,
  );
  const myStatus = myParticipant?.status ?? null;
  const hasStarted = tasting.status !== "DRAFT";
  const wineCount = (wines ?? []).length;
  // The running (started) view is a 3-column board; the draft lobby stays a
  // focused single column.
  const running = hasStarted;
  const revealedCount = (wines ?? []).filter((w) => w.is_revealed).length;
  const progressPct =
    wineCount > 0 ? Math.round((revealedCount / wineCount) * 100) : 0;
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

  const canAddWine =
    tasting.wine_source === "HOST_PROVIDES"
      ? isHost
      : Boolean(myParticipant) && myStatus === "JOINED";

  // Friends for the host's "invite more people" picker (only fetched for the
  // host, and only needed while the tasting is still in draft).
  let friends: { id: string; display_name: string; email: string }[] = [];
  if (isHost && !hasStarted) {
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

  // HOST_PROVIDES only: the host set these answers, so showing a short identity
  // per wine lets reordering be visible (hidden wines otherwise look
  // identical) with no spoiler. NEVER in bring-your-own — there the host is a
  // guesser too and didn't bring the others' bottles, so their identities must
  // stay hidden until reveal (only the contributor's name shows).
  const hostWineIdentity = new Map<string, string>();
  if (isHost && !isByo && wineCount > 0) {
    const wineIds = (wines ?? []).map((w) => w.id);
    const [
      { data: hc },
      { data: hr },
      { data: hg },
      { data: ht },
      { data: hAnswers },
    ] = await Promise.all([
      supabase.from("countries").select("id, name"),
      supabase.from("regions").select("id, name"),
      supabase.from("grapes").select("id, name"),
      supabase.from("type_designations").select("id, name"),
      supabase.from("wine_answers").select("*").in("wine_id", wineIds),
    ]);
    const nm = new Map<string, string>();
    for (const list of [hc, hr, hg, ht])
      for (const r of list ?? []) nm.set(r.id, r.name);
    const looked = await lookupAppellationAndProducerNames({
      appellationIds: (hAnswers ?? []).map((a) => a.appellation_id),
      producerIds: (hAnswers ?? []).map((a) => a.producer_id),
    });
    for (const [id2, n] of looked) nm.set(id2, n);
    for (const a of hAnswers ?? []) {
      const vintage =
        a.vintage_kind === "YEAR"
          ? String(a.vintage_year ?? "")
          : a.vintage_kind === "NV"
            ? "NV"
            : a.vintage_kind === "TAWNY"
              ? `${a.vintage_tawny_years ?? ""}yr tawny`
              : "";
      hostWineIdentity.set(
        a.wine_id,
        [
          a.producer_id ? nm.get(a.producer_id) : null,
          nm.get(a.region_id),
          vintage,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    }
  }

  const reorderControls = (wineId: string, canUp: boolean, canDown: boolean) => (
    <span className="flex items-center gap-0.5">
      <form action={moveWine}>
        <input type="hidden" name="tasting_id" value={id} />
        <input type="hidden" name="wine_id" value={wineId} />
        <input type="hidden" name="direction" value="up" />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          aria-label="Move up"
          disabled={!canUp}
        >
          <ChevronUp className="size-4" />
        </Button>
      </form>
      <form action={moveWine}>
        <input type="hidden" name="tasting_id" value={id} />
        <input type="hidden" name="wine_id" value={wineId} />
        <input type="hidden" name="direction" value="down" />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          aria-label="Move down"
          disabled={!canDown}
        >
          <ChevronDown className="size-4" />
        </Button>
      </form>
    </span>
  );

  // The wine list (serving order + reveal state). Shown to everyone: host gets
  // the reveal / reorder / add / edit affordances, guessers see a read-only
  // flight overview. Lives in the left rail while running, inline while setting
  // up.
  const winesPanel = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Wines
          {canAddWine ? (
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href={`/tastings/${id}/wines/new`} />}
            >
              {tasting.wine_source === "HOST_PROVIDES" ? "Add wine" : "Add a wine"}
            </Button>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {wineCount === 0 ? (
          <p className="text-sm text-muted-foreground">No wines added yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {isHost && !isByo ? (
              <p className="text-xs text-muted-foreground">
                This is the serving order — use the arrows to reorder.
              </p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {(wines ?? []).map((w, i) => {
                // Editable while the tasting hasn't started, by whoever added
                // the wine: host for host-entered wines, the contributor for
                // their own BYO bottle.
                const editable =
                  !hasStarted &&
                  (w.contributor_participant_id
                    ? w.contributor_participant_id === myParticipant?.id
                    : isHost);
                const canReorder = isHost && !w.is_revealed;
                const canReveal =
                  isHost &&
                  hasStarted &&
                  tasting.status !== "CLOSED" &&
                  !w.is_revealed;
                const identity = isHost ? hostWineIdentity.get(w.id) : null;
                return (
                  <li
                    key={w.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-2.5 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">
                        {isByo ? wineLabel(w) : `Wine ${i + 1}`}
                      </span>
                      <Badge
                        variant={w.is_revealed ? "default" : "outline"}
                        className="shrink-0"
                      >
                        {w.is_revealed
                          ? "Revealed"
                          : isByo
                            ? "Added"
                            : "Hidden"}
                      </Badge>
                    </div>
                    {identity ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {identity}
                      </p>
                    ) : null}
                    {editable || canReorder || canReveal ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {editable ? (
                          <Button
                            size="sm"
                            variant="outline"
                            nativeButton={false}
                            render={
                              <Link
                                href={`/tastings/${id}/wines/${w.id}/edit`}
                              />
                            }
                          >
                            Edit
                          </Button>
                        ) : null}
                        {canReorder
                          ? reorderControls(
                              w.id,
                              i > 0,
                              i < (wines ?? []).length - 1,
                            )
                          : null}
                        {canReveal ? (
                          <RevealButton tastingId={id} wineId={w.id} />
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {isByo && participantsWithoutWine.length > 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Yet to add a wine:{" "}
                {participantsWithoutWine
                  .map((p) => nameByParticipantId.get(p.id) ?? "Someone")
                  .join(", ")}
              </p>
            ) : null}
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

  const inviteCard =
    myStatus === "INVITED" ? (
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">You&apos;re invited</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {profileById.get(tasting.host_id)?.display_name ?? "The host"}{" "}
            invited you to this tasting. Accept to take part.
          </p>
          <div className="flex gap-2">
            <form action={respondToInvite}>
              <input type="hidden" name="tasting_id" value={id} />
              <input type="hidden" name="response" value="accept" />
              <Button type="submit">Accept</Button>
            </form>
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8">
      {hasStarted ? <AutoRefresh /> : null}
      {tasting.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tasting.image_url}
          alt=""
          className="aspect-[3/1] w-full rounded-xl object-cover"
        />
      ) : null}

      {/* Header: title + host settings, one prominent status, and secondary
          metadata as inline text rather than a row of equal-weight pills. */}
      <div className="flex items-start justify-between gap-4">
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
              className="underline underline-offset-4 hover:text-foreground"
            >
              {tasting.reveal_mode === "SEMI_BLIND"
                ? "Semi-blind scoring"
                : "Danish Championship scoring"}
            </Link>
          </p>
        </div>
        {isHost ? (
          <div className="shrink-0">
            <HostControlsMenu
              tastingId={id}
              status={tasting.status}
              scheduledAt={tasting.scheduled_at}
              wineCount={wineCount}
              friends={friends}
              sequentialGuessing={tasting.sequential_guessing}
              showSequentialToggle={tasting.reveal_mode === "BLIND"}
              leaderboardReveal={tasting.leaderboard_reveal}
              showLeaderboardToggle={tasting.reveal_mode === "BLIND"}
            />
          </div>
        ) : null}
      </div>

      {inviteCard}

      {running ? (
        <>
          {/* Compact progress + wine navigator — replaces the old left rail. */}
          {wineCount > 0 ? (
            <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-heading text-sm font-semibold">
                  {derivedStatus === "Completed"
                    ? "Completed"
                    : `${revealedCount} of ${wineCount} revealed`}
                </span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {progressPct}%
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5">
                {(wines ?? []).map((w, i) => (
                  <a
                    key={w.id}
                    href={`#wine-${w.id}`}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      w.is_revealed
                        ? "border-primary/30 bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        w.is_revealed
                          ? "bg-primary"
                          : "bg-muted-foreground/40",
                      )}
                    />
                    Wine {i + 1}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {/* Results (~70%) + standings (~30%). */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
            <div className="flex min-w-0 flex-col gap-6">
              {canGuess ? (
                <PlayExperience tastingId={id} embedded />
              ) : (
                <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                  Guessing is for people taking part in this tasting.
                </p>
              )}
            </div>
            <aside className="lg:sticky lg:top-8 lg:self-start">
              <StandingsPanel tastingId={id} />
            </aside>
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
            {isHost ? (
              <HostControls
                tastingId={id}
                status={tasting.status}
                wineCount={wineCount}
                surface="start"
              />
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
