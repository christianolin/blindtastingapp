import Link from "next/link";
import { Amphora } from "lucide-react";
import { ActionButtonClient } from "@/components/overview/action-button-client";
import { DistributionBar } from "@/components/overview/distribution-bar";
import { Eyebrow } from "@/components/overview/eyebrow";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { LinkPill } from "@/components/overview/link-pill";
import { StatTrio } from "@/components/overview/stat-trio";
import { CardEmptyRow, SubjectCard } from "@/components/overview/subject-card";
import type { OverviewCellar } from "@/lib/overview-types";
import { cn } from "@/lib/utils";

// A bottle tile: 64px tall, bordered, gold border + lift on hover.
const TILE =
  "block h-16 overflow-hidden rounded-[5px] border border-border transition-[border-color,box-shadow] hover:border-gold hover:shadow-[0_6px_14px_-8px_rgba(42,33,30,.5)]";
// The dashed gold tile: "+34" when there are bottles beyond the four tiles,
// "See all" when the four tiles already are the whole cellar (never "+0"),
// or "Add your first bottle" when empty.
const DASHED_TILE =
  "flex h-16 items-center justify-center rounded-[5px] border border-dashed border-gold text-[11px] font-semibold text-primary transition-colors hover:bg-background";
// The empty "Add your first bottle" tile opens the cellar sheet instead of
// navigating, so it renders through ActionButtonClient; these trailing classes
// merge away that button's white fill, press shadow and padding so it keeps
// the dashed tile's look.
const EMPTY_TILE_LAUNCHER = cn(
  DASHED_TILE,
  "col-span-5 bg-transparent p-0 shadow-none",
);

/**
 * The Your cellar card: bottles / producers / countries, the four newest
 * bottles as tiles plus a "+N" tile into the cellar, the Countries and Wine
 * type distribution bars, three "Recently added" lines, and the outline
 * "Add a bottle" launcher. Phones get the Countries bar only, and the
 * launcher gives way to the page's tile row above the cards.
 */
export function CellarCard({ data }: { data: OverviewCellar }) {
  const empty = data.tiles.length === 0;
  return (
    <SubjectCard
      title="Your cellar"
      pill={<LinkPill href="/cellar">Open cellar</LinkPill>}
      stats={
        <StatTrio
          stats={[
            { value: data.bottles, label: "bottles" },
            { value: data.producers, label: "producers" },
            { value: data.countries, label: "countries" },
          ]}
        />
      }
      actionInset
      hideActionOnPhone
      action={
        <ActionButtonClient launch="cellar" variant="outline">
          <Amphora />
          Add a bottle
        </ActionButtonClient>
      }
    >
      {/* Desktop and tablet body. The bottom padding is the gap above the
          inset action rule SubjectCard draws. */}
      <div className="@container flex flex-1 flex-col gap-[13px] p-[14px_18px_13px] max-md:hidden">
        {/* 5-up, dropping to 4-up when the card itself is narrow (the
            README's tablet rule), measured on the card, not the viewport. */}
        <div className="grid grid-cols-5 gap-[7px] @max-[300px]:grid-cols-4">
          {empty ? (
            <ActionButtonClient
              launch="cellar"
              variant="outline"
              className={EMPTY_TILE_LAUNCHER}
            >
              Add your first bottle
            </ActionButtonClient>
          ) : (
            <>
              {data.tiles.map((tile) => (
                <Link
                  key={tile.lotId}
                  href={`/catalog/${tile.catalogWineId}`}
                  title={tile.title}
                  aria-label={tile.title}
                  className={TILE}
                >
                  <HatchThumb
                    src={tile.imageUrl}
                    width="100%"
                    height="100%"
                    className="rounded-none border-0"
                  />
                </Link>
              ))}
              <Link href="/cellar" className={DASHED_TILE}>
                {data.remainingBottles > 0 ? `+${data.remainingBottles}` : "See all"}
              </Link>
            </>
          )}
        </div>

        {!empty ? (
          <>
            <DistributionBar caption="Countries" items={data.byCountry} />
            <DistributionBar caption="Wine type" items={data.byType} />
            <div className="flex flex-col gap-[7px]">
              <Eyebrow size="sm">Recently added</Eyebrow>
              {data.recent.map((lot) => (
                <Link
                  key={lot.lotId}
                  href={`/catalog/${lot.catalogWineId}`}
                  className="flex items-baseline gap-[9px] py-[3px] text-[12.5px] text-foreground transition-colors hover:text-primary"
                >
                  <span className="min-w-0 flex-1 truncate">{lot.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {lot.location ?? "no rack"} · {lot.quantity}
                  </span>
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/* Phone body: the Countries bar alone. It is the card's last row on a
          phone (the launcher lives in the tile row above the cards), so it
          draws no rule under it and the empty state points up. */}
      <div className="md:hidden">
        {empty ? (
          <CardEmptyRow>No bottles yet — add one above.</CardEmptyRow>
        ) : (
          <div className="p-[9px_14px]">
            <DistributionBar items={data.byCountry} height={6} />
          </div>
        )}
      </div>
    </SubjectCard>
  );
}
