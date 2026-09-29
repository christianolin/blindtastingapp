"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { fetchArchetype } from "@/lib/wset/queries";
import { ArchetypeLinks } from "./archetype-links";
import { ArchetypeSheet, type ArchetypeView } from "./archetype-sheet";
import { useWsetLang } from "@/lib/wset/wset-lang";
import { makeT } from "@/lib/wset/i18n";

// The archetype reference sheet in a popup — opened from the map so the taster
// never leaves the place they're exploring. The map only carries the id + name,
// so the full profile is fetched on open (mirrors the grape profile modal).
// Its foot links to the training room, and — from the Library only (`mapLink`),
// never from the explorer the viewer is already on — to the wine's map place
// (training-room-map spec RM10).
export function ArchetypeModal({
  id,
  name,
  onClose,
  mapLink = false,
}: {
  id: string;
  name: string;
  onClose: () => void;
  mapLink?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { lang } = useWsetLang();
  const t = makeT(lang);
  const [view, setView] = useState<ArchetypeView | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    fetchArchetype(supabase, id)
      .then((v) => {
        if (!cancelled) setView(v ?? null);
      })
      .catch(() => {
        if (!cancelled) setView(null);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, id]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogTitle className="sr-only">{name}</DialogTitle>
        <div className="max-h-[80vh] overflow-y-auto pr-1">
          {view === "loading" ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("loading_profile")}
            </p>
          ) : view ? (
            <div className="flex flex-col gap-4">
              <ArchetypeSheet a={view} />
              <ArchetypeLinks placeKey={view.placeKey ?? null} mapLink={mapLink} />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("profile_error")}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
