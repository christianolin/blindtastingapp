import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { createClient } from "@/lib/supabase/server";
import { getBulkProfileSummaries } from "@/lib/profile-stats";
import { JoinPreview } from "./join-preview";

// The share link from the create sheet's step 3: /j/<code> (BT-G3, spec
// §4.3 item 4; ledger B3, B4; Q3). Every visitor first gets the anon-callable
// `get_join_preview(code)` — no row means an unknown code, a CLOSED tasting
// gets its own message, and a signed-in member (`viewer_tasting_id` set: the
// host, a JOINED or an INVITED participant) is sent straight to the tasting,
// where an INVITED viewer gets the full invitation. Anyone else — signed out,
// or signed in and not a member (a DECLINED guest coming back included) —
// gets `JoinPreview`, which reduces to name/time/mode/scoring when signed
// out and adds the host record, joined names and "I am in" when signed in.
// Opening the link no longer joins silently.
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

  const { data: rows } = await supabase.rpc("get_join_preview", { p_code: code });
  const preview = rows?.[0] ?? null;

  if (!preview) {
    return <MessageCard message="No tasting has that code — check the link with the host." />;
  }
  if (preview.status === "CLOSED") {
    return <MessageCard message="That tasting has finished." />;
  }
  if (preview.viewer_tasting_id) {
    redirect(`/tastings/${preview.viewer_tasting_id}`);
  }

  let hostRecord: { hostedCount: number; averagePoints: number | null } | null = null;
  if (user && preview.host_id) {
    const [{ data: hostedCount }, summaries] = await Promise.all([
      supabase.rpc("host_tastings_count", { p_user_id: preview.host_id }),
      getBulkProfileSummaries([preview.host_id]),
    ]);
    const summary = summaries.get(preview.host_id);
    hostRecord = {
      hostedCount: hostedCount ?? 0,
      averagePoints: summary && summary.winesGuessed > 0 ? summary.averagePoints : null,
    };
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <Wordmark />
      <JoinPreview code={code} preview={preview} signedIn={!!user} hostRecord={hostRecord} />
    </div>
  );
}

// The unknown-code and finished-tasting cards (existing copy, kept as-is).
function MessageCard({ message }: { message: string }) {
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
