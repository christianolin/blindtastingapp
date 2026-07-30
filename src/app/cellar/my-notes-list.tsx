import Link from "next/link";

export type NoteRow = {
  id: string;
  catalogWineId: string;
  title: string;
  tastedOn: string;
  qualityScore: number | null;
  contextKind: "OPEN" | "BLIND" | "TRAINING";
};

export function MyNotesList({ notes }: { notes: NoteRow[] }) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="font-heading text-lg font-medium">No tasting notes yet</p>
        <p className="text-sm text-muted-foreground">
          Notes you write on the WSET sheet show up here.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {notes.map((n) => (
        <Link
          key={n.id}
          href={`/catalog/${n.catalogWineId}/notes/${n.id}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/40"
        >
          <span className="min-w-0">
            <span className="font-medium">{n.title}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {new Date(n.tastedOn).toLocaleDateString()}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {n.contextKind === "BLIND" ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                Blind
              </span>
            ) : null}
            {n.qualityScore != null ? (
              <span className="font-heading tabular-nums">{n.qualityScore}</span>
            ) : null}
          </span>
        </Link>
      ))}
    </div>
  );
}
