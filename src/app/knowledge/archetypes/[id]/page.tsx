import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchArchetype } from "@/lib/wset/queries";
import { ArchetypeLinks } from "@/components/wset/archetype-links";
import { ArchetypeSheet } from "@/components/wset/archetype-sheet";
import { placeHref } from "@/lib/training/copy";

export default async function ArchetypePage({
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

  const archetype = await fetchArchetype(supabase, id);
  if (!archetype) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 p-6">
      <Link
        href={archetype.placeKey ? placeHref(archetype.placeKey) : "/knowledge/map"}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Map
      </Link>
      <ArchetypeSheet a={archetype} />
      {/* "← Map" above already goes to the place, so only the practise link (RM10). */}
      <ArchetypeLinks placeKey={archetype.placeKey ?? null} />
    </div>
  );
}
