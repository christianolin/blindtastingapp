"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchCatalogWines } from "@/app/tastings/[id]/wines/new/actions";
import { useAddWine } from "@/components/add-wine-context";

type Hit = { id: string; name: string };

// "Taste & Rate" as a popup: find the wine you're drinking, then jump straight
// into its WSET note. A note needs a catalog wine, so this is a search picker;
// "add a new wine" hands off to the Add-wine popup.
export function RateWineModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { openAddWine } = useAddWine();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchCatalogWines(query);
        if (!cancelled) setHits(res);
      } finally {
        if (!cancelled) setLoading(false);
      }
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
        <Input
          autoFocus
          placeholder="Search by wine, producer or region…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="min-h-24 max-h-[50vh] overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>
          ) : hits.length > 0 ? (
            <ul className="flex flex-col">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push(`/catalog/${h.id}/notes/new`);
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
        <button
          type="button"
          onClick={() => {
            onClose();
            openAddWine("catalog");
          }}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Plus className="size-4" /> Can&apos;t find it? Add a new wine
        </button>
      </DialogContent>
    </Dialog>
  );
}
