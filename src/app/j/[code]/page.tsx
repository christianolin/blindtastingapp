import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { createClient } from "@/lib/supabase/server";

// The share link from the create sheet's step 3: /j/<code>. Signed out →
// the login page, which comes back here (`?next=`). Signed in → the
// SECURITY DEFINER `join_tasting_by_code` self-joins (or accepts a pending
// invite) and the tasting page opens. A refused code (finished, already
// started, unknown) gets a small card, not an error page.
export default async function JoinByCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/j/${code}`)}`);
  }

  const { data: tastingId, error } = await supabase.rpc("join_tasting_by_code", {
    p_code: code,
  });
  if (!error && tastingId) {
    redirect(`/tastings/${tastingId}`);
  }

  const message = friendlyJoinError(error?.message ?? null);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4">
      <Wordmark />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Couldn&apos;t join that tasting</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          <Link
            href="/overview"
            className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
          >
            Back to the overview
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

// The RPC raises short lower-case reasons; turn them into a sentence.
function friendlyJoinError(raw: string | null): string {
  if (!raw) return "The link didn't work. Ask the host for a fresh one.";
  if (raw.includes("no tasting has that code")) {
    return "No tasting has that code — check the link with the host.";
  }
  if (raw.includes("has finished")) return "That tasting has finished.";
  if (raw.includes("already started")) {
    return "That tasting has already started, so the table is closed.";
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1) + (raw.endsWith(".") ? "" : ".");
}
