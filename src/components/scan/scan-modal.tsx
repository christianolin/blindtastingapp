"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Camera, Wine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { NewNoteModal } from "@/components/new-note-modal";
import type { WineFormInitial } from "@/app/catalog/new/new-wine-form";
import {
  identifyWineFromLabel,
  resolveWinePrefill,
  type ScanResult,
} from "@/app/scan/actions";

type Step = "capture" | "identifying" | "results" | "error";

// Scan a wine label: take/choose a photo, Claude reads it, then match the
// catalog (rate / view) or add it as a new wine with the form pre-filled.
export function ScanModal({
  userId,
  onClose,
  onAddNew,
  onAddToCellar,
  pickLabel = "Cellar",
}: {
  userId: string;
  onClose: () => void;
  onAddNew: (catalog: WineFormInitial) => void;
  onAddToCellar: (wine: { id: string; label: string }) => void;
  /** Label for the "use this matched wine" action (default "Cellar"; the
   *  tasting flow passes "Add to tasting"). */
  pickLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const [step, setStep] = useState<Step>("capture");
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteWineId, setNoteWineId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStep("identifying");
    setError(null);
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
      setScanUrl(publicUrl);
      const res = await identifyWineFromLabel(publicUrl);
      setResult(res);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("error");
    }
  }

  async function addAsNew() {
    if (!result) return;
    setAddingNew(true);
    try {
      const prefill = await resolveWinePrefill(result.extracted);
      onAddNew({ ...prefill, imageUrl: scanUrl });
      onClose();
    } catch {
      setAddingNew(false);
      setError("Couldn't prepare the form — you can still add the wine manually.");
      setStep("error");
    }
  }

  if (noteWineId) {
    return <NewNoteModal wineId={noteWineId} onClose={onClose} />;
  }

  const extracted = result?.extracted;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Scan a wine label</DialogTitle>

        {step === "capture" ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Take or choose a photo of the label — we&apos;ll read it and find the
              wine.
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Camera className="size-5" /> Take / choose photo
            </button>
          </div>
        ) : null}

        {step === "identifying" ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <WineGlassLoader />
            Reading the label…
          </div>
        ) : null}

        {step === "error" ? (
          <div className="flex flex-col gap-3 py-6">
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => setStep("capture")}
              className="self-start rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
            >
              Try again
            </button>
          </div>
        ) : null}

        {step === "results" && extracted ? (
          <div className="flex flex-col gap-4">
            <div className="flex gap-3">
              {scanUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={scanUrl}
                  alt=""
                  className="size-16 shrink-0 rounded-md border border-border object-cover"
                />
              ) : null}
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {[extracted.producer, extracted.wineName]
                    .filter(Boolean)
                    .join(" ") || "Couldn't read the producer"}
                </p>
                <p className="text-muted-foreground">
                  {[
                    extracted.appellation,
                    extracted.region,
                    extracted.country,
                    extracted.vintageKind === "YEAR"
                      ? extracted.vintageYear
                      : extracted.vintageKind,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Read confidence: {extracted.confidence}
                </p>
              </div>
            </div>

            {result && result.matches.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">In the catalog</p>
                {result.matches.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm">{m.name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setNoteWineId(m.id)}
                        className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-muted"
                      >
                        Rate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onAddToCellar({ id: m.id, label: m.name });
                          onClose();
                        }}
                        className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-muted"
                      >
                        {pickLabel}
                      </button>
                      <Link
                        href={`/catalog/${m.id}`}
                        onClick={onClose}
                        className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-muted"
                      >
                        View
                      </Link>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No match in the catalog yet.
              </p>
            )}

            <button
              type="button"
              disabled={addingNew}
              onClick={addAsNew}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Wine className="size-4" />
              {addingNew
                ? "Preparing…"
                : result && result.matches.length > 0
                  ? "None of these — add as new"
                  : "Add this wine"}
            </button>
            <button
              type="button"
              onClick={() => setStep("capture")}
              className="self-center text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Rescan
            </button>
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFile}
        />
      </DialogContent>
    </Dialog>
  );
}
