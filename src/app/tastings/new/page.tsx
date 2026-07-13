import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { NewTastingForm } from "./new-tasting-form";

export default async function NewTastingPage() {
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
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>New tasting</CardTitle>
        </CardHeader>
        <CardContent>
          <NewTastingForm friends={friends ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
