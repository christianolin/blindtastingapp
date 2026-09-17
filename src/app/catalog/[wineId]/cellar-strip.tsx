"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMediaQuery } from "@/components/add-wine/use-camera";
import { NewNoteModal } from "@/components/new-note-modal";
import { DrinkSheet, type DrinkLot } from "@/app/cellar/drink-sheet";
import {
  stripLine,
  stripSummary,
  stripTitle,
  type OwnLot,
} from "@/lib/cellar/own-lots";

/**
 * The gold cellar strip on a wine's catalog page (CC-C2, spec §6.2 item 3):
 * "you own this" plus the two things you'd want — drink one, or open the
 * lot — the join between the shared catalog and the viewer's own bottles.
 * Renders nothing when the viewer owns none of the wine (`stripSummary`
 * returns null); the caller (`page.tsx`) also gates on `ownLots.length` so
 * the empty case never even fetches this far into render.
 */
export function CellarStrip({
  wineId,
  title,
  lots,
  community,
}: {
  wineId: string;
  title: string;
  lots: OwnLot[];
  community: { avg: number | null; count: number };
}) {
  const router = useRouter();
  const phone = useMediaQuery("(max-width: 767px)");
  const [drink, setDrink] = useState<DrinkLot | null>(null);
  const [rate, setRate] = useState<{ wineId: string; consumptionId: string } | null>(
    null,
  );

  const s = stripSummary(lots);
  if (!s) return null;
  const firstLot = lots.find((l) => l.id === s.firstLotId);

  return (
    <>
      <Card className="flex flex-col gap-3 border-gold/40 bg-gold/10 p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <div>
          <p className="font-heading text-lg font-semibold">{stripTitle(s)}</p>
          <p className="text-sm text-muted-foreground">{stripLine(s, { phone })}</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            className="min-h-11 md:pointer-fine:min-h-9"
            onClick={() => {
              if (!firstLot) return;
              setDrink({
                lotId: s.firstLotId,
                wineId,
                title,
                quantity: firstLot.quantity,
                place: s.place,
                community,
              });
            }}
          >
            Drink one
          </Button>
          <Button
            variant="outline"
            className="min-h-11 md:pointer-fine:min-h-9"
            render={<Link href={"/cellar?lot=" + s.firstLotId} />}
            nativeButton={false}
          >
            Open the lot
          </Button>
        </div>
      </Card>
      <DrinkSheet
        lot={drink}
        onClose={() => setDrink(null)}
        onDone={(r) => {
          setDrink(null);
          router.refresh();
          if (r.openNote) setRate({ wineId: r.wineId, consumptionId: r.consumptionId });
        }}
      />
      {rate ? (
        <NewNoteModal
          wineId={rate.wineId}
          consumptionId={rate.consumptionId}
          onClose={() => {
            setRate(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
