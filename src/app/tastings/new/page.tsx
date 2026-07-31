import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { NewTastingForm } from "./new-tasting-form";

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

  const { data: friendRows } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", user.id);
  const friendIds = (friendRows ?? []).map((f) => f.friend_id);
  const { data: friends } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", friendIds.length > 0 ? friendIds : [""])
    .order("display_name");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-6 sm:p-8">
      <Link
        href="/taste"
        className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary transition-colors hover:text-primary/80"
      >
        <ChevronLeft className="size-4" /> Back to tastings
      </Link>
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          New {reveal === "BLIND" ? "blind" : "semi-blind"} tasting
        </h1>
        <p className="mt-1 text-muted-foreground">
          Set up the details and invite your group.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <NewTastingForm
            friends={friends ?? []}
            userId={user.id}
            reveal={reveal}
          />
        </CardContent>
      </Card>
    </div>
  );
}
