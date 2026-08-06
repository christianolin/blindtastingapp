import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { fetchArchetype } from "@/lib/wset/queries";
import { ArchetypeSheet } from "@/components/wset/archetype-sheet";

export default async function ArchetypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();

  // Still a Supabase read: only the identity lookup moved to the DAL.
  const supabase = await createClient();
  const archetype = await fetchArchetype(supabase, id);
  if (!archetype) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 p-6">
      <Link
        href="/knowledge/map"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Map
      </Link>
      <ArchetypeSheet a={archetype} />
    </div>
  );
}
