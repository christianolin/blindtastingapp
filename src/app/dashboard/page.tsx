import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Wine, Users, Sparkles, Target, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { BlindrMark } from "@/components/logo";
import { LinkLoadingHint } from "@/components/link-loading-hint";
import { createClient } from "@/lib/supabase/server";
import { getProfileStats } from "@/lib/profile-stats";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  const { data: participantRows } = await supabase
    .from("tasting_participants")
    .select("tasting_id, status")
    .eq("user_id", user.id);

  const tastingIds = (participantRows ?? []).map((p) => p.tasting_id);
  const [{ data: tastings }, { data: allParticipants }, { data: wines }, stats] =
    await Promise.all([
      supabase
        .from("tastings")
        .select("*")
        .in("id", tastingIds.length > 0 ? tastingIds : [""])
        .order("created_at", { ascending: false }),
      supabase
        .from("tasting_participants")
        .select("tasting_id")
        .in("tasting_id", tastingIds.length > 0 ? tastingIds : [""]),
      supabase
        .from("wines")
        .select("tasting_id, is_revealed")
        .in("tasting_id", tastingIds.length > 0 ? tastingIds : [""]),
      getProfileStats(user.id),
    ]);

  const statusByTastingId = new Map(
    (participantRows ?? []).map((p) => [p.tasting_id, p.status]),
  );

  const participantCountByTastingId = new Map<string, number>();
  for (const p of allParticipants ?? []) {
    participantCountByTastingId.set(
      p.tasting_id,
      (participantCountByTastingId.get(p.tasting_id) ?? 0) + 1,
    );
  }
  const wineCountByTastingId = new Map<string, { total: number; revealed: number }>();
  for (const w of wines ?? []) {
    const entry = wineCountByTastingId.get(w.tasting_id) ?? { total: 0, revealed: 0 };
    entry.total++;
    if (w.is_revealed) entry.revealed++;
    wineCountByTastingId.set(w.tasting_id, entry);
  }

  const hostedCount = (tastings ?? []).filter((t) => t.host_id === user.id).length;

  const statTiles = [
    {
      icon: Sparkles,
      label: "Tastings",
      value: stats.summary.tastingsAttended,
      sub: `${hostedCount} hosted`,
    },
    {
      icon: Wine,
      label: "Wines guessed",
      value: stats.summary.winesGuessed,
      sub: null,
    },
    {
      icon: Target,
      label: "Avg points / wine",
      value: stats.summary.averagePoints.toFixed(1),
      sub: null,
    },
    {
      icon: Trophy,
      label: "Total points",
      value: stats.summary.totalPoints,
      sub: null,
    },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        userId={user.id}
        displayName={profile?.display_name ?? user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
      />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-8">
        <div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            Welcome back, {profile?.display_name ?? user.email}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Ready to guess some wine?
          </p>
        </div>

        {stats.summary.winesGuessed > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statTiles.map((tile, i) => (
              <Card
                key={tile.label}
                className="animate-rise-in gap-2 overflow-hidden py-4"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <CardContent className="flex flex-col gap-1.5 px-4">
                  <tile.icon className="size-4 text-gold-deep" strokeWidth={2} />
                  <span className="font-heading text-2xl font-semibold tabular-nums">
                    {tile.value}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tile.label}
                    {tile.sub ? ` · ${tile.sub}` : ""}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <h2 className="font-heading text-2xl font-medium">Your tastings</h2>
          <Button
            nativeButton={false}
            render={<Link href="/tastings/new" />}
            className="shadow-sm"
          >
            New tasting
          </Button>
        </div>

        {(tastings ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-16 text-center">
            <BlindrMark size={48} />
            <div>
              <p className="font-heading text-xl font-medium">
                No tastings yet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create one and invite some friends to start guessing.
              </p>
            </div>
            <Button nativeButton={false} render={<Link href="/tastings/new" />}>
              Create your first tasting
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {(tastings ?? []).map((tasting, i) => {
              const isHost = tasting.host_id === user.id;
              const wineInfo = wineCountByTastingId.get(tasting.id) ?? {
                total: 0,
                revealed: 0,
              };
              const participantCount = participantCountByTastingId.get(tasting.id) ?? 0;
              return (
                <Link key={tasting.id} href={`/tastings/${tasting.id}`}>
                  <Card
                    className={cn(
                      "animate-rise-in group relative gap-3 overflow-hidden border-l-4 py-4 transition-all hover:-translate-y-0.5 hover:shadow-md",
                      isHost ? "border-l-primary" : "border-l-gold",
                    )}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex gap-4 px-4">
                      {tasting.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={tasting.image_url}
                          alt=""
                          className="size-20 shrink-0 rounded-lg object-cover"
                        />
                      ) : null}
                      <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <CardHeader className="p-0">
                          <CardTitle className="flex items-center justify-between text-base">
                            <span className="inline-flex items-center gap-2 font-heading text-lg font-semibold group-hover:text-primary">
                              {tasting.name}
                              <LinkLoadingHint />
                            </span>
                            {isHost ? (
                              <Badge className="bg-primary">Hosting</Badge>
                            ) : (
                              <Badge variant="outline">
                                {statusByTastingId.get(tasting.id)}
                              </Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        {tasting.description ? (
                          <p className="line-clamp-1 text-sm text-muted-foreground">
                            {tasting.description}
                          </p>
                        ) : null}
                        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-0 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            {tasting.timing_mode === "LIVE" ? (
                              <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/60" />
                                <span className="relative inline-flex size-2 rounded-full bg-destructive" />
                              </span>
                            ) : (
                              <Clock className="size-3.5" />
                            )}
                            {tasting.timing_mode === "LIVE" ? "Live" : "Async"}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Wine className="size-3.5" />
                            {wineInfo.total > 0
                              ? `${wineInfo.revealed}/${wineInfo.total} revealed`
                              : "No wines yet"}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Users className="size-3.5" />
                            {participantCount}
                          </span>
                          {tasting.wine_source === "PARTICIPANT_CONTRIBUTED" ? (
                            <Badge variant="secondary" className="ml-auto">
                              BYO wine
                            </Badge>
                          ) : null}
                        </CardContent>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
