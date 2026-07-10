import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    .select("user_id, status")
    .eq("tasting_id", id);

  const userIds = (participantRows ?? []).map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", userIds.length > 0 ? userIds : [""]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const isHost = tasting.host_id === user.id;

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

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{tasting.name}</h1>
          <div className="mt-2 flex gap-2">
            <Badge variant="secondary">
              {tasting.timing_mode === "LIVE" ? "Live" : "Async"}
            </Badge>
            <Badge variant="secondary">
              {tasting.wine_source === "HOST_PROVIDES"
                ? "Host provides wines"
                : "Participants bring wines"}
            </Badge>
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

      <p className="text-sm text-muted-foreground">
        {isHost
          ? "Wine entry is coming soon — you'll be able to add wines from here."
          : "Wine entry and guessing are coming soon."}
      </p>
    </div>
  );
}
