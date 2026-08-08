"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Wine, NotebookPen, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { catalogWineTitle } from "@/lib/wset/queries";
import { NewNoteModal } from "@/components/new-note-modal";

type Row = {
  tastingWineId: string;
  catalogWineId: string;
  title: string;
  imageUrl: string | null;
  scores: { name: string; score: number | null; isMe: boolean }[];
  avg: number | null;
  raters: number;
};

// The group Taste & Rate board: nothing hidden. Every wine shows each
// participant's score, its average and rater count, ranked by average. Scores
// come from wset_notes joined on tasting_wine_id (public-read RLS makes them
// visible across participants) — no new tables. Anyone JOINED can rate any
// wine at any time; not everyone has to rate everything.
export function OpenBoard({
  tastingId,
  userId,
  canRate,
}: {
  tastingId: string;
  userId: string;
  canRate: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rating, setRating] = useState<{
    tastingWineId: string;
    catalogWineId: string;
  } | null>(null);

  const load = useCallback(async () => {
    const { data: wineRows } = await supabase
      .from("wines")
      .select("id, position, catalog_wine_id:wine_answers(catalog_wine_id)")
      .eq("tasting_id", tastingId)
      .order("position");
    const wines = (wineRows ?? []) as unknown as Array<{
      id: string;
      catalog_wine_id: { catalog_wine_id: string }[] | { catalog_wine_id: string } | null;
    }>;
    const catalogIdOf = (w: (typeof wines)[number]) => {
      const a = Array.isArray(w.catalog_wine_id)
        ? w.catalog_wine_id[0]
        : w.catalog_wine_id;
      return a?.catalog_wine_id ?? null;
    };
    const catalogIds = [
      ...new Set(wines.map(catalogIdOf).filter(Boolean) as string[]),
    ];
    const wineTastingIds = wines.map((w) => w.id);

    const [{ data: catRows }, { data: noteRows }, { data: partRows }] =
      await Promise.all([
        catalogIds.length
          ? supabase
              .from("catalog_wines")
              .select(
                "id, wine_name, vintage_kind, vintage_year, vintage_tawny_years, image_url, " +
                  "producer:producers(name), appellation:appellations(name)",
              )
              .in("id", catalogIds)
          : Promise.resolve({ data: [] }),
        wineTastingIds.length
          ? supabase
              .from("wset_notes")
              .select("tasting_wine_id, author_id, quality_score")
              .in("tasting_wine_id", wineTastingIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from("tasting_participants")
          .select("user_id")
          .eq("tasting_id", tastingId),
      ]);

    const authorIds = [
      ...new Set(
        ((noteRows ?? []) as { author_id: string }[]).map((n) => n.author_id),
      ),
      ...((partRows ?? []) as { user_id: string }[]).map((p) => p.user_id),
    ];
    const { data: nameRows } = authorIds.length
      ? await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", [...new Set(authorIds)])
      : { data: [] };
    const nameById = new Map(
      ((nameRows ?? []) as { id: string; display_name: string | null; email: string | null }[]).map(
        (p) => [p.id, p.display_name ?? p.email ?? "Someone"],
      ),
    );

    const unwrap = <T,>(v: T | T[] | null) =>
      Array.isArray(v) ? (v[0] ?? null) : v;
    const catById = new Map(
      ((catRows ?? []) as unknown as Record<string, unknown>[]).map((c) => [
        c.id as string,
        c,
      ]),
    );
    // Best (latest highest) score per author per wine.
    const scoresByWine = new Map<string, Map<string, number | null>>();
    for (const n of (noteRows ?? []) as {
      tasting_wine_id: string;
      author_id: string;
      quality_score: number | null;
    }[]) {
      const m = scoresByWine.get(n.tasting_wine_id) ?? new Map();
      const prev = m.get(n.author_id);
      if (prev == null || (n.quality_score ?? -1) > (prev ?? -1)) {
        m.set(n.author_id, n.quality_score);
      }
      scoresByWine.set(n.tasting_wine_id, m);
    }

    const built: Row[] = wines.map((w) => {
      const catalogWineId = catalogIdOf(w);
      const cat = catalogWineId ? catById.get(catalogWineId) : null;
      const scoreMap = scoresByWine.get(w.id) ?? new Map<string, number | null>();
      const scores = [...scoreMap.entries()].map(([uid, score]) => ({
        name: nameById.get(uid) ?? "Someone",
        score,
        isMe: uid === userId,
      }));
      const scored = scores
        .map((s) => s.score)
        .filter((s): s is number => s != null);
      const avg = scored.length
        ? scored.reduce((a, b) => a + b, 0) / scored.length
        : null;
      return {
        tastingWineId: w.id,
        catalogWineId: catalogWineId ?? "",
        title: cat
          ? catalogWineTitle({
              producerName: unwrap(cat.producer as { name: string }[] | null)?.name ?? null,
              wineName: (cat.wine_name as string | null) ?? null,
              vintageKind: cat.vintage_kind as "YEAR" | "NV" | "TAWNY",
              vintageYear: (cat.vintage_year as number | null) ?? null,
              vintageTawnyYears: (cat.vintage_tawny_years as number | null) ?? null,
              appellationName:
                unwrap(cat.appellation as { name: string }[] | null)?.name ?? null,
            })
          : "Wine",
        imageUrl: (cat?.image_url as string | null) ?? null,
        scores: scores.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
        avg,
        raters: scored.length,
      };
    });
    // Rank by average (unrated wines sink to the bottom).
    built.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
    setRows(built);
  }, [supabase, tastingId, userId]);

  useEffect(() => {
    let cancelled = false;
    // Guarded so the async result can't set state after unmount; the wrapper
    // also keeps the effect body from looking like a synchronous setState.
    void (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (rows === null) {
    return (
      <div className="h-40 animate-pulse rounded-xl border border-border bg-muted/40" />
    );
  }
  if (rows.length === 0) {
    return (
      <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
        No wines yet. Add the first bottle to start scoring.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => {
        const myScore = r.scores.find((s) => s.isMe)?.score ?? null;
        return (
          <div
            key={r.tastingWineId}
            className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-start sm:gap-4"
          >
            <div className="flex items-center gap-2 sm:w-8 sm:justify-center">
              <span className="font-heading text-lg tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              {i === 0 && r.avg != null ? (
                <Trophy className="size-4 text-gold-deep sm:hidden" />
              ) : null}
            </div>
            {r.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.imageUrl}
                alt=""
                className="h-16 w-12 shrink-0 rounded-md border border-border object-cover"
              />
            ) : (
              <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                <Wine className="size-5" />
              </span>
            )}

            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.title}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {r.scores.length === 0 ? (
                  <span>No scores yet</span>
                ) : (
                  r.scores.map((s, k) => (
                    <span key={k} className={s.isMe ? "text-foreground" : undefined}>
                      {s.name}
                      {s.isMe ? " (you)" : ""}:{" "}
                      <span className="font-medium tabular-nums">
                        {s.score ?? "—"}
                      </span>
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
              <span className="flex items-baseline gap-1">
                <span className="font-heading text-2xl tabular-nums">
                  {r.avg != null ? r.avg.toFixed(1) : "—"}
                </span>
                <span className="text-xs text-muted-foreground">avg</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {r.raters} {r.raters === 1 ? "rating" : "ratings"}
              </span>
              {canRate ? (
                <button
                  type="button"
                  onClick={() =>
                    setRating({
                      tastingWineId: r.tastingWineId,
                      catalogWineId: r.catalogWineId,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
                >
                  {myScore != null ? (
                    <>
                      <Star className="size-3.5 text-gold-deep" /> Update note
                    </>
                  ) : (
                    <>
                      <NotebookPen className="size-3.5" /> Rate this wine
                    </>
                  )}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}

      {rating ? (
        <NewNoteModal
          wineId={rating.catalogWineId}
          tastingWineId={rating.tastingWineId}
          contextKind="OPEN"
          onClose={() => setRating(null)}
          onSaved={() => {
            router.refresh();
            load();
          }}
        />
      ) : null}
    </div>
  );
}
