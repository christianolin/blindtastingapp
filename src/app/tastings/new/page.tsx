import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewTastingSheet } from "@/components/new-tasting-sheet";
import { getNameSuggestionContext } from "./actions";

// The old full-page route, kept so existing links work: it renders the same
// three-step sheet inline (no dialog chrome). `?mode=semi-blind` still sets
// the default mode; the tiles inside can change it.
export default async function NewTastingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const reveal = mode === "semi-blind" ? "SEMI_BLIND" : "BLIND";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // The name chip comes from the same helper the launcher sheet calls on
  // open, so both entry points suggest the same "{Region} #{n}".
  const [{ data: friendRows }, regionSuggestion] = await Promise.all([
    supabase.from("friendships").select("friend_id").eq("user_id", user.id),
    getNameSuggestionContext().catch(() => null),
  ]);
  const friendIds = (friendRows ?? []).map((f) => f.friend_id);
  const { data: friends } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", friendIds.length > 0 ? friendIds : [""])
    .order("display_name");

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-4 p-4 sm:p-8">
      <NewTastingSheet
        inline
        userId={user.id}
        defaultReveal={reveal}
        initialFriends={friends ?? []}
        regionSuggestion={regionSuggestion}
      />
    </div>
  );
}
