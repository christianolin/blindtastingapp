"use client";

import { useRef, useState } from "react";
import { Camera, RotateCcw, Wine, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { createClient } from "@/lib/supabase/client";
import type { WineFormInitial } from "@/app/catalog/new/new-wine-form";
import { identifyWineFromLabel, resolveWinePrefill } from "@/app/scan/actions";

// One scanned bottle. Nothing is persisted until the queue saves it, so this
// lives entirely in component state (only the photo is already uploaded).
export type BulkScan = {
  id: string;
  imageUrl: string;
  status: "resolving" | "ready" | "failed";
  title: string;
  prefill?: WineFormInitial;
  match?: { id: string; label: string };
  error?: string;
};

// Scan several labels back to back, then confirm them in one pass. Each capture
// resolves in the background so the camera is immediately free for the next
// bottle — the slow part (vision + catalog lookup) never blocks scanning.
export function BulkScanModal({
  userId,
  onClose,
  onConfirm,
}: {
  userId: string;
  onClose: () => void;
  onConfirm: (scans: BulkScan[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scans, setScans] = useState<BulkScan[]>([]);
  const [uploading, setUploading] = useState(false);

  function patch(id: string, next: Partial<BulkScan>) {
    setScans((all) => all.map((s) => (s.id === id ? { ...s, ...next } : s)));
  }

  // Vision read + catalog match + prefill, for one already-uploaded photo.
  async function resolve(id: string, imageUrl: string) {
    try {
      const res = await identifyWineFromLabel(imageUrl);
      const e = res.extracted;
      const title =
        [e.producer, e.wineName, e.vintageYear].filter(Boolean).join(" · ") ||
        "Unnamed wine";
      // A confident catalog match means this bottle only needs confirming.
      if (res.matches.length > 0) {
        patch(id, {
          status: "ready",
          title,
          match: { id: res.matches[0].id, label: res.matches[0].name },
        });
        return;
      }
      const prefill = await resolveWinePrefill(e);
      patch(id, { status: "ready", title, prefill: { ...prefill, imageUrl } });
    } catch (err) {
      patch(id, {
        status: "failed",
        error: err instanceof Error ? err.message : "Couldn't read this label.",
      });
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same file twice still fires a change event.
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const supabase = createClient();
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `catalog/staging/${userId}/scan-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("wine-images")
        .upload(path, file);
      if (upErr) throw new Error(upErr.message);
      const {
        data: { publicUrl },
      } = supabase.storage.from("wine-images").getPublicUrl(path);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setScans((all) => [
        ...all,
        { id, imageUrl: publicUrl, status: "resolving", title: "Reading label…" },
      ]);
      setUploading(false);
      // Deliberately not awaited: the next scan can start straight away.
      void resolve(id, publicUrl);
    } catch (err) {
      setUploading(false);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setScans((all) => [
        ...all,
        {
          id,
          imageUrl: "",
          status: "failed",
          title: "Upload failed",
          error: err instanceof Error ? err.message : "Couldn't upload the photo.",
        },
      ]);
    }
  }

  const ready = scans.filter((s) => s.status === "ready");
  const resolving = scans.some((s) => s.status === "resolving");

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg max-sm:top-4 max-sm:max-h-[calc(100dvh-2rem)] max-sm:translate-y-0">
        <DialogTitle>Scan several labels</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Scan one bottle after another — we&apos;ll read each label in the
          background. Add them all to your cellar when you&apos;re done.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-fit"
        >
          {uploading ? (
            <>
              <WineGlassLoader /> Uploading…
            </>
          ) : (
            <>
              <Camera />
              {scans.length === 0 ? "Scan a label" : "Scan another"}
            </>
          )}
        </Button>

        {scans.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {scans.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-border p-2"
              >
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.imageUrl}
                    alt=""
                    className="size-12 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                    <Wine className="size-5" />
                  </span>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{s.title}</span>
                  {s.status === "failed" ? (
                    <span className="text-xs text-destructive">
                      {s.error ?? "Couldn't read this label."}
                    </span>
                  ) : s.status === "resolving" ? (
                    <span className="text-xs text-muted-foreground">
                      Reading label…
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {s.match ? "In catalog" : "New wine"}
                    </span>
                  )}
                </div>
                {s.status === "failed" && s.imageUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      patch(s.id, { status: "resolving", title: "Reading label…" });
                      void resolve(s.id, s.imageUrl);
                    }}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Try reading this label again"
                  >
                    <RotateCcw className="size-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setScans((all) => all.filter((x) => x.id !== s.id))
                  }
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${s.title}`}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">
            {ready.length} scanned
          </span>
          <Button
            type="button"
            disabled={ready.length === 0 || resolving}
            onClick={() => onConfirm(ready)}
          >
            {resolving
              ? "Reading labels…"
              : `Add ${ready.length} ${ready.length === 1 ? "wine" : "wines"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
