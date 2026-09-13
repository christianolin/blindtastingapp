import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchCatalogWine, catalogWineTitle } from "@/lib/wset/queries";
import { emptyNoteState } from "@/lib/wset/note-state";
import type { AromaTerm } from "@/lib/wset/types";
import { NoteEditor } from "../note-editor";

export default async function NewNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ wineId: string }>;
  searchParams: Promise<{ blindWine?: string; consumption?: string }>;
}) {
  const { wineId } = await params;
  const { blindWine, consumption } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const wine = await fetchCatalogWine(supabase, wineId);
  if (!wine) notFound();

  // A ?blindWine= link only ever means a REVEALED glass this viewer may note
  // (spec §9.3 item 5) — the database refuses the write regardless (M5's
  // "wset notes insert" policy hides an unrevealed glass's identity from
  // everyone), but a stale, pre-reveal or forged link should read as "not
  // found" rather than silently landing on an ordinary catalog note.
  if (blindWine) {
    const [{ data: revealed }, { data: allowed }] = await Promise.all([
      supabase.rpc("is_tasting_wine_revealed", { p_wine_id: blindWine }),
      supabase.rpc("can_note_tasting_wine", { p_wine_id: blindWine }),
    ]);
    if (!revealed || !allowed) notFound();
  }

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
        initial={emptyNoteState()}
        contextKind={blindWine ? "BLIND" : null}
        tastingWineId={blindWine ?? null}
        consumptionId={consumption ?? null}
      />
    </div>
  );
}
