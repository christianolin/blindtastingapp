import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EyeOff, ScanEye, Target, Wine, type LucideIcon } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

// The About page: the photograph, the mission copy, the four modes, the real
// scoring table and "what Blindr keeps". Information only — the back link in
// the top bar is the single interactive element; nothing else is a link, a
// button or a clickable card.

// Pixel stops, not percentages, so the headline always sits on opaque
// parchment (a percentage veil drops it onto the label at narrow widths).
const VEIL_WIDE =
  "linear-gradient(to right, rgba(245,239,227,.97) 0, rgba(245,239,227,.94) min(600px, 62%), rgba(245,239,227,.3) 82%, rgba(245,239,227,.06) 100%)";
// Phones: the text block sits at the bottom of a 394px hero, so the veil
// rises from opaque parchment to a light ink tint the top bar reads over.
const VEIL_PHONE =
  "linear-gradient(to top, #F5EFE3 3%, rgba(245,239,227,.9) 40%, rgba(42,33,30,.3) 100%)";

type Mode = {
  icon: LucideIcon;
  title: string;
  body: string;
  border: string;
  soon?: boolean;
};

const MODES: Mode[] = [
  {
    icon: EyeOff,
    title: "Taste Blind",
    body: "Nothing is known in advance. Guess country, region, grape, vintage and producer; the host reveals field by field and the points land as they go.",
    border: "border border-gold",
  },
  {
    icon: ScanEye,
    title: "Taste Semi-Blind",
    body: "The wines are known, the order is not. Match each glass to a candidate on the list — the fastest way to learn a flight of neighbours apart.",
    border: "border border-border",
  },
  {
    icon: Wine,
    title: "Taste & Rate",
    body: "A structured WSET note for any bottle: appearance, nose, palate, conclusions — plus a score, saved to the wine and to your own history.",
    border: "border border-border",
  },
  {
    icon: Target,
    title: "Training Room",
    body: "Drill regions, grapes and appellations on your own, between tastings. In development.",
    border: "border border-dashed border-border",
    soon: true,
  },
];

const SCORED_FIELDS = [
  "Country",
  "Region",
  "Appellation",
  "Grape",
  "Vintage",
  "Producer",
];

// The VM/DM (Danish Championship) point values `reveal_wine` awards — the
// single source of truth for scoring lives in that RPC; this table describes
// it. Country 2 + region 3 + appellation 5 + primary grape 8 + secondary
// grape 2 + producer 6 + type designation 2 + vintage 2 = 30.
const SCORING: { field: string; points: string; note?: string }[] = [
  { field: "Country", points: "2" },
  { field: "Region", points: "3" },
  { field: "Appellation", points: "5", note: "only if the wine has one" },
  { field: "Primary grape", points: "8" },
  { field: "Secondary grape", points: "2", note: "only for a recorded blend" },
  { field: "Producer", points: "6" },
  { field: "Type designation", points: "2", note: "only if the wine has one" },
  {
    field: "Vintage",
    points: "2 / 1 / 0",
    note: "exact year / off by one year / otherwise — NV and tawny score on an exact match only",
  },
];

export default async function AboutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="relative flex grow flex-col">
      {/* The thin top bar. On md+ it is a strip above the hero (sticky, so it
          stays put while the column scrolls); on phones it sits over the top
          of the photo in parchment text, with only the arrow showing. */}
      <div className="flex items-center gap-3 border-b border-border bg-background/90 px-[30px] py-[13px] backdrop-blur max-md:absolute max-md:inset-x-0 max-md:top-0 max-md:z-10 max-md:gap-2.5 max-md:border-0 max-md:bg-transparent max-md:px-4 max-md:py-2 max-md:backdrop-blur-none md:sticky md:top-0 md:z-10">
        <Link
          href="/overview"
          className="flex items-center gap-[7px] text-[13px] font-semibold text-primary hover:text-gold-deep max-md:min-h-11 max-md:text-primary-foreground max-md:hover:text-primary-foreground"
        >
          <span className="max-md:text-[19px] max-md:leading-none" aria-hidden>
            ←
          </span>
          <span className="max-md:sr-only">Back to Overview</span>
        </Link>
        <Eyebrow
          size="md"
          className="ml-auto max-md:ml-0 max-md:text-primary-foreground"
        >
          About Blindr
        </Eyebrow>
      </div>

      {/* 1. Hero */}
      <section
        aria-labelledby="about-hero-heading"
        className="relative shrink-0 overflow-hidden bg-muted max-md:h-[394px]"
      >
        <Image
          src="/hero/romanee.webp"
          alt="A bottle of Romanée-Conti 1945"
          fill
          preload
          sizes="(min-width: 1280px) calc(100vw - 240px), (min-width: 768px) calc(100vw - 60px), 100vw"
          className="object-cover object-[center_72%] [filter:sepia(.24)_saturate(.9)]"
        />
        <div
          className="absolute inset-0 max-md:hidden"
          style={{ background: VEIL_WIDE }}
          aria-hidden
        />
        <div
          className="absolute inset-0 md:hidden"
          style={{ background: VEIL_PHONE }}
          aria-hidden
        />
        <div className="relative flex max-w-[620px] shrink-0 flex-col gap-[18px] p-[52px_30px_56px] max-md:absolute max-md:inset-x-4 max-md:bottom-4 max-md:max-w-none max-md:gap-2.5 max-md:p-0">
          <h1
            id="about-hero-heading"
            className="max-w-[12ch] font-heading text-[36px] leading-[1.02] font-semibold tracking-[-.02em] md:max-w-[15ch] md:text-[40px] md:leading-none md:tracking-[-.025em] xl:text-[56px]"
          >
            Understand what&apos;s in the glass.
          </h1>
          <p className="max-w-[46ch] text-[16px] leading-[1.6] text-ink-photo max-md:text-[13.5px] max-md:leading-[1.55]">
            Taste with structure, challenge yourself blind, and learn more from
            every bottle.
          </p>
          <span className="mt-1.5 text-[12px] text-ink-caption max-md:mt-0 max-md:text-[11.5px]">
            Pictured: Romanée-Conti 1945
          </span>
        </div>
      </section>

      {/* 2. More than a score */}
      <section
        aria-labelledby="about-mission-heading"
        className="flex flex-wrap gap-10 border-b border-border p-[40px_30px] max-md:gap-[11px] max-md:p-[20px_16px]"
      >
        <h2
          id="about-mission-heading"
          className="w-[260px] shrink-0 font-heading text-[34px] leading-[1.05] font-semibold max-md:w-full max-md:text-[26px] max-md:leading-[1.06] md:max-xl:w-full"
        >
          More than a score
        </h2>
        <p className="min-w-0 max-w-[48ch] flex-[1_1_340px] text-[14.5px] leading-[1.75] text-ink-photo max-[820px]:basis-full max-md:text-[13.5px] max-md:leading-[1.7] md:max-xl:max-w-none">
          We believe wine deserves more than a quick score. By giving people a
          structured way to observe, describe, compare and learn, Blindr helps
          curious drinkers develop their palate.
        </p>
        <p className="min-w-0 max-w-[48ch] flex-[1_1_340px] text-[14.5px] leading-[1.75] font-medium text-foreground max-[820px]:basis-full max-md:text-[13.5px] max-md:leading-[1.7] md:max-xl:max-w-none">
          Built for enthusiasts, committed beginners, blind tasters, collectors
          and professionals who want to learn more from every bottle.
        </p>
      </section>

      {/* 3. Four ways to taste */}
      <section
        aria-labelledby="about-modes-heading"
        className="flex flex-col gap-[18px] border-b border-border bg-card p-[36px_30px] max-md:gap-3 max-md:p-[18px_16px]"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2
            id="about-modes-heading"
            className="font-heading text-[28px] leading-none font-semibold max-md:text-[23px]"
          >
            Four ways to taste
          </h2>
          <span className="text-[13px] text-muted-foreground">
            Alone or around a table, on a phone or on a laptop.
          </span>
        </div>
        <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2 xl:grid-cols-4 max-md:gap-3">
          {MODES.map((mode) => (
            <ModeBlock key={mode.title} mode={mode} />
          ))}
        </div>
      </section>

      {/* 4. How a blind tasting is scored */}
      <section
        aria-labelledby="about-scoring-heading"
        className="flex flex-wrap gap-10 border-b border-border p-[38px_30px] max-md:gap-5 max-md:p-[20px_16px]"
      >
        <div className="flex w-[260px] shrink-0 flex-col gap-2.5 max-md:w-full">
          <h2
            id="about-scoring-heading"
            className="font-heading text-[28px] leading-[1.08] font-semibold max-md:text-[23px]"
          >
            How a blind tasting is scored
          </h2>
          <p className="text-[13px] leading-[1.6] text-muted-foreground">
            Points are awarded per field as the host reveals, following the
            rule set chosen for the tasting.
          </p>
        </div>
        <div className="flex min-w-[280px] flex-1 flex-col gap-[14px] max-md:min-w-0">
          <ul className="flex flex-wrap gap-2" aria-label="Scored fields">
            {SCORED_FIELDS.map((field) => (
              <li
                key={field}
                className="rounded-full border border-border bg-card px-[15px] py-2 text-[13px] font-semibold"
              >
                {field}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1.5">
            <Eyebrow size="md">Danish Championship scoring</Eyebrow>
            <dl className="flex flex-col">
              {SCORING.map((row) => (
                <ScoreRow key={row.field} {...row} />
              ))}
            </dl>
          </div>
          <p className="text-[13px] leading-[1.6] text-muted-foreground">
            A wine with every category in play is worth up to 30 points.
            Semi-blind tastings score 1 point per glass matched to the right
            wine.
          </p>
          <p className="max-w-[62ch] text-[13.5px] leading-[1.7] text-ink-photo">
            Every guess you commit is locked before the reveal, so the
            leaderboard is honest. Your hit rate per field is kept across every
            tasting you play — that is the number that shows whether your
            palate is actually improving, not the points from any single night.
          </p>
        </div>
      </section>

      {/* 5. What Blindr keeps — flex-1 so it fills a short viewport */}
      <section
        aria-labelledby="about-keeps-heading"
        className="flex flex-1 flex-wrap content-start gap-10 bg-card p-[34px_30px_40px] max-md:gap-3 max-md:p-[20px_16px_28px]"
      >
        <h2
          id="about-keeps-heading"
          className="w-[260px] shrink-0 font-heading text-[28px] leading-[1.08] font-semibold max-md:w-full max-md:text-[23px]"
        >
          What Blindr keeps
        </h2>
        <p className="min-w-[300px] max-w-[62ch] flex-1 text-[14px] leading-[1.75] text-ink-photo max-md:min-w-0 max-md:text-[13.5px]">
          Every note you write, every guess you commit and every bottle you log
          stays with your account: the wine gets its entry in the shared
          catalog, and your own history keeps the score, the tasting it came
          from and the date you drank it.
        </p>
      </section>
    </main>
  );
}

// One of the four non-interactive mode blocks.
function ModeBlock({ mode }: { mode: Mode }) {
  const Icon = mode.icon;
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl bg-background p-5 max-md:gap-2 max-md:p-[15px]",
        mode.border,
      )}
    >
      <Icon
        size={22}
        strokeWidth={1.75}
        className={mode.soon ? "text-muted-foreground" : "text-primary"}
        aria-hidden
      />
      <h3 className="flex items-center gap-2 font-heading text-[22px] leading-[1.1] font-semibold max-md:text-[20px]">
        {mode.title}
        {mode.soon ? (
          <span className="rounded-full border border-gold px-[7px] py-[2px] font-mono text-[10px] tracking-[.1em] text-gold-dark">
            SOON
          </span>
        ) : null}
      </h3>
      <p className="text-[13px] leading-[1.55] text-ink-photo max-md:text-[12.5px]">
        {mode.body}
      </p>
    </div>
  );
}

// One row of the scoring table: field (with an optional condition under it)
// on the left, points on the right.
function ScoreRow({
  field,
  points,
  note,
}: {
  field: string;
  points: string;
  note?: string;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-border-light py-2 text-[13px]">
      <dt className="font-medium">
        {field}
        {note ? (
          <span className="block text-[12px] font-normal text-muted-foreground">
            {note}
          </span>
        ) : null}
      </dt>
      <dd className="shrink-0 text-right font-semibold tabular-nums">
        {points}
      </dd>
    </div>
  );
}
