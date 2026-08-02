"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { listAppellationsForRegions } from "@/lib/reference-search";
import { NewWineForm, type WineFormInitial } from "@/app/catalog/new/new-wine-form";
import type { ReferenceOption } from "@/components/reference-combobox";

type RefData = {
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: ReferenceOption[];
  initial: WineFormInitial;
};

// The catalog edit flow as a popup (curators / the creator). Loads reference
// data + the wine's current values on open, then reuses the shared wine form in
// edit mode. On save it closes and refreshes the hub so edits show at once.
export function EditWineModal({
  wineId,
  userId,
  onClose,
}: {
  wineId: string;
  userId: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [data, setData] = useState<RefData | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, r, g, t, wineRes, blendRes] = await Promise.all([
        supabase.from("countries").select("id, name").order("name"),
        supabase.from("regions").select("id, name, country_id").order("name"),
        supabase.from("grapes").select("id, name").order("name"),
        supabase
          .from("type_designations")
          .select("id, name")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("catalog_wines")
          .select(
            "country_id, region_id, appellation_id, producer_id, type_designation_id, colour, style, wine_name, description, vintage_kind, vintage_year, vintage_tawny_years, image_url",
          )
          .eq("id", wineId)
          .maybeSingle(),
        supabase
          .from("catalog_wine_grapes")
          .select("grape_id, percentage, sort_order")
          .eq("catalog_wine_id", wineId)
          .order("sort_order"),
      ]);
      if (cancelled) return;
      const w = wineRes.data;
      if (!w) {
        setData(null);
        return;
      }
      let producerLabel: string | null = null;
      if (w.producer_id) {
        const { data: prod } = await supabase
          .from("producers")
          .select("name")
          .eq("id", w.producer_id)
          .maybeSingle();
        producerLabel = prod?.name ?? null;
      }
      const appellations = w.region_id
        ? await listAppellationsForRegions([w.region_id])
        : [];
      if (cancelled) return;
      const blend = (blendRes.data ?? []).map((row) => ({
        grapeId: row.grape_id,
        percentage: row.percentage == null ? "" : String(row.percentage),
      }));
      setData({
        countries: c.data ?? [],
        regions: (r.data ?? []) as (ReferenceOption & { country_id: string })[],
        grapes: g.data ?? [],
        typeDesignations: t.data ?? [],
        initial: {
          countryId: w.country_id ?? "",
          regionId: w.region_id ?? "",
          appellationId: w.appellation_id ?? "",
          blend: blend.length > 0 ? blend : [{ grapeId: "", percentage: "" }],
          producerId: w.producer_id ?? "",
          producerLabel,
          typeDesignationId: w.type_designation_id ?? "",
          colour: w.colour as WineFormInitial["colour"],
          style: w.style as WineFormInitial["style"],
          wineName: w.wine_name ?? "",
          description: w.description ?? null,
          vintageKind: (w.vintage_kind ?? "YEAR") as "YEAR" | "NV" | "TAWNY",
          vintageYear: w.vintage_year == null ? "" : String(w.vintage_year),
          tawnyYears: w.vintage_tawny_years == null ? "" : String(w.vintage_tawny_years),
          imageUrl: w.image_url ?? null,
          appellations,
        },
      });
    })().catch(() => {
      if (!cancelled) setData(null);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, wineId]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Edit wine</DialogTitle>
        {data === "loading" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !data ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load this wine right now.
          </p>
        ) : (
          <NewWineForm
            countries={data.countries}
            regions={data.regions}
            grapes={data.grapes}
            typeDesignations={data.typeDesignations}
            userId={userId}
            wineId={wineId}
            initialWine={data.initial}
            onSaved={() => {
              onClose();
              router.refresh();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
