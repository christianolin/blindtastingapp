import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, Wine, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { BlindrMark } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { getProfileStats } from "@/lib/profile-stats";
import { TastingsTabs } from "./tastings-tabs";
import { TastingCard, type TastingCardData } from "./tasting-card";

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

  // Three dashboard buckets. Host rows are always JOINED participants, so a
  // hosted tasting would also match "attending" — keep it only under Hosting.
  const byId = new Map((tastings ?? []).map((t) => [t.id, t]));
  const invitedTastings = (participantRows ?? [])
    .filter((p) => p.status === "INVITED")
    .map((p) => byId.get(p.tasting_id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const hostingTastings = (tastings ?? []).filter((t) => t.host_id === user.id);
  const attendingTastings = (tastings ?? []).filter(
    (t) =>
      t.host_id !== user.id && statusByTastingId.get(t.id) === "JOINED",
  );

  const renderList = (
    list: TastingCardData[],
    accent: "primary" | "gold",
    label: string,
    emptyMsg: string,
  ) =>
    list.length === 0 ? (
      <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        {emptyMsg}
      </p>
    ) : (
      <div className="flex flex-col gap-3">
        {list.map((t, i) => (
          <TastingCard
            key={t.id}
            tasting={t}
            wineInfo={
              wineCountByTastingId.get(t.id) ?? { total: 0, revealed: 0 }
            }
            participantCount={participantCountByTastingId.get(t.id) ?? 0}
            badgeLabel={label}
            accent={accent}
            index={i}
          />
        ))}
      </div>
    );

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
          <TastingsTabs
            counts={{
              invited: invitedTastings.length,
              hosting: hostingTastings.length,
              attending: attendingTastings.length,
            }}
            invited={renderList(
              invitedTastings,
              "primary",
              "Invited",
              "No pending invitations.",
            )}
            hosting={renderList(
              hostingTastings,
              "primary",
              "Hosting",
              "You're not hosting any tastings yet.",
            )}
            attending={renderList(
              attendingTastings,
              "gold",
              "Attending",
              "You haven't joined anyone else's tasting yet.",
            )}
          />
        )}
      </div>
    </div>
  );
}
