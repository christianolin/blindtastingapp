import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/patterns/page-header";
import { getCellarBottles } from "@/lib/cellar/bottles";
import { headerStats, headerSubtitle } from "@/lib/cellar/cellar-rows";
import { CellarBottles } from "@/app/cellar/cellar-bottles";
import { isDeletedProfile } from "@/lib/account/delete-account";

// A friend's cellar rendered with the same Bottles frame as your own, but
// `readOnly` (CC-U8, spec §5.9, D12): community ratings shown, the viewer's
// own score and every action hidden, no lot sheet, no in-flight marker, no
// sub-nav, no History or collection link, no value anywhere. Gated by
// can_view_cellar (visibility PUBLIC/FRIENDS); "cellar own select" admits the
// owner alone, so `getCellarBottles` reads the lots through `shared_cellar_lots`
// (masked pours, 20260919223100/20260919223200). Notes, consumptions and pour
// intents stay private to the owner — `getCellarBottles`'s `readOnly: true`
// skips those reads entirely, and nothing here reads them either.
export default async function UserCellarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (id === user.id) redirect("/cellar");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, deleted_at")
    .eq("id", id)
    .maybeSingle();
  // A deleted account's cellar is gone with it (D16).
  if (!profile || isDeletedProfile(profile)) notFound();
  const displayName = profile.display_name ?? "This member";

  const { data: canView } = await supabase.rpc("can_view_cellar", { p_owner: id });

  const rows = canView ? await getCellarBottles(supabase, id, user.id, { readOnly: true }) : [];

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
        <PageHeader
          title={`${displayName}’s cellar`}
          subtitle={headerSubtitle(headerStats(rows), { phone: false, readOnly: true })}
        />

        {!canView ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
            <p className="font-heading text-lg font-medium">This cellar is private</p>
            <p className="text-sm text-muted-foreground">
              {displayName} hasn&apos;t shared their cellar with you.
            </p>
          </div>
        ) : (
          <CellarBottles rows={rows} readOnly />
        )}
      </div>
    </div>
  );
}
