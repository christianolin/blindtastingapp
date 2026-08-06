"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient, currentUserId } from "@/lib/supabase/client";
import { WineForm } from "./wines/new/wine-form";
import type { ReferenceOption } from "@/components/reference-combobox";
import type { TypeDesignationOption } from "@/components/type-designation-field";

type RefData = {
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: TypeDesignationOption[];
};

// Add a wine to this tasting as a popup — reuses the real wine form (which
// redirects back to the tasting on submit, closing the modal). Reference data
// is fetched on open.
export function TastingAddWineModal({
  tastingId,
  label,
  autoScan,
  onClose,
}: {
  tastingId: string;
  label: string;
  autoScan?: boolean;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [ref, setRef] = useState<RefData | null | "loading">("loading");
  const [userId, setUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, r, g, t, me] = await Promise.all([
        supabase.from("countries").select("id, name").order("name"),
        supabase.from("regions").select("id, name, country_id").order("name"),
        supabase.from("grapes").select("id, name").order("name"),
        supabase
          .from("type_designations")
          .select("id, name, category, country_id")
          .eq("is_active", true)
          .order("sort_order"),
        // Identity now comes from our own session, not GoTrue. The same
        // endpoint mints the token the queries above authenticate with, so
        // this costs nothing extra.
        currentUserId(),
      ]);
      if (cancelled) return;
      setUserId(me ?? undefined);
      setRef({
        countries: c.data ?? [],
        regions: (r.data ?? []) as (ReferenceOption & { country_id: string })[],
        grapes: g.data ?? [],
        typeDesignations: (t.data ?? []) as TypeDesignationOption[],
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg max-sm:top-4 max-sm:max-h-[calc(100dvh-2rem)] max-sm:translate-y-0">
        <DialogTitle>{label}</DialogTitle>
        {ref === "loading" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !ref ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load the form right now.
          </p>
        ) : (
          <WineForm
            tastingId={tastingId}
            userId={userId}
            countries={ref.countries}
            regions={ref.regions}
            grapes={ref.grapes}
            typeDesignations={ref.typeDesignations}
            autoScan={autoScan}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
