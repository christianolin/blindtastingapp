"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { StatCard, StatFooter, StatFooterRow } from "@/app/profile/numbers/stat-card";
import { AccuracyRows } from "@/components/overview/accuracy-rows";
import { Eyebrow } from "@/components/overview/eyebrow";
import { StatTrio } from "@/components/overview/stat-trio";
import { useOwnLevel } from "@/components/levels/live-level-ring";
import {
  levelCardView,
  type CardGroup,
  type EarnedItem,
  type LevelCardView,
  type NotYetItem,
  type TrioStat,
} from "@/lib/levels/card";
import { CARD_COPY } from "@/lib/levels/copy";
import type { ProfileLevel } from "@/lib/levels/types";
import { cn } from "@/lib/utils";

/**
 * /u/[id]'s "Level & achievements" card (levels spec §8.4, L9, L32, as amended
 * by docs/superpowers/specs/2026-09-28-profile-achievements-card-design.md),
 * directly under ProfileHeader, built from the Your numbers primitives.
 * Collapsed: a StatTrio (level · XP in all · achievements), one AccuracyRows
 * level row and the Latest / Closest footer rows — one row from 1100px. The
 * header's "All achievements" text button opens the earned ones by category
 * with their UTC dates ("Before levels" when backfilled) and, on your own
 * profile only, the ones not yet earned, by category, with their progress.
 * Outline: h2 title > h3 Earned / Not yet > h4 category. On your own profile
 * (`liveUserId`) the XP is live through useOwnLevel, like the ring. Someone
 * else's hidden cellar achievements never reach this component (RLS), so
 * nothing hints at them.
 */
export function LevelCard({ level, liveUserId }: { level: ProfileLevel; liveUserId?: string }) {
  const live = useOwnLevel(liveUserId ?? "", liveUserId ? { xp: level.xp, level: level.level } : null);
  const v = levelCardView({ ...level, xp: liveUserId && live ? live.xp : level.xp });
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const panelId = useId();
  return (
    <StatCard
      title={CARD_COPY.title}
      headingId={titleId}
      action={
        v.canExpand ? <ExpandToggle open={open} controls={panelId} onToggle={() => setOpen((o) => !o)} /> : null
      }
      className="gap-[13px]"
    >
      <LevelCardSummary view={v} />
      {open ? <LevelCardDetails view={v} panelId={panelId} /> : null}
    </StatCard>
  );
}

function ExpandToggle({ open, controls, onToggle }: { open: boolean; controls: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="relative inline-flex items-center gap-1 rounded-sm text-[12.5px] leading-none font-semibold whitespace-nowrap text-primary underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-[15px] after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:pointer-fine:after:content-none"
    >
      {/* Both labels share one grid cell and the idle one is `invisible`
          (hidden from AT too), so the button is as wide open as closed: the
          title beside it wraps the same way in both states (at 320px it
          wraps to two lines either way) and the header never reflows. */}
      <span className="inline-grid justify-items-end">
        <span className={cn("[grid-area:1/1]", open && "invisible")}>{CARD_COPY.showAll}</span>
        <span className={cn("[grid-area:1/1]", !open && "invisible")}>{CARD_COPY.showFewer}</span>
      </span>
      <ChevronDown aria-hidden className={cn("size-3.5 motion-safe:transition-transform", open && "rotate-180")} />
    </button>
  );
}

/** "7/20" is aria-hidden and read as "7 of 20" (the LevelPill pattern). */
function trioStats(trio: TrioStat[]): { value: ReactNode; label: string }[] {
  return trio.map((s) => ({
    label: s.label,
    value: s.spoken ? (
      <>
        <span aria-hidden>{s.value}</span>
        <span className="sr-only">{s.spoken}</span>
      </>
    ) : (
      s.value
    ),
  }));
}

function LevelCardSummary({ view: v }: { view: LevelCardView }) {
  return (
    <div className="grid grid-cols-1 gap-[13px] md:grid-cols-2 md:items-center md:gap-x-9 min-[68.75rem]:grid-cols-3">
      <StatTrio stats={trioStats(v.trio)} />
      <AccuracyRows
        rows={[{ label: v.levelRow.label, pct: v.levelRow.fraction * 100, value: v.levelRow.value, tone: "level" }]}
        labelWidth={72}
        valueWidth="auto"
      />
      <StatFooter className="md:col-span-2 min-[68.75rem]:col-span-1 min-[68.75rem]:border-t-0 min-[68.75rem]:pt-0">
        {v.empty ? (
          <p className="text-[12.5px] text-muted-foreground italic">{v.empty}</p>
        ) : (
          <StatFooterRow label={CARD_COPY.latest} value={v.latest} />
        )}
        {v.closest ? <StatFooterRow label={CARD_COPY.closest} value={v.closest} /> : null}
      </StatFooter>
    </div>
  );
}

function GroupHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <h3 id={id} className="leading-none">
        <Eyebrow size="sm">{children}</Eyebrow>
      </h3>
      <span aria-hidden className="h-px flex-1 bg-border-light" />
    </div>
  );
}

function CategoryColumns<T extends { key: string }>({
  groups,
  renderItem,
}: {
  groups: CardGroup<T>[];
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <div className="gap-x-9 md:columns-2 min-[68.75rem]:columns-3">
      {groups.map((group) => (
        <div key={group.category} className="mb-4 break-inside-avoid last:mb-0">
          <h4 className="mb-[7px] text-[11.5px] font-semibold">{group.label}</h4>
          <ul className="flex flex-col gap-[9px] max-md:gap-2">{group.items.map(renderItem)}</ul>
        </div>
      ))}
    </div>
  );
}

function EarnedRow(item: EarnedItem) {
  return (
    <li key={item.key} className="flex flex-col gap-px">
      <StatFooterRow
        label={item.name}
        labelClassName="font-semibold text-foreground"
        value={
          <>
            <span className="sr-only">{CARD_COPY.earned}: </span>
            {item.when}
          </>
        }
        valueClassName="font-normal text-muted-foreground"
      />
      <span className="text-[11px] leading-snug text-muted-foreground">{item.description}</span>
    </li>
  );
}

function NotYetRow(item: NotYetItem) {
  return (
    <li key={item.key} className="flex flex-col gap-[3px]">
      <AccuracyRows
        rows={[{ label: item.name, pct: item.fraction * 100, value: item.progress, tone: "level" }]}
        trackHeight={6}
        labelWidth={120}
        valueWidth={52}
      />
      <span className="flex items-baseline justify-between gap-3 text-[11px] leading-snug text-muted-foreground">
        <span className="min-w-0">{item.description}</span>
        <span className="shrink-0 tabular-nums">
          <span className="sr-only">{CARD_COPY.notYet}: </span>
          {item.bonus}
        </span>
      </span>
    </li>
  );
}

/**
 * The expanded lists. Heading levels follow the card's own outline: the card
 * title is an h2 (StatCard's `headingId`), so "Earned" and "Not yet" are h3
 * and each category under them an h4. Hook-free, so a markup test renders it.
 */
export function LevelCardDetails({ view: v, panelId }: { view: LevelCardView; panelId: string }) {
  return (
    <div id={panelId} className="flex flex-col gap-[18px]">
      {v.earnedGroups.length > 0 ? (
        <section aria-labelledby={`${panelId}-earned`} className="flex flex-col gap-[11px]">
          <GroupHeading id={`${panelId}-earned`}>{CARD_COPY.earned}</GroupHeading>
          <CategoryColumns groups={v.earnedGroups} renderItem={EarnedRow} />
        </section>
      ) : null}
      {v.notYetGroups && v.notYetGroups.length > 0 ? (
        <section aria-labelledby={`${panelId}-not-yet`} className="flex flex-col gap-[11px]">
          <GroupHeading id={`${panelId}-not-yet`}>{CARD_COPY.notYet}</GroupHeading>
          <CategoryColumns groups={v.notYetGroups} renderItem={NotYetRow} />
        </section>
      ) : null}
    </div>
  );
}
