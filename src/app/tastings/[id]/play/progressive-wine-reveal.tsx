import { createClient } from "@/lib/supabase/server";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { cn } from "@/lib/utils";

// The spoiler-safe progressive read shape (get_wine_reveal). Only categories
// <= reveal_step are present; unrevealed ones are omitted entirely.
type Rev = {
  reveal_step: number;
  in_play_count: number;
  is_fully_revealed: boolean;
  revealed_keys: string[];
  correct: Record<string, string | number | null>;
  guesses: {
    participant_id: string;
    values: Record<string, string | number | null>;
    points: Record<string, number | null>;
  }[];
};

const LABELS: Record<string, string> = {
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  grapes: "Grapes",
  producer: "Producer",
  type_designation: "Designation",
  vintage: "Vintage",
};

function vintageLabel(v: Record<string, string | number | null>) {
  if (v.vintage_kind === "YEAR") return String(v.vintage_year ?? "—");
  if (v.vintage_kind === "NV") return "NV";
  if (v.vintage_kind === "TAWNY")
    return `${v.vintage_tawny_years ?? "?"} years tawny`;
  return "—";
}

/**
 * The viewer's progressive result for a wine mid-reveal: one aligned row per
 * already-revealed attribute (correct value · your guess · points), a running
 * "X pts so far", and a count of how many attributes are still hidden. Reads
 * only get_wine_reveal, so nothing unrevealed is ever fetched.
 */
export async function ProgressiveWineReveal({
  wineId,
  myParticipantId,
}: {
  wineId: string;
  myParticipantId: string;
}) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_wine_reveal", { p_wine_id: wineId });
  const rev = data as Rev | null;
  if (!rev || rev.reveal_step === 0) return null;

  const [
    { data: countries },
    { data: regions },
    { data: grapes },
    { data: designations },
  ] = await Promise.all([
    supabase.from("countries").select("id, name"),
    supabase.from("regions").select("id, name"),
    supabase.from("grapes").select("id, name"),
    supabase.from("type_designations").select("id, name"),
  ]);
  const nameById = new Map<string, string>();
  for (const list of [countries, regions, grapes, designations])
    for (const r of list ?? []) nameById.set(r.id, r.name);

  const appellationIds: (string | null)[] = [
    rev.correct.appellation as string | null,
  ];
  const producerIds: (string | null)[] = [rev.correct.producer as string | null];
  for (const g of rev.guesses) {
    appellationIds.push((g.values.appellation as string | null) ?? null);
    producerIds.push((g.values.producer as string | null) ?? null);
  }
  const looked = await lookupAppellationAndProducerNames({
    appellationIds,
    producerIds,
  });
  for (const [id, n] of looked) nameById.set(id, n);

  const name = (id: string | number | null | undefined) =>
    id == null ? "—" : (nameById.get(String(id)) ?? "—");

  const me = rev.guesses.find((g) => g.participant_id === myParticipantId) ?? null;

  const rows = rev.revealed_keys.map((key) => {
    if (key === "grapes") {
      const correct =
        name(rev.correct.primary_grape) +
        (rev.correct.secondary_grape
          ? " / " + name(rev.correct.secondary_grape)
          : "");
      const guessed =
        me && me.values.primary_grape != null
          ? name(me.values.primary_grape) +
            (me.values.secondary_grape
              ? " / " + name(me.values.secondary_grape)
              : "")
          : null;
      const points =
        (me?.points.primary_grape ?? 0) + (me?.points.secondary_grape ?? 0);
      return { label: "Grapes", correct, guessed, points };
    }
    if (key === "vintage") {
      return {
        label: "Vintage",
        correct: vintageLabel(rev.correct),
        guessed:
          me && me.values.vintage_kind != null ? vintageLabel(me.values) : null,
        points: me?.points.vintage ?? 0,
      };
    }
    const guessedId = (me?.values[key] ?? null) as string | null;
    return {
      label: LABELS[key] ?? key,
      correct: name(rev.correct[key] as string | null),
      guessed: guessedId != null ? name(guessedId) : null,
      points: (me?.points[key] as number | null) ?? 0,
    };
  });

  const total = rows.reduce((s, r) => s + (r.points ?? 0), 0);
  const hidden = Math.max(0, rev.in_play_count - rev.reveal_step);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Revealing…</h3>
        <span className="font-heading text-sm font-semibold tabular-nums">
          {total} pts so far
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/60">
        {rows.map((r) => {
          const got = r.points > 0;
          const missed = r.guessed !== null && r.points === 0;
          return (
            <div
              key={r.label}
              className="flex items-baseline gap-2 border-t border-border/50 px-3 py-1.5 text-sm first:border-t-0"
            >
              <span className="w-24 shrink-0 text-xs text-muted-foreground">
                {r.label}
              </span>
              <span className="min-w-0 flex-1">
                {r.correct}
                {r.guessed !== r.correct ? (
                  <span className="text-muted-foreground">
                    {" · you: "}
                    {r.guessed ?? "not answered"}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 tabular-nums",
                  got
                    ? "text-[#3f5b42]"
                    : missed
                      ? "text-destructive"
                      : "text-muted-foreground",
                )}
              >
                <span aria-hidden>{got ? "✓" : missed ? "✕" : "—"}</span>
                {r.points > 0 ? `+${r.points}` : "0"}
              </span>
            </div>
          );
        })}
      </div>
      {hidden > 0 ? (
        <p className="text-xs text-muted-foreground">
          {hidden} more {hidden === 1 ? "attribute" : "attributes"} still hidden
          — revealed one at a time.
        </p>
      ) : null}
    </div>
  );
}
