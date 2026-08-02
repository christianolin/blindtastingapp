"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { CellarLotForm } from "@/app/cellar/new/cellar-lot-form";
import type { ReferenceOption } from "@/components/reference-combobox";

type RefData = {
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: ReferenceOption[];
  currency: string;
};

// The cellar "Add a wine" flow as a popup — the /cellar/new form, its reference
// data + the user's preferred currency fetched on open. On add it closes and
// refreshes so the new lot shows without a navigation.
export function CellarAddWineModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [ref, setRef] = useState<RefData | null | "loading">("loading");

  useEffect(() => {
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
      setRef({
        countries: c.data ?? [],
        regions: (r.data ?? []) as (ReferenceOption & { country_id: string })[],
        grapes: g.data ?? [],
        typeDesignations: t.data ?? [],
        currency: prof.data?.preferred_currency ?? "DKK",
      });
    })().catch(() => {
      if (!cancelled) setRef(null);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Add a wine to your cellar</DialogTitle>
        {ref === "loading" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !ref ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load the form right now.
          </p>
        ) : (
          <CellarLotForm
            countries={ref.countries}
            regions={ref.regions}
            grapes={ref.grapes}
            typeDesignations={ref.typeDesignations}
            defaultCurrency={ref.currency}
            userId={userId}
            onAdded={() => {
              onClose();
              router.refresh();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
