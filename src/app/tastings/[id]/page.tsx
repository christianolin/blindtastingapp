import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkLoadingHint } from "@/components/link-loading-hint";
import { LocalDateTime } from "@/components/local-date-time";
import { createClient } from "@/lib/supabase/server";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { makeWineLabeler } from "@/lib/wine-label";
import { AutoRefresh } from "@/components/auto-refresh";
import { HostControls } from "./host-controls";
import { RevealButton } from "./play/reveal-button";
import { respondToInvite, moveWine } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Not started",
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  CLOSED: "Finished",
};

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
    .select("id, display_name, email")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

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

  // The host set the answers, so show them a short identity per wine (so the
  // serving order is actually visible when reordering — otherwise every hidden
  // wine looks identical). Never fetched for non-hosts.
  const hostWineIdentity = new Map<string, string>();
  if (isHost && wineCount > 0) {
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
            : `${a.vintage_tawny_years ?? ""}yr tawny`;
      hostWineIdentity.set(
        a.wine_id,
        [nm.get(a.producer_id), nm.get(a.region_id), vintage]
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-8">
      {hasStarted ? <AutoRefresh /> : null}
      {tasting.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tasting.image_url}
          alt=""
          className="aspect-[3/1] w-full rounded-xl object-cover"
        />
      ) : null}

      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {tasting.name}
        </h1>
        {tasting.description ? (
          <p className="mt-2 text-muted-foreground">{tasting.description}</p>
        ) : null}
        {tasting.scheduled_at ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-4" />
            <LocalDateTime iso={tasting.scheduled_at} />
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant={hasStarted ? "default" : "outline"}>
            {STATUS_LABEL[tasting.status] ?? tasting.status}
          </Badge>
          <Badge variant="secondary">
            {tasting.timing_mode === "LIVE" ? "Live" : "Async"}
          </Badge>
          <Badge variant="secondary">
            {tasting.wine_source === "HOST_PROVIDES"
              ? "Host provides wines"
              : "Participants bring wines"}
          </Badge>
          {tasting.reveal_mode === "SEMI_BLIND" ? (
            <Link href="/rules">
              <Badge variant="secondary" className="hover:bg-secondary/70">
                Semi-blind · scoring ↗
              </Badge>
            </Link>
          ) : (
            <Link href="/rules">
              <Badge variant="secondary" className="hover:bg-secondary/70">
                Danish Championship rules ↗
              </Badge>
            </Link>
          )}
        </div>
      </div>

      {/* Pending invite: accept or decline before you can take part. */}
      {myStatus === "INVITED" ? (
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
      ) : null}

      {/* Prominent primary actions once you're in and the tasting is live. */}
      {canGuess ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href={`/tastings/${id}/play`} />}
            className="h-auto justify-start gap-3 py-4 text-left shadow-sm"
          >
            <ListChecks className="size-6 shrink-0" strokeWidth={2} />
            <span className="flex flex-col">
              <span className="text-base font-semibold">Guess the wines</span>
              <span className="text-xs font-normal opacity-80">
                Enter or edit your guesses
              </span>
            </span>
            <LinkLoadingHint className="ml-auto" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href={`/tastings/${id}/results`} />}
            className="h-auto justify-start gap-3 py-4 text-left"
          >
            <Trophy className="size-6 shrink-0 text-gold-deep" strokeWidth={2} />
            <span className="flex flex-col">
              <span className="text-base font-semibold">View results</span>
              <span className="text-xs font-normal text-muted-foreground">
                Leaderboard &amp; revealed wines
              </span>
            </span>
            <LinkLoadingHint className="ml-auto" />
          </Button>
        </div>
      ) : myStatus === "JOINED" && !hasStarted ? (
        <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          Waiting for the host to start the tasting.
        </p>
      ) : null}

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
          <ul className="flex flex-col gap-2">
            {(participantRows ?? []).map((p) => {
              const profile = profileById.get(p.user_id);
              return (
                <li
                  key={p.user_id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    {profile?.display_name ?? profile?.email ?? p.user_id}
                    {p.user_id === tasting.host_id ? " (host)" : ""}
                  </span>
                  <Badge variant={p.status === "JOINED" ? "default" : "outline"}>
                    {p.status === "JOINED"
                      ? "In"
                      : p.status === "INVITED"
                        ? "Invited"
                        : "Declined"}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

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
                {tasting.wine_source === "HOST_PROVIDES"
                  ? "Add wine"
                  : "Add a wine"}
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
                {(wines ?? []).map((w, i) => (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span>{isByo ? wineLabel(w) : `Wine ${i + 1}`}</span>
                      {isHost && hostWineIdentity.get(w.id) ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {hostWineIdentity.get(w.id)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isHost && !w.is_revealed
                        ? reorderControls(
                            w.id,
                            i > 0,
                            i < (wines ?? []).length - 1,
                          )
                        : null}
                      {isHost && hasStarted && !w.is_revealed ? (
                        <RevealButton tastingId={id} wineId={w.id} />
                      ) : null}
                      <Badge variant={w.is_revealed ? "default" : "outline"}>
                        {w.is_revealed ? "Revealed" : isByo ? "Added" : "Hidden"}
                      </Badge>
                    </div>
                  </li>
                ))}
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

      {isHost ? (
        <HostControls
          tastingId={id}
          status={tasting.status}
          scheduledAt={tasting.scheduled_at}
          wineCount={wineCount}
          friends={friends}
          sequentialGuessing={tasting.sequential_guessing}
          showSequentialToggle={tasting.reveal_mode === "BLIND"}
        />
      ) : null}
    </div>
  );
}
