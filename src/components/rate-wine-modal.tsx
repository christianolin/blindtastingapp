"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Camera, Plus, Warehouse } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchCatalogWines } from "@/app/tastings/[id]/wines/new/actions";
import { listMyCellarLots, type CellarLotOption } from "@/app/cellar/new/actions";
import { CellarLotPicker } from "@/components/cellar-lot-picker";
import { useAddWine } from "@/components/add-wine-context";

type Hit = { id: string; name: string };

// "Taste & Rate" as a popup: find the wine you're drinking, then jump straight
// into its WSET note. A note needs a catalog wine, so this is a search picker;
// "add a new wine" hands off to the Add-wine popup.
export function RateWineModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  // When provided, the launcher opens the note as a popup for this wine instead
  // of the modal navigating to the note page.
  onPick?: (pick: { catalogWineId: string; lotId?: string; consume?: boolean }) => void;
}) {
  const router = useRouter();
  const { openAddWine, openScan } = useAddWine();
  const [q, setQ] = useState("");
  // Results are stored WITH the query that produced them, so "nothing found
  // yet for what is currently typed" is derived rather than written. The effect
  // then never clears state synchronously on its way out — which is what the
  // compiler flagged, and what cost an extra render on every keystroke.
  const [result, setResult] = useState<{ query: string; hits: Hit[] }>({
    query: "",
    hits: [],
  });
  const [cellarOpen, setCellarOpen] = useState(false);
  const [cellarLots, setCellarLots] = useState<CellarLotOption[] | null>(null);
  const [consume, setConsume] = useState(false);

  const trimmed = q.trim();
  // Under 2 characters nothing is searched, so nothing is shown.
  const hits = trimmed.length >= 2 ? result.hits : [];
  // Still loading while the stored results belong to an older query.
  const loading = trimmed.length >= 2 && result.query !== trimmed;

  useEffect(() => {
    if (cellarOpen && cellarLots === null) listMyCellarLots().then(setCellarLots);
  }, [cellarOpen, cellarLots]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await searchCatalogWines(query);
      if (!cancelled) setResult({ query, hits: res });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* On phones the keyboard covers a vertically-centred dialog, cropping
          the search field and results. Anchor near the top ONLY below sm
          (max-sm:) so the desktop popup is byte-for-byte unchanged — centred. */}
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg max-sm:top-4 max-sm:max-h-[calc(100dvh-2rem)] max-sm:translate-y-0">
        <DialogTitle>Taste &amp; rate a wine</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Find the wine you&apos;re tasting to write a WSET note.
        </p>
        {/* All three ways in to a wine sit together above the search field: on a
            phone the keyboard covers the lower half of the dialog, so nothing
            actionable may live below it. */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              openScan();
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Camera className="size-4" /> Scan a label
          </button>
          <button
            type="button"
            onClick={() => setCellarOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Warehouse className="size-4" />{" "}
            {cellarOpen ? "Hide my cellar" : "From my cellar"}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              openAddWine("catalog");
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Plus className="size-4" /> Add manually
          </button>
        </div>
        <Input
          autoFocus
          placeholder="Search by wine, producer or region…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="min-h-24 max-h-[50vh] overflow-y-auto">
          {cellarOpen ? (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={consume}
                  onChange={(e) => setConsume(e.target.checked)}
                />
                Remove a bottle from my cellar
              </label>
              <CellarLotPicker
                lots={cellarLots}
                onPick={(l) =>
                  onPick?.({
                    catalogWineId: l.catalogWineId,
                    lotId: l.lotId,
                    consume,
                  })
                }
              />
            </div>
          ) : loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>
          ) : hits.length > 0 ? (
            <ul className="flex flex-col">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      // Hand the pick back so the launcher can open the note as
                      // a popup; fall back to the note page if used standalone.
                      if (onPick) onPick({ catalogWineId: h.id });
                      else {
                        onClose();
                        router.push(`/catalog/${h.id}/notes/new`);
                      }
                    }}
                    className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    {h.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : q.trim().length >= 2 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No matches.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
