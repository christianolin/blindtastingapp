import Link from "next/link";
import { Wine } from "lucide-react";

export type HistoryRow = {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
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
  OTHER: "Removed from cellar",
};

// History is events that happened to bottles you own — each card leads with
// the bottle, then says what happened, how many and when.
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
          className="flex items-center gap-3 rounded-xl border border-border p-3"
        >
          {r.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={r.imageUrl}
              alt=""
              className="h-14 w-10 shrink-0 rounded-md border border-border object-cover"
            />
          ) : (
            <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
              <Wine className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <Link
              href={`/catalog/${r.catalogWineId}`}
              className="block truncate font-medium hover:underline"
            >
              {r.title}
            </Link>
            {r.subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>
            ) : null}
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {REASON_LABELS[r.reason]}
              </span>
              {" · "}
              {r.quantity} {r.quantity === 1 ? "bottle" : "bottles"}
              {" · "}
              {new Date(r.consumedOn).toLocaleDateString()}
              {r.occasion ? ` · ${r.occasion}` : ""}
            </p>
          </div>
          {r.wsetNoteId ? (
            <Link
              href={`/catalog/${r.catalogWineId}/notes/${r.wsetNoteId}`}
              className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Note
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}
