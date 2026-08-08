"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Camera, Check, Eye, NotebookPen, Pencil, Plus, RotateCcw, Warehouse, Wine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { NewNoteModal } from "@/components/new-note-modal";
import { EditWineModal } from "@/app/catalog/[wineId]/edit-wine-modal";
import type { WineFormInitial } from "@/app/catalog/new/new-wine-form";
import {
  createScannedWine,
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
  onAddNewToCellar,
  onAddToCellar,
  pickLabel = "Cellar",
}: {
  userId: string;
  onClose: () => void;
  onAddNew: (catalog: WineFormInitial) => void;
  /** When set, the "add as new" step offers a second choice that routes the
   *  scanned wine into the cellar form (used by the global scan, where you
   *  actively pick catalog vs cellar rather than defaulting). */
  onAddNewToCellar?: (catalog: WineFormInitial) => void;
  onAddToCellar: (wine: { id: string; label: string }) => void;
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
  // High-confidence scans are saved without the form; this holds the created
  // wine while the follow-up chooser (note / cellar / view / edit) is up.
  const [created, setCreated] = useState<{ id: string; label: string } | null>(
    null,
  );
  const [editOpen, setEditOpen] = useState(false);



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

  // Every add path tries auto-accept first: a high-confidence, complete read
  // is saved straight to the catalog and lands in the follow-up chooser
  // (note / cellar / view / done). Only an uncertain or incomplete read —
  // or a lower confidence — falls back to the pre-filled form handler.
  async function addAsNew(handler: (catalog: WineFormInitial) => void) {
    if (!result) return;
    setAddingNew(true);
    try {
      const prefill = {
        ...(await resolveWinePrefill(result.extracted)),
        imageUrl: scanUrl,
      };
      if (result.extracted.confidence === "high") {
        const auto = await createScannedWine(prefill);
        if (auto) {
          const label =
            [result.extracted.producer, result.extracted.wineName]
              .filter(Boolean)
              .join(" ") || "Scanned wine";
          setCreated({ id: auto.id, label });
          setAddingNew(false);
          return;
        }
      }
      handler(prefill);
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

  if (created && editOpen) {
    return (
      <EditWineModal
        wineId={created.id}
        userId={userId}
        onClose={() => setEditOpen(false)}
      />
    );
  }

  if (created) {
    const meta = result?.extracted;
    const metaLine = [
      meta?.appellation ?? meta?.region,
      meta?.country,
      meta?.vintageKind === "YEAR"
        ? meta?.vintageYear
        : meta?.vintageKind === "NV"
          ? "NV"
          : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const grapeLine = (meta?.grapes ?? []).map((g) => g.name).join(", ");
    return (
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent
          showCloseButton={false}
          className="gap-0 overflow-hidden p-0 sm:max-w-md max-sm:top-4 max-sm:max-h-[calc(100dvh-2rem)] max-sm:translate-y-0"
        >
          <DialogTitle className="sr-only">Wine added</DialogTitle>
          {/* The reward: a big bottle over a warm wash, so a scan lands as a
              moment rather than a form receipt. The label photo fills a tall
              hero; identity and actions sit on the cream below. */}
          <div className="relative flex h-56 items-end justify-center overflow-hidden bg-gradient-to-b from-primary/15 to-background">
            {scanUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={scanUrl}
                alt=""
                className="h-52 w-auto max-w-[70%] rounded-t-lg object-contain drop-shadow-xl"
              />
            ) : (
              <Wine className="mb-8 size-20 text-primary/40" />
            )}
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs font-medium backdrop-blur-sm transition-colors hover:bg-background"
            >
              <Pencil className="size-3.5" /> Edit
            </button>
          </div>

          <div className="flex flex-col gap-4 px-5 pb-5">
            <div className="text-center">
              <p className="flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
                <Check className="size-3.5" /> Added to the catalog
              </p>
              <h2 className="mt-1 font-heading text-xl font-semibold leading-tight">
                {created.label}
              </h2>
              {metaLine ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{metaLine}</p>
              ) : null}
              {grapeLine ? (
                <p className="text-xs text-muted-foreground">{grapeLine}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setNoteWineId(created.id)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <NotebookPen className="size-4" /> Taste &amp; rate it now
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onAddToCellar({ id: created.id, label: created.label });
                    onClose();
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <Warehouse className="size-4" /> To cellar
                </button>
                <Link
                  href={`/catalog/${created.id}`}
                  onClick={onClose}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <Eye className="size-4" /> View wine
                </Link>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                Done
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const extracted = result?.extracted;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg max-sm:top-4 max-sm:max-h-[calc(100dvh-2rem)] max-sm:translate-y-0">
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
              <Camera className="size-5" />
              <span className="sm:hidden">Take or choose picture</span>
              <span className="hidden sm:inline">Upload picture</span>
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
                    className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="text-sm">{m.name}</span>
                    <span className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setNoteWineId(m.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-muted"
                      >
                        <NotebookPen className="size-3.5" /> Rate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onAddToCellar({ id: m.id, label: m.name });
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-muted"
                      >
                        <Plus className="size-3.5" /> {pickLabel}
                      </button>
                      <Link
                        href={`/catalog/${m.id}`}
                        onClick={onClose}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-muted"
                      >
                        <Eye className="size-3.5" /> View
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

            {onAddNewToCellar ? (
              // Global scan: the user actively picks where a new wine goes — the
              // cellar (which also creates the catalog entry) or the shared
              // catalog only. Nothing is added until one is tapped.
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {result && result.matches.length > 0
                    ? "None of these? Add it as a new wine:"
                    : "Add this wine:"}
                </p>
                <button
                  type="button"
                  disabled={addingNew}
                  onClick={() => addAsNew(onAddNewToCellar)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  <Warehouse className="size-4" />
                  {addingNew ? "Preparing…" : "Add to my cellar"}
                </button>
                <button
                  type="button"
                  disabled={addingNew}
                  onClick={() => addAsNew(onAddNew)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
                >
                  <Plus className="size-4" /> Add to the catalog only
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={addingNew}
                onClick={() => addAsNew(onAddNew)}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                <Wine className="size-4" />
                {addingNew
                  ? "Adding…"
                  : result && result.matches.length > 0
                    ? "None of these — add as new"
                    : "Add this wine"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setStep("capture")}
              className="inline-flex items-center gap-1 self-center text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="size-3.5" /> Rescan
            </button>
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
      </DialogContent>
    </Dialog>
  );
}
