import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkLoadingHint } from "@/components/link-loading-hint";
import { createClient } from "@/lib/supabase/server";

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
  const myWine = (wines ?? []).find(
    (w) => w.contributor_participant_id === myParticipant?.id,
  );

  const canAddWine =
    tasting.wine_source === "HOST_PROVIDES"
      ? isHost
      : Boolean(myParticipant) && !myWine;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Dashboard
        </Link>
      </div>

      {tasting.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tasting.image_url}
          alt=""
          className="aspect-[3/1] w-full rounded-xl object-cover"
        />
      ) : null}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {tasting.name}
          </h1>
          {tasting.description ? (
            <p className="mt-2 text-muted-foreground">{tasting.description}</p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <Badge variant="secondary">
              {tasting.timing_mode === "LIVE" ? "Live" : "Async"}
            </Badge>
            <Badge variant="secondary">
              {tasting.wine_source === "HOST_PROVIDES"
                ? "Host provides wines"
                : "Participants bring wines"}
            </Badge>
            {tasting.reveal_mode === "SEMI_BLIND" ? (
              <Badge variant="secondary">Semi-blind</Badge>
            ) : (
              <Badge
                variant="secondary"
                title="Scored under Danish Championship (VM/DM) rules — points per category: country, region, appellation, primary/secondary grape, producer, type designation, vintage."
              >
                Danish Championship rules
              </Badge>
            )}
            <Badge>{tasting.status}</Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
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
                    {p.status}
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
                nativeButton={false}
                render={<Link href={`/tastings/${id}/wines/new`} />}
              >
                {tasting.wine_source === "HOST_PROVIDES"
                  ? "Add wine"
                  : "Add your wine"}
              </Button>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(wines ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No wines added yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(wines ?? []).map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>Wine {w.position}</span>
                  <Badge variant={w.is_revealed ? "default" : "outline"}>
                    {w.is_revealed ? "Revealed" : "Hidden"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {tasting.wine_source === "PARTICIPANT_CONTRIBUTED" && myWine ? (
            <p className="mt-3 text-sm text-muted-foreground">
              You&apos;ve added your wine — waiting for the rest.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {myParticipant && (wines ?? []).length > 0 ? (
        <div className="flex gap-4">
          <Link
            href={`/tastings/${id}/play`}
            className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
          >
            Guess the wines →
            <LinkLoadingHint />
          </Link>
          <Link
            href={`/tastings/${id}/results`}
            className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
          >
            View results →
            <LinkLoadingHint />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
