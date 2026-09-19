"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import { BottleThumb } from "@/components/bottle-thumb";
import { LocalDateTime } from "@/components/local-date-time";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { STRIP_SHOWN, photoCaption, stripHeading } from "@/lib/catalog-photos/strip";
import type { StripPhoto } from "@/lib/catalog-photos/types";
import { TWO_TAP_WINDOW_MS, twoTapState } from "@/lib/console-copy";
import { removeCatalogWinePhoto } from "../photo-actions";

// The wine page's "More photos" strip (scan photos spec §8.5): every photo of
// the wine but the main one, newest first (`stripPhotos`, done by the page).
// Up to STRIP_SHOWN thumbnails plus a "+N" tile; a tap opens the photo large
// with who added it and when, and — on your own photo — a two-tap "Remove
// from this wine" that unlinks it. The storage file is never touched.
// Renders nothing when there are no photos. Theme tokens only.

const THUMB_BUTTON =
  "rounded-[4px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const REMOVE_FAILED = "Couldn't remove this photo. Please try again.";

export function PhotoStrip({
  wineTitle,
  photos,
  hasMain,
  viewerId,
}: {
  wineTitle: string;
  photos: StripPhoto[];
  hasMain: boolean;
  viewerId: string;
}) {
  const router = useRouter();
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // The two-tap window closes on its own (same as the host console's).
  useEffect(() => {
    if (armedAt === null) return;
    const id = setTimeout(() => setArmedAt(null), TWO_TAP_WINDOW_MS);
    return () => clearTimeout(id);
  }, [armedAt]);

  const n = photos.length;
  if (n === 0) return null;

  const shown = photos.slice(0, STRIP_SHOWN);
  const more = n - shown.length;
  // A refresh can shrink the list under an open dialog: clamp, never crash.
  const index = openAt === null ? null : Math.min(openAt, n - 1);
  const current = index === null ? null : photos[index];

  const captionOf = (p: StripPhoto) =>
    photoCaption({ isOwn: p.addedBy === viewerId, name: p.addedByName, isScan: p.isScan });

  function show(i: number): void {
    setOpenAt(i);
    setArmedAt(null);
    setRemoveError(null);
  }

  function close(): void {
    setOpenAt(null);
    setArmedAt(null);
    setRemoveError(null);
  }

  function step(delta: number): void {
    if (index === null || n < 2) return;
    show((index + delta + n) % n);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    }
  }

  async function remove(photo: StripPhoto): Promise<void> {
    if (removing) return;
    if (twoTapState(armedAt, Date.now()) !== "armed") {
      setRemoveError(null);
      setArmedAt(Date.now());
      return;
    }
    setArmedAt(null);
    setRemoving(true);
    setRemoveError(null);
    try {
      const result = await removeCatalogWinePhoto(photo.id);
      if (result.ok) {
        close();
        router.refresh();
      } else {
        setRemoveError(REMOVE_FAILED);
      }
    } catch (e) {
      console.error("wine page: photo not removed", e instanceof Error ? e.message : typeof e);
      setRemoveError(REMOVE_FAILED);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="mt-3">
      <p className="mb-1.5">
        <Eyebrow>{stripHeading(hasMain)}</Eyebrow>
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              className={THUMB_BUTTON}
              aria-label={`Photo ${i + 1} of ${n}, ${captionOf(p)}`}
              onClick={() => show(i)}
            >
              <BottleThumb src={p.url} className="h-16 w-12" />
            </button>
          </li>
        ))}
        {more > 0 ? (
          <li>
            <button
              type="button"
              className={`${THUMB_BUTTON} flex h-16 w-12 items-center justify-center border border-border bg-card text-sm font-medium text-muted-foreground`}
              aria-label={`Show photo ${STRIP_SHOWN + 1} of ${n}`}
              onClick={() => show(STRIP_SHOWN)}
            >
              +{more}
            </button>
          </li>
        ) : null}
      </ul>

      <Dialog
        open={current !== null}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-[calc(100%-2rem)] gap-3 p-3 sm:max-w-2xl"
          onKeyDown={onKeyDown}
        >
          {current !== null && index !== null ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="sr-only">
                  Photo {index + 1} of {n} — {wineTitle}
                </DialogTitle>
                {n > 1 ? (
                  <span className="text-xs text-muted-foreground" aria-hidden>
                    {index + 1} of {n}
                  </span>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label="Close"
                  onClick={close}
                >
                  <XIcon />
                </Button>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={current.id}
                src={current.url}
                alt=""
                className="max-h-[70vh] w-full rounded-md bg-card object-contain"
              />

              <p className="text-sm text-muted-foreground">
                {captionOf(current)} · <LocalDateTime iso={current.createdAt} />
              </p>

              {n > 1 ? (
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11"
                    aria-label="Previous photo"
                    onClick={() => step(-1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11"
                    aria-label="Next photo"
                    onClick={() => step(1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              ) : null}

              {current.addedBy === viewerId ? (
                <div className="flex flex-col items-start gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 px-4"
                    disabled={removing}
                    onClick={() => void remove(current)}
                  >
                    {armedAt !== null ? "Tap again to remove" : "Remove from this wine"}
                  </Button>
                  {removeError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {removeError}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Only this wine&apos;s page changes. The photo file is kept.
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
