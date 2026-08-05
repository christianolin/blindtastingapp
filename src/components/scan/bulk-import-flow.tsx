"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Warehouse } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { CellarLotForm } from "@/app/cellar/new/cellar-lot-form";
import type { ReferenceOption } from "@/components/reference-combobox";
import { BulkScanModal, type BulkScan } from "./bulk-scan-modal";

type RefData = {
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: ReferenceOption[];
  currency: string;
};

type LotDefaults = {
  bottleSizeMl: number;
  pricePerBottle: string;
  currency: string;
  purchasedOn: string;
  purchaseSource: string;
  storageLocation: string;
  drinkFrom: string;
  drinkTo: string;
};

const SIZES = [375, 750, 1500, 3000];
const SIZE_LABELS: Record<number, string> = {
  375: "375 ml",
  750: "750 ml",
  1500: "1.5 L",
  3000: "3 L",
};

// Bulk cellar import: scan a stack of labels, set one set of lot details for
// the batch, then confirm each wine in turn. Saves are per wine (nothing is
// transactional across the batch), so closing part-way keeps what's done.
export function BulkImportFlow({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<"scanning" | "defaults" | "queue" | "done">(
    "scanning",
  );
  const [scans, setScans] = useState<BulkScan[]>([]);
  const [index, setIndex] = useState(0);
  const [added, setAdded] = useState(0);
  const [ref, setRef] = useState<RefData | null | "loading">("loading");
  const [lot, setLot] = useState<LotDefaults>({
    bottleSizeMl: 750,
    pricePerBottle: "",
    currency: "",
    purchasedOn: "",
    purchaseSource: "",
    storageLocation: "",
    drinkFrom: "",
    drinkTo: "",
  });

  const supabase = useMemo(() => createClient(), []);

  // Reference data is only needed once the scanning stage is over.
  useEffect(() => {
    if (stage === "scanning" || ref !== "loading") return;
    let cancelled = false;
    (async () => {
      const [c, r, g, t, prof] = await Promise.all([
        supabase.from("countries").select("id, name").order("name"),
        supabase.from("regions").select("id, name, country_id").order("name"),
        supabase.from("grapes").select("id, name").order("name"),
        supabase
          .from("type_designations")
          .select("id, name")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("profiles")
          .select("preferred_currency")
          .eq("id", userId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const currency = prof.data?.preferred_currency ?? "DKK";
      setRef({
        countries: c.data ?? [],
        regions: (r.data ?? []) as (ReferenceOption & { country_id: string })[],
        grapes: g.data ?? [],
        typeDesignations: t.data ?? [],
        currency,
      });
      setLot((l) => (l.currency ? l : { ...l, currency }));
    })().catch(() => {
      if (!cancelled) setRef(null);
    });
    return () => {
      cancelled = true;
    };
  }, [stage, ref, supabase, userId]);

  function finishOne() {
    if (index + 1 >= scans.length) setStage("done");
    else setIndex((i) => i + 1);
  }

  if (stage === "scanning") {
    return (
      <BulkScanModal
        userId={userId}
        onClose={onClose}
        onConfirm={(ready) => {
          setScans(ready);
          setStage("defaults");
        }}
      />
    );
  }

  const close = () => {
    onClose();
    router.refresh();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg max-sm:top-4 max-sm:max-h-[calc(100dvh-2rem)] max-sm:translate-y-0">
        {stage === "defaults" ? (
          <>
            <DialogTitle>Details for all {scans.length} wines</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Everything here is optional and applies to every bottle in this
              batch — you can still change it per wine on the next step. Each
              scan is counted as one bottle.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="bulk_size">Format</Label>
                <select
                  id="bulk_size"
                  value={lot.bottleSizeMl}
                  onChange={(e) =>
                    setLot({ ...lot, bottleSizeMl: Number(e.target.value) })
                  }
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                >
                  {SIZES.map((s) => (
                    <option key={s} value={s}>
                      {SIZE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bulk_storage">Storage location</Label>
                <Input
                  id="bulk_storage"
                  value={lot.storageLocation}
                  onChange={(e) =>
                    setLot({ ...lot, storageLocation: e.target.value })
                  }
                  placeholder="e.g. Rack 3"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bulk_price">Price / bottle</Label>
                <Input
                  id="bulk_price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={lot.pricePerBottle}
                  onChange={(e) =>
                    setLot({ ...lot, pricePerBottle: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bulk_currency">Currency</Label>
                <Input
                  id="bulk_currency"
                  value={lot.currency}
                  onChange={(e) =>
                    setLot({ ...lot, currency: e.target.value.toUpperCase() })
                  }
                  maxLength={3}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bulk_purchased">Purchased</Label>
                <Input
                  id="bulk_purchased"
                  type="date"
                  className="appearance-none"
                  value={lot.purchasedOn}
                  onChange={(e) =>
                    setLot({ ...lot, purchasedOn: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bulk_source">Source</Label>
                <Input
                  id="bulk_source"
                  value={lot.purchaseSource}
                  onChange={(e) =>
                    setLot({ ...lot, purchaseSource: e.target.value })
                  }
                  placeholder="Merchant"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bulk_from">Drink from</Label>
                <Input
                  id="bulk_from"
                  type="number"
                  min={1900}
                  max={2100}
                  value={lot.drinkFrom}
                  onChange={(e) => setLot({ ...lot, drinkFrom: e.target.value })}
                  placeholder="e.g. 2026"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bulk_to">Drink to</Label>
                <Input
                  id="bulk_to"
                  type="number"
                  min={1900}
                  max={2100}
                  value={lot.drinkTo}
                  onChange={(e) => setLot({ ...lot, drinkTo: e.target.value })}
                  placeholder="e.g. 2035"
                />
              </div>
            </div>
            <Button type="button" onClick={() => setStage("queue")}>
              Review {scans.length} {scans.length === 1 ? "wine" : "wines"}
            </Button>
          </>
        ) : stage === "done" ? (
          <>
            <DialogTitle>Batch finished</DialogTitle>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-6" />
              </span>
              <p className="font-heading text-xl font-medium">
                Added {added} {added === 1 ? "wine" : "wines"} to your cellar
              </p>
              {added < scans.length ? (
                <p className="text-sm text-muted-foreground">
                  {scans.length - added} skipped.
                </p>
              ) : null}
            </div>
            <Button type="button" onClick={close}>
              <Warehouse /> Done
            </Button>
          </>
        ) : (
          <>
            <DialogTitle>
              Wine {index + 1} of {scans.length}
            </DialogTitle>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${(index / scans.length) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                {added} added
              </span>
              <button
                type="button"
                onClick={finishOne}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Skip this wine
              </button>
            </div>
            {ref === "loading" ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Loading…
              </p>
            ) : !ref ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Couldn&apos;t load the form right now.
              </p>
            ) : (
              <CellarLotForm
                // Remount per wine so the form re-initialises from the next
                // scan's prefill instead of keeping the previous one's state.
                key={scans[index]?.id}
                countries={ref.countries}
                regions={ref.regions}
                grapes={ref.grapes}
                typeDesignations={ref.typeDesignations}
                defaultCurrency={ref.currency}
                userId={userId}
                initialCatalogWineId={scans[index]?.match?.id}
                initialCatalogWineLabel={scans[index]?.match?.label}
                initialWine={scans[index]?.prefill}
                initialLot={lot}
                onAdded={() => {
                  setAdded((n) => n + 1);
                  finishOne();
                }}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
