import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayExperience } from "./play-experience";

// The guessing/reveal/results experience is shared with the tasting main page
// (it all lives on one page now); this standalone route is a thin wrapper so
// old /play links keep working.
export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tastingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tasting } = await supabase
    .from("tastings")
    .select("id, name, status")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) notFound();

  const { data: myParticipant } = await supabase
    .from("tasting_participants")
    .select("status")
    .eq("tasting_id", tastingId)
    .eq("user_id", user.id)
    .maybeSingle();

  const back = (
    <Link
      href={`/tastings/${tastingId}`}
      className="text-sm text-muted-foreground underline underline-offset-4"
    >
      ← Back to tasting
    </Link>
  );

  let body: React.ReactNode;
  if (!myParticipant) {
    body = <p>You&apos;re not a participant in this tasting.</p>;
  } else if (tasting.status === "DRAFT") {
    body = (
      <p className="text-muted-foreground">
        This tasting hasn&apos;t started yet.
      </p>
    );
  } else if (myParticipant.status !== "JOINED") {
    body = (
      <p className="text-muted-foreground">
        Accept your invitation before guessing.
      </p>
    );
  } else {
    body = <PlayExperience tastingId={tastingId} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-8">
      {back}
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        {tasting.name}
      </h1>
      {body}
    </div>
  );
}
