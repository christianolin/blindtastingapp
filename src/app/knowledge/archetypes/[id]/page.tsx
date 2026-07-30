import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchArchetype } from "@/lib/wset/queries";
import { ArchetypeSheet } from "@/components/wset/archetype-sheet";

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
        href="/knowledge/map"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Map
      </Link>
      <ArchetypeSheet a={archetype} />
    </div>
  );
}
