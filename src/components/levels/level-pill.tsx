import { pillLabel, pillText } from "@/lib/levels/copy";
import { cn } from "@/lib/utils";

/** /community's "Lv N" beside a name (spec §8.3, L31): text, not a ring. */
export function LevelPill({ level, className }: { level: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border border-gold-deep/50 px-1.5 text-[11px] font-semibold text-gold-dark tabular-nums",
        className,
      )}
    >
      <span aria-hidden="true">{pillText(level)}</span>
      <span className="sr-only">{pillLabel(level)}</span>
    </span>
  );
}
