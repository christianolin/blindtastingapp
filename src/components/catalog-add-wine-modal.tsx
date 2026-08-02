"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { Camera } from "lucide-react";
import { NewWineForm, type WineFormInitial } from "@/app/catalog/new/new-wine-form";
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

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Add a wine</DialogTitle>
        {onScan && !initialWine ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              onScan();
            }}
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
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
              onClose();
              router.push(`/catalog/${id}`);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
