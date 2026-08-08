"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { Camera } from "lucide-react";
import { NewWineForm, type WineFormInitial } from "@/app/catalog/new/new-wine-form";
import { NewNoteModal } from "@/components/new-note-modal";
import type { ReferenceOption } from "@/components/reference-combobox";

type RefData = {
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: ReferenceOption[];
};

// The catalog "Add a wine" flow as a popup — the very form /catalog/new renders,
// with its reference data fetched on open. On success it closes and jumps to the
// new wine (the form's own navigation is bypassed via onCreated).
export function CatalogAddWineModal({
  userId,
  onClose,
  initialWine,
  onScan,
}: {
  userId: string;
  onClose: () => void;
  initialWine?: WineFormInitial;
  onScan?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [ref, setRef] = useState<RefData | null | "loading">("loading");
  // Adding a wine and what happens next are separate decisions: after a
  // scanned wine is saved, a small chooser offers the follow-ups (note now,
  // view the wine, or simply done) instead of assuming one of them.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [noteWineId, setNoteWineId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, r, g, t] = await Promise.all([
        supabase.from("countries").select("id, name").order("name"),
        supabase.from("regions").select("id, name, country_id").order("name"),
        supabase.from("grapes").select("id, name").order("name"),
        supabase
          .from("type_designations")
          .select("id, name")
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      if (cancelled) return;
      setRef({
        countries: c.data ?? [],
        regions: (r.data ?? []) as (ReferenceOption & { country_id: string })[],
        grapes: g.data ?? [],
        typeDesignations: t.data ?? [],
      });
    })().catch(() => {
      if (!cancelled) setRef(null);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (noteWineId) {
    return <NewNoteModal wineId={noteWineId} onClose={onClose} />;
  }

  if (createdId) {
    return (
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Wine added</DialogTitle>
          <p className="text-sm text-muted-foreground">
            It&apos;s in the catalog. What would you like to do now?
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setNoteWineId(createdId)}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Write a tasting note
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push(`/catalog/${createdId}`);
              }}
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              View the wine page
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg max-sm:top-4 max-sm:max-h-[calc(100dvh-2rem)] max-sm:translate-y-0">
        <DialogTitle>Add a wine</DialogTitle>
        {onScan && !initialWine ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              onScan();
            }}
            className="inline-flex w-fit items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Camera className="size-4" /> Scan the label instead
          </button>
        ) : null}
        {ref === "loading" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : !ref ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load the form right now.
          </p>
        ) : (
          <NewWineForm
            countries={ref.countries}
            regions={ref.regions}
            grapes={ref.grapes}
            typeDesignations={ref.typeDesignations}
            userId={userId}
            initialWine={initialWine}
            onCreated={(id) => {
              if (initialWine) {
                // Scanned: offer the follow-ups instead of assuming one.
                setCreatedId(id);
              } else {
                onClose();
                router.push(`/catalog/${id}`);
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
