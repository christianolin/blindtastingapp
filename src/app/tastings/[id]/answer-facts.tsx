import type { ReactNode } from "react";

export type AnswerFact = { label: string; value: ReactNode };

// A revealed wine's answer as labelled columns rather than one long
// dash-separated sentence — the reveal is the payoff of a blind tasting, so
// each attribute should be scannable on its own. Callers resolve the display
// names (and drop the fields that don't apply) before passing them in.
export function AnswerFacts({ facts }: { facts: AnswerFact[] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      {facts.map((f) => (
        <div key={f.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            {f.label}
          </dt>
          <dd className="text-sm font-medium leading-snug break-words">
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
