import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveTastingAdder } from "./tasting-wine-writes";

// Legacy route (spec §C.6, D13). The add-wine sheet's by-hand form replaced the
// answer-key page, so anyone who may add a glass is sent to the lobby, which
// opens the sheet on By hand from its query string. Anyone the add rule refuses
// (a finished tasting, a bring-your-own guest who hasn't joined, a non-host of a
// host-provides tasting) sees why instead.
export default async function NewWinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tastingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const adder = await resolveTastingAdder(supabase, user.id, tastingId);
  if (!("error" in adder)) {
    redirect(`/tastings/${tastingId}?addWine=byhand`);
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-8">
      <p>{adder.error}</p>
      <Link
        href={`/tastings/${tastingId}`}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to tasting
      </Link>
    </div>
  );
}
