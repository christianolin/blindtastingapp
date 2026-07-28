import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchCatalogWine, catalogWineTitle } from "@/lib/wset/queries";
import { emptyNoteState } from "@/lib/wset/note-state";
import type { AromaTerm } from "@/lib/wset/types";
import { NoteEditor } from "../note-editor";

export default async function NewNotePage({
  params,
}: {
  params: Promise<{ wineId: string }>;
}) {
  const { wineId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const wine = await fetchCatalogWine(supabase, wineId);
  if (!wine) notFound();

  const { data: termRows } = await supabase
    .from("wset_aroma_terms")
    .select("id, family, group_name, term, sort_order")
    .order("sort_order");
  const terms: AromaTerm[] = (termRows ?? []).map((t) => ({
    id: t.id,
    family: t.family,
    groupName: t.group_name,
    term: t.term,
    sortOrder: t.sort_order,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <NoteEditor
        wineId={wineId}
        wine={{ colour: wine.colour, style: wine.style }}
        title={catalogWineTitle(wine)}
        terms={terms}
        initial={emptyNoteState()}
      />
    </div>
  );
}
