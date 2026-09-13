"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { getTastingSettings, type TastingSettings } from "./settings-actions";
import { TastingSettingsSheet } from "./tasting-settings-sheet";

type Loaded = TastingSettings | "loading" | { error: string } | null;

/**
 * The header's settings entry (spec §3.3 item 13, S4d) — replaces the old
 * cogwheel's `HostControlsMenu`. From `md` a labelled button; on phones a
 * 34px icon button. It fetches `getTastingSettings` on first open only, so a
 * page view that never opens it never spends the round trip.
 */
export function TastingSettingsButton({
  tastingId,
  phone,
}: {
  tastingId: string;
  phone: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Loaded>(null);

  function openSheet() {
    setOpen(true);
    if (settings === null) {
      setSettings("loading");
      getTastingSettings(tastingId)
        .then((r) => setSettings(r))
        .catch(() => setSettings({ error: "Couldn't load tasting settings." }));
    }
  }

  return (
    <>
      {phone ? (
        <button
          type="button"
          aria-label="Tasting settings"
          onClick={openSheet}
          className="flex size-[34px] shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-gold"
        >
          <Settings className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={openSheet}
          className="flex min-h-11 shrink-0 items-center gap-[7px] rounded-[9px] border-[1.5px] border-primary bg-card px-[13px] py-[9px] text-[12.5px] font-semibold text-primary transition-colors hover:bg-surface-raised md:pointer-fine:min-h-0"
        >
          <Settings className="size-4" aria-hidden />
          Tasting settings
        </button>
      )}

      {open && settings && settings !== "loading" && !("error" in settings) ? (
        <TastingSettingsSheet
          tastingId={tastingId}
          open={open}
          onOpenChange={setOpen}
          settings={settings}
        />
      ) : null}

      {/* A minimal shell while the first load is in flight, or if it failed
          — TastingSettingsSheet only ever mounts with real settings, never a
          null/error placeholder. */}
      {open && (settings === "loading" || (settings && "error" in settings)) ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex min-w-[240px] flex-col items-center gap-3 rounded-2xl border border-border-strong bg-card p-6 text-center shadow-[0_18px_40px_-24px_rgba(42,33,30,.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            {settings === "loading" ? (
              <WineGlassLoader />
            ) : (
              <p className="text-[13px] text-destructive">
                {settings && "error" in settings ? settings.error : null}
              </p>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[12.5px] font-semibold text-primary hover:text-gold-deep"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
