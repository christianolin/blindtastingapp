"use client";

import { useId, useState, type ComponentType } from "react";
import { Boxes, GraduationCap, NotebookPen, Users, Wine } from "lucide-react";
import { StatCard } from "@/app/profile/numbers/stat-card";
import { levelCardView } from "@/lib/levels/card";
import { CARD_COPY } from "@/lib/levels/copy";
import type { AchievementCategory, ProfileLevel } from "@/lib/levels/types";
import { cn } from "@/lib/utils";

const ICONS: Record<AchievementCategory, ComponentType<{ className?: string }>> = {
  cellar: Boxes,
  tastings: Wine,
  notes: NotebookPen,
  training: GraduationCap,
  friends: Users,
};

function Bar({ fraction, className }: { fraction: number; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-secondary", className)}>
      <div className="h-full rounded-full bg-gold-deep" style={{ width: `${Math.round(fraction * 1000) / 10}%` }} />
    </div>
  );
}

/**
 * /u/[id]'s "Level & achievements" card (spec §8.4, L9, L32), directly under
 * ProfileHeader. Collapsed: the level, XP in all, the bar and up to six earned
 * chips. "All achievements" opens the earned ones by category with their UTC
 * dates ("Before levels" when backfilled) and, on your own profile only, the
 * ones not yet earned with their progress. Someone else's hidden cellar
 * achievements never reach this component (RLS), so nothing hints at them.
 */
export function LevelCard({ level }: { level: ProfileLevel }) {
  const v = levelCardView(level);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <StatCard title={CARD_COPY.title}>
      {/* One row from md (L32: compact); it wraps on phones. */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-heading text-xl font-semibold">{v.heading}</span>
          <span className="text-sm text-muted-foreground tabular-nums">{v.xpLine}</span>
        </div>
        <div className="flex flex-col gap-1 md:w-56">
          <Bar fraction={v.bar.fraction} />
          <span className="text-xs text-muted-foreground tabular-nums">{v.bar.text}</span>
        </div>
        {v.empty ? (
          <p className="text-[12.5px] text-muted-foreground italic md:flex-1">{v.empty}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5 md:flex-1">
            {v.chips.map((chip) => {
              const Icon = ICONS[chip.category];
              return (
                <li
                  key={chip.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-light px-2.5 py-1 text-xs"
                >
                  <Icon className="size-3.5 text-gold-dark" />
                  {chip.name}
                </li>
              );
            })}
          </ul>
        )}
        {v.canExpand ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            className="-mx-2 inline-flex min-h-11 items-center self-start rounded-md px-2 text-sm font-medium text-primary hover:text-primary/80 dark:text-primary-ink dark:hover:text-primary-ink/80 md:self-center md:pointer-fine:min-h-8"
          >
            {open ? CARD_COPY.showFewer : CARD_COPY.showAll}
          </button>
        ) : null}
      </div>
      {open ? (
        <div id={panelId} className="flex flex-col gap-4 border-t border-border-light pt-3">
          {v.earnedGroups.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{CARD_COPY.earned}</h3>
              {v.earnedGroups.map((group) => {
                const Icon = ICONS[group.category];
                return (
                  <div key={group.category} className="flex flex-col gap-1">
                    <h4 className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon className="size-3.5" />
                      {group.label}
                    </h4>
                    <ul className="flex flex-col gap-1">
                      {group.items.map((item) => (
                        <li key={item.key} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0">
                            <span className="font-medium">{item.name}</span>
                            <span className="block text-xs text-muted-foreground">{item.description}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{item.when}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          ) : null}
          {v.notYet && v.notYet.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{CARD_COPY.notYet}</h3>
              <ul className="flex flex-col gap-2.5">
                {v.notYet.map((item) => (
                  <li key={item.key} className="flex flex-col gap-1 text-sm">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{item.name}</span>
                      <span className="shrink-0 text-xs text-gold-dark tabular-nums">{item.bonus}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                    <span className="flex items-center gap-2">
                      <Bar fraction={item.fraction} className="h-1 flex-1" />
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{item.progress}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </StatCard>
  );
}
