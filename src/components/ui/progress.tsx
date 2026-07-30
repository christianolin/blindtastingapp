import { cn } from "@/lib/utils";

// Static horizontal bar (reveal %, drink readiness, spend, guess-rate). Inline
// element so it can sit in a flex row next to a label + value.
export function Progress({
  value,
  max = 100,
  className,
  barClassName,
}: {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span
      data-slot="progress"
      className={cn("block h-2 overflow-hidden rounded-full bg-muted", className)}
    >
      <span
        className={cn("block h-full rounded-full bg-primary", barClassName)}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
