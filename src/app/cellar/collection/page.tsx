import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/patterns/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCollectionStats } from "@/lib/cellar/collection";
import { COLLECTION_CAPTION } from "@/lib/cellar/collection-math";
import { CellarSubNav } from "../cellar-sub-nav";
import { CollectionView } from "./collection-view";

// CC-U7, spec §5.8, D4, D5; refinements 10, 11, 17, 23. Owner-only, like
// History (CC-D4's `getCollectionStats` reads the owner's own rows so
// `yours`/`tasted`/`yourAverage` are populated — this page never renders
// for another user's cellar, unlike Bottles).
export default async function CellarCollectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const stats = await getCollectionStats(supabase, user.id);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
      <PageHeader title="The collection" />
      <CellarSubNav current="collection" />
      <p className="text-sm text-muted-foreground">
        {COLLECTION_CAPTION}{" "}
        <Link
          href="/profile/numbers"
          className="text-primary underline-offset-2 hover:underline"
        >
          Your numbers
        </Link>
      </p>
      <CollectionView stats={stats} />
    </div>
  );
}
