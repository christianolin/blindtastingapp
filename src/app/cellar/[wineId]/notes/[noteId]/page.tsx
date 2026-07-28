import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchCatalogWine, catalogWineTitle } from "@/lib/wset/queries";
import { noteStateFromRow } from "@/lib/wset/note-state";
import type { AromaTerm } from "@/lib/wset/types";
import { NoteEditor } from "../note-editor";

export default async function EditNotePage({
  params,
}: {
  params: Promise<{ wineId: string; noteId: string }>;
}) {
  const { wineId, noteId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const wine = await fetchCatalogWine(supabase, wineId);
  if (!wine) notFound();

  const { data: note } = await supabase
    .from("wset_notes")
    .select("*")
    .eq("id", noteId)
    .maybeSingle();
  // Only the author edits a note (RLS also blocks the write); others reach it
  // read-only via the wine's aggregate, not this editor.
  if (!note || note.author_id !== user.id || note.catalog_wine_id !== wineId) {
    notFound();
  }

  const { data: aromaRows } = await supabase
    .from("wset_note_aromas")
    .select("term_id, sensed_on_nose, sensed_on_palate")
    .eq("note_id", noteId);

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
        initial={noteStateFromRow(note, aromaRows ?? [])}
      />
    </div>
  );
}
