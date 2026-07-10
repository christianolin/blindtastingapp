import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

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
    .select("display_name")
    .eq("id", user.id)
    .single();

  const { data: participantRows } = await supabase
    .from("tasting_participants")
    .select("tasting_id, status")
    .eq("user_id", user.id);

  const tastingIds = (participantRows ?? []).map((p) => p.tasting_id);
  const { data: tastings } = await supabase
    .from("tastings")
    .select("*")
    .in("id", tastingIds.length > 0 ? tastingIds : [""])
    .order("created_at", { ascending: false });

  const statusByTastingId = new Map(
    (participantRows ?? []).map((p) => [p.tasting_id, p.status]),
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Welcome, {profile?.display_name ?? user.email}
        </h1>
        <form action={signOut}>
          <Button variant="outline" type="submit">
            Sign out
          </Button>
        </form>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Your tastings</h2>
        <Button nativeButton={false} render={<Link href="/tastings/new" />}>
          New tasting
        </Button>
      </div>

      {(tastings ?? []).length === 0 ? (
        <p className="text-muted-foreground">
          No tastings yet — create one to get started.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {(tastings ?? []).map((tasting) => (
            <Link key={tasting.id} href={`/tastings/${tasting.id}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    {tasting.name}
                    {tasting.host_id === user.id ? (
                      <Badge variant="secondary">Hosting</Badge>
                    ) : (
                      <Badge variant="outline">
                        {statusByTastingId.get(tasting.id)}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex gap-2 text-sm text-muted-foreground">
                  <span>{tasting.timing_mode === "LIVE" ? "Live" : "Async"}</span>
                  <span>·</span>
                  <span>
                    {tasting.wine_source === "HOST_PROVIDES"
                      ? "Host provides wines"
                      : "Participants bring wines"}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
