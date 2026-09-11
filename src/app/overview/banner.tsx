import Link from "next/link";
import { Wine } from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import { ActionButton } from "@/components/overview/action-button";
import { Eyebrow } from "@/components/overview/eyebrow";
import { LiveDot } from "@/components/overview/live-dot";
import { ordinal } from "@/lib/stats-math";
import { cn } from "@/lib/utils";
import type {
  LiveBanner,
  NextUpBanner,
  OverviewBanner as BannerData,
} from "@/lib/overview-types";
import { StartTastingRow } from "./start-tasting-row";

// The banner slot above the three cards. Live tasting → the bordeaux banner;
// otherwise the parchment "Next up" variant; nothing scheduled → the single
// "Start a tasting" row. Never an empty bordeaux block.
export function OverviewBanner({ banner }: { banner: BannerData }) {
  if (banner.kind === "live") return <LiveBannerView banner={banner} />;
  if (banner.kind === "next") return <NextUpBannerView banner={banner} />;
  return <StartTastingRow />;
}

// The shared outer shape of the live and next-up variants: a padded rounded
// surface whose text block wraps its right-hand content below the title on
// narrow tablets, and which stacks fully on phones.
const SURFACE =
  "flex flex-wrap items-center gap-6 rounded-[13px] p-[18px_22px] max-md:shrink-0 max-md:flex-col max-md:items-stretch max-md:gap-2 max-md:rounded-xl max-md:p-[11px_14px]";
const TEXT_BLOCK =
  "flex min-w-[280px] flex-1 flex-col gap-1.5 max-md:min-w-0 max-md:gap-2";

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function standingText(standing: NonNullable<LiveBanner["standing"]>) {
  const place = `${ordinal(standing.rank)} of ${standing.competitors}`;
  return standing.matchedOf !== undefined
    ? `you are ${place} on ${standing.points}/${standing.matchedOf}`
    : `you are ${place} on ${standing.points} pts`;
}

// "Wine 3 of 6 · appellation revealed · you are 2nd of 7 on 14 pts"; a Taste
// & Rate (OPEN) tasting has no reveal stage and no standings to report.
function liveMeta(b: LiveBanner): string {
  if (b.revealMode === "OPEN") {
    return `${plural(b.wineCount, "wine")} · ${plural(b.peopleCount, "person", "people")} · Taste & Rate`;
  }
  const parts = [`Wine ${b.wineIndex} of ${b.wineCount}`];
  if (b.stage) parts.push(b.stage);
  if (b.standing) parts.push(standingText(b.standing));
  return parts.join(" · ");
}

function LiveBannerView({ banner }: { banner: LiveBanner }) {
  const host = banner.hosting ? "you are hosting" : `hosted by ${banner.hostName}`;
  // The phone eyebrow folds the standing in ("Live now · hosting · 2nd of 7")
  // because the meta line is dropped there.
  const phoneEyebrow = [
    "Live now",
    banner.hosting ? "hosting" : `hosted by ${banner.hostName}`,
    banner.standing
      ? `${ordinal(banner.standing.rank)} of ${banner.standing.competitors}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/tastings/${banner.tastingId}`}
      className={cn(
        SURFACE,
        "bg-primary text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-shadow hover:shadow-[0_8px_20px_-8px_rgba(42,33,30,.5)]",
      )}
    >
      <div className={TEXT_BLOCK}>
        <Eyebrow
          size="md"
          className="flex items-center gap-2 tracking-[.15em] text-gold-light max-md:gap-[7px]"
        >
          <LiveDot />
          <span className="min-w-0 truncate max-md:hidden">Live now · {host}</span>
          <span className="min-w-0 truncate md:hidden">{phoneEyebrow}</span>
        </Eyebrow>
        <span className="font-heading text-[31px] leading-[1.05] font-semibold max-xl:text-[27px] max-md:text-[24px] max-md:leading-[1.04]">
          {banner.name}
        </span>
        <span className="text-[13px] text-primary-foreground/78 max-md:hidden">
          {liveMeta(banner)}
        </span>
      </div>
      <span className="flex items-center gap-[9px] rounded-[9px] bg-gold px-[22px] py-[13px] text-[14.5px] font-bold text-foreground max-md:min-h-11 max-md:justify-center max-md:gap-2 max-md:p-3">
        <Wine className="size-4 shrink-0" aria-hidden />
        Back to the table
      </span>
    </Link>
  );
}

function NextUpBannerView({ banner }: { banner: NextUpBanner }) {
  const href = `/tastings/${banner.tastingId}`;
  return (
    <section
      aria-label="Next up"
      className={cn(
        SURFACE,
        "border border-border-strong bg-card text-foreground max-md:gap-3",
      )}
    >
      <div className={TEXT_BLOCK}>
        <Eyebrow size="md" className="truncate tracking-[.15em]">
          Next up
          {banner.scheduledAt ? (
            <>
              {" · "}
              <LocalDateTime iso={banner.scheduledAt} />
            </>
          ) : null}
          {/* The host clause is dropped on phones: date + host overrun one
              eyebrow line at 390px, and the title carries the tasting. */}
          <span className="max-md:hidden">
            {" · "}
            {banner.hosting ? "you are hosting" : `hosted by ${banner.hostName}`}
          </span>
        </Eyebrow>
        <span className="font-heading text-[44px] leading-[1.02] font-semibold max-xl:text-[36px] max-md:text-[24px] max-md:leading-[1.04]">
          {banner.name}
        </span>
      </div>

      {/* The flight: one numbered line per slot, gaps reading "Empty". Hidden
          on phones, where the banner must stay short. */}
      {banner.slots.length > 0 ? (
        <ol className="grid grid-cols-2 gap-x-7 gap-y-[3px] text-[12.5px] max-md:hidden">
          {banner.slots.map((slot, i) => (
            <li key={`${slot.label}-${i}`} className="flex items-baseline gap-2.5">
              <span className="w-4 shrink-0 text-right font-mono text-[10.5px] text-placeholder tabular-nums">
                {i + 1}
              </span>
              {slot.filled ? (
                <span className="truncate">
                  <span className="font-semibold">{slot.label}</span>
                  {slot.note ? (
                    <span className="text-muted-foreground"> · {slot.note}</span>
                  ) : null}
                </span>
              ) : (
                <span className="text-muted-foreground italic">{slot.label}</span>
              )}
            </li>
          ))}
        </ol>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5 max-md:w-full">
        <ActionButton
          href={href}
          variant="primary"
          className="w-auto px-[22px] whitespace-nowrap max-md:flex-1 max-md:px-3"
        >
          Open the tasting
        </ActionButton>
        {banner.canAddWine ? (
          <ActionButton
            href={`${href}/wines/new`}
            variant="outline"
            className="w-auto px-[22px] whitespace-nowrap max-md:flex-1 max-md:px-3"
          >
            Add wine {banner.nextWinePosition}
          </ActionButton>
        ) : null}
      </div>
    </section>
  );
}
