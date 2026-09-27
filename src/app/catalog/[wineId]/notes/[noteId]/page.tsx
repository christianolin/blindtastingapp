import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchCatalogWine, catalogWineTitle, fetchNoteView } from "@/lib/wset/queries";
import { noteStateFromRow } from "@/lib/wset/note-state";
import type { AromaTerm } from "@/lib/wset/types";
import { noteReadSections, noteRouteMode } from "@/lib/notes/note-read";
import { contextBadge, scoreLine, tastedLine } from "@/lib/notes/shared-notes-view";
import { NoteEditor } from "../note-editor";
import { NoteReadView } from "./note-read-view";

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

  const [wine, { data: note }] = await Promise.all([
    fetchCatalogWine(supabase, wineId),
    supabase.from("wset_notes").select("*").eq("id", noteId).maybeSingle(),
  ]);
  // The "wset notes read" policy decides who reads a note (sharing-defaults
  // spec S8, S17): its author always; anyone else only an identified note
  // whose author shares with them and that is not held. A note it hides gets
  // the same answer as one that does not exist.
  const mode = noteRouteMode({ wineFound: Boolean(wine), note, wineId, viewerId: user.id });
  if (mode === "not-found" || !wine || !note) notFound();

  // Anyone but the author: a server-rendered read view, never the editor.
  if (mode === "read") {
    const [view, { data: author }] = await Promise.all([
      fetchNoteView(supabase, noteId),
      supabase.from("profiles").select("id, display_name, avatar_url").eq("id", note.author_id).maybeSingle(),
    ]);
    if (!view || !author) notFound();
    return (
      <NoteReadView
        wineId={wineId}
        wineTitle={catalogWineTitle(wine)}
        author={{ id: author.id, name: author.display_name, avatarUrl: author.avatar_url }}
        tastedLine={tastedLine(view.tastedOn)}
        badge={contextBadge(view.contextKind)}
        score={scoreLine(view.state.qualityScore)}
        sections={noteReadSections(view.state, view.termLabels)}
      />
    );
  }

  const { data: aromaRows } = await supabase
    .from("wset_note_aromas")
    .select("term_id, sensed_on_nose, sensed_on_palate")
    .eq("note_id", noteId);

  const { data: termRows } = await supabase
    .from("wset_aroma_terms")
    .select("id, family, origin, group_name, term, sort_order")
    .order("sort_order");
  const terms: AromaTerm[] = (termRows ?? []).map((t) => ({
    id: t.id,
    family: t.family,
    origin: t.origin,
    groupName: t.group_name,
    term: t.term,
    sortOrder: t.sort_order,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <NoteEditor
        wineId={wineId}
        wine={{ colour: wine.colour ?? "RED", style: wine.style ?? "STILL" }}
        title={catalogWineTitle(wine)}
        terms={terms}
        initial={noteStateFromRow(note, aromaRows ?? [])}
      />
    </div>
  );
}
