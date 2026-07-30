"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { fetchArchetype } from "@/lib/wset/queries";
import { ArchetypeSheet, type ArchetypeView } from "./archetype-sheet";

// The archetype reference sheet in a popup — opened from the map so the taster
// never leaves the place they're exploring. The map only carries the id + name,
// so the full profile is fetched on open (mirrors the grape profile modal).
export function ArchetypeModal({
  id,
  name,
  onClose,
}: {
  id: string;
  name: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
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
              Loading profile…
            </p>
          ) : view ? (
            <ArchetypeSheet a={view} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Couldn&apos;t load this profile right now.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
