import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { PeopleList } from "./people-list";
import { FriendsList } from "./friends-list";

// People & Friends — one page, two tabs (?tab=friends selects the second).
// Reached from the Tastings menu; /friends redirects here.
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const { q, tab: tabParam } = await searchParams;
  const tab = tabParam === "friends" ? "friends" : "people";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  const tabClass = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm transition-colors",
      active
        ? "bg-background text-foreground shadow-sm ring-1 ring-border"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        userId={user.id}
        displayName={me?.display_name ?? user.email ?? ""}
        avatarUrl={me?.avatar_url ?? null}
      />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            People &amp; Friends
          </h1>
          <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
            <Link href="/people" className={tabClass(tab === "people")}>
              People
            </Link>
            <Link
              href="/people?tab=friends"
              className={tabClass(tab === "friends")}
            >
              Friends
            </Link>
          </div>
        </div>
        {tab === "people" ? (
          <PeopleList q={q} userId={user.id} />
        ) : (
          <FriendsList userId={user.id} />
        )}
      </div>
    </div>
  );
}
