import Link from "next/link";

export type HistoryRow = {
  id: string;
  title: string;
  quantity: number;
  reason: "DRANK" | "GIFTED" | "LOST" | "OTHER";
  consumedOn: string;
  occasion: string | null;
  wsetNoteId: string | null;
  catalogWineId: string;
};

const REASON_LABELS: Record<HistoryRow["reason"], string> = {
  DRANK: "Drank",
  GIFTED: "Gifted",
  LOST: "Lost",
  OTHER: "Removed",
};

export function HistoryList({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="font-heading text-lg font-medium">Nothing drunk yet</p>
        <p className="text-sm text-muted-foreground">
          When you drink or remove a bottle it shows up here.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
        >
          <span className="min-w-0">
            <span className="font-medium">{r.title}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {r.quantity}
              {"× · "}
              {REASON_LABELS[r.reason]}
              {" · "}
              {new Date(r.consumedOn).toLocaleDateString()}
              {r.occasion ? ` · ${r.occasion}` : ""}
            </span>
          </span>
          {r.wsetNoteId ? (
            <Link
              href={`/catalog/${r.catalogWineId}/notes/${r.wsetNoteId}`}
              className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Note
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}
