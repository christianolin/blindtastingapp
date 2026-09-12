"use client";

import { useRef, type ReactNode } from "react";
import { Images, Layers, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { glassLabel } from "./format";
import { MultiAddStack } from "./multi-add-stack";
import { useCamera } from "./use-camera";
import type { CameraViewProps } from "./types";

const CAMERA_FALLBACK = "Camera not available — use Library or search";

/**
 * 7b / 7d: the sheet's opening view — a live camera on the dark ground. The
 * shell draws the header; this renders the "Or search by name" field, the
 * viewfinder with its gold brackets, the shutter row (Library · shutter ·
 * Many, or Library · shutter · By hand once in multi mode; a rate pick has
 * no Many), and the source
 * chips (or, in multi mode, the added/pending stack above the viewfinder and
 * the gold "Done" footer).
 *
 * Capture goes through `useCamera().capture()` (a JPEG Blob) or the hidden
 * Library file input; either way the shell uploads and reads it — exactly
 * one FastCork credit per photo. Without a camera the viewfinder says so and
 * Library becomes the primary control.
 */
export function CameraView({
  ctx,
  onCaptured,
  onSearch,
  onCellar,
  onByHand,
  onToggleMulti,
  onDone,
  onFixPending,
  onRemovePending,
  busy,
}: CameraViewProps) {
  const { status, videoRef, capture } = useCamera(true);
  const libraryRef = useRef<HTMLInputElement>(null);

  const live = status === "live";
  const fallback = status === "unavailable" || status === "denied";
  const multi = ctx.multi;
  // Taste & rate picks exactly one wine (the shell never turns multi on).
  const single = ctx.destination?.kind === "rate";
  const nextGlass = ctx.destination?.kind === "flight" ? ctx.destination.position : null;
  const showCellar = ctx.destination?.kind !== "cellar";
  const addedCount = ctx.added.length;

  const shoot = async () => {
    if (busy || !live) return;
    const blob = await capture();
    if (blob) onCaptured(blob);
  };
  const openLibrary = () => {
    if (busy) return;
    libraryRef.current?.click();
  };

  return (
    <div className="flex min-h-full flex-col text-primary-foreground">
      {/* Search sits above the camera: tapping it slides the camera away. */}
      <div className="shrink-0 px-4 pb-[10px] md:px-[22px]">
        <button
          type="button"
          onClick={onSearch}
          className="flex min-h-11 w-full items-center gap-[9px] rounded-[11px] border border-primary-foreground/30 bg-primary-foreground/10 p-[12px_13px] text-left text-[14.5px] text-primary-foreground/80 transition-colors hover:border-gold-light"
        >
          <Search className="size-4 shrink-0" />
          Or search by name
        </button>
      </div>

      {multi ? (
        <MultiAddStack
          added={ctx.added}
          pending={ctx.pending}
          nextGlass={nextGlass}
          onFixPending={onFixPending}
          onRemovePending={onRemovePending}
        />
      ) : null}

      {/* Viewfinder: fills the remaining height. */}
      <div className="relative mx-4 min-h-[200px] flex-1 overflow-hidden rounded-2xl bg-console-card md:mx-[22px]">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Camera"
          // Kept rendered (opacity, not display:none) so the stream plays the
          // moment it attaches — mobile Safari will not start a hidden video.
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-200",
            !live && "opacity-0",
          )}
        />
        {fallback ? (
          <p
            role="status"
            className="absolute inset-0 flex items-center justify-center px-8 text-center text-[13.5px] leading-[1.45] text-console-ink"
          >
            {CAMERA_FALLBACK}
          </p>
        ) : null}
        <Brackets small={multi} />
        {!fallback ? (
          <span
            className={cn(
              "absolute inset-x-0 text-center text-primary-foreground",
              multi ? "bottom-[22px] text-[13px]" : "bottom-[40px] text-[13.5px]",
            )}
          >
            {multi
              ? nextGlass != null
                ? `Next bottle · ${glassLabel(nextGlass)}`
                : "Next bottle"
              : "Fill the frame with the label"}
          </span>
        ) : null}
        {!multi && !fallback ? (
          // Decorative — there is no torch API worth promising.
          <span
            aria-hidden
            className="absolute top-4 left-4 flex items-center gap-[6px] rounded-full bg-console/70 px-[11px] py-[5px] text-[11px] text-primary-foreground"
          >
            Flash auto
          </span>
        ) : null}
      </div>

      {/* Library picker: no `capture` attribute, so phones may also choose
          an existing photo and a PC simply uploads. */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Picking the same file twice must still fire a change event.
          e.target.value = "";
          if (f) onCaptured(f);
        }}
      />

      {/* Shutter row. */}
      <div
        className={cn(
          "flex shrink-0 items-center justify-center gap-[30px] px-4",
          multi ? "pt-[12px] pb-[8px]" : "pt-[14px] pb-[10px]",
        )}
      >
        {multi ? (
          <TextSlot onClick={openLibrary} disabled={busy}>
            Library
          </TextSlot>
        ) : (
          <TileSlot
            label="Library"
            onClick={openLibrary}
            disabled={busy}
            primary={fallback}
            icon={<Images className="size-5" />}
          />
        )}
        <button
          type="button"
          aria-label="Take a photo of the label"
          onClick={() => void shoot()}
          disabled={busy || !live}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border-4 border-primary-foreground transition-opacity active:opacity-80 disabled:opacity-40",
            multi ? "size-[68px]" : "size-[74px]",
          )}
        >
          <span
            aria-hidden
            className={cn("rounded-full bg-primary-foreground", multi ? "size-[53px]" : "size-[58px]")}
          />
        </button>
        {multi ? (
          <TextSlot onClick={onByHand} disabled={busy}>
            By hand
          </TextSlot>
        ) : single ? (
          // A rate pick is one wine: no Many. The empty slot keeps the
          // shutter centred.
          <span aria-hidden className="w-14 shrink-0" />
        ) : (
          <TileSlot
            label="Many"
            onClick={onToggleMulti}
            disabled={busy}
            icon={<Layers className="size-[17px]" />}
          />
        )}
      </div>

      {multi ? (
        <div className="shrink-0 px-4 pt-[2px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-[18px] md:px-[22px]">
          <button
            type="button"
            onClick={onDone}
            disabled={busy}
            className="flex min-h-11 w-full items-center justify-center gap-[9px] rounded-[11px] bg-gold-light p-[15px] text-[16px] font-bold text-console shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors hover:bg-gold disabled:opacity-60"
          >
            {addedCount === 0
              ? "Done"
              : `Done · ${addedCount} ${addedCount === 1 ? "wine" : "wines"} added`}
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 gap-2 px-4 pt-[2px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-[18px] md:px-[22px]">
          <SourceChip onClick={onSearch}>Catalog</SourceChip>
          {showCellar ? <SourceChip onClick={onCellar}>My cellar</SourceChip> : null}
          <SourceChip onClick={onByHand}>By hand</SourceChip>
        </div>
      )}
    </div>
  );
}

// Gold corner brackets: 36px / 3px / 8px radius on open; the multi-add
// screen draws them a touch smaller and closer in (7d).
function Brackets({ small }: { small: boolean }) {
  const size = small ? "size-8" : "size-9";
  const x = small ? "26px" : "30px";
  const y = small ? "52px" : "84px";
  const base = cn("pointer-events-none absolute border-gold-light", size);
  return (
    <>
      <span aria-hidden className={cn(base, "rounded-tl-[8px] border-t-[3px] border-l-[3px]")} style={{ left: x, top: y }} />
      <span aria-hidden className={cn(base, "rounded-tr-[8px] border-t-[3px] border-r-[3px]")} style={{ right: x, top: y }} />
      <span aria-hidden className={cn(base, "rounded-bl-[8px] border-b-[3px] border-l-[3px]")} style={{ left: x, bottom: y }} />
      <span aria-hidden className={cn(base, "rounded-br-[8px] border-r-[3px] border-b-[3px]")} style={{ right: x, bottom: y }} />
    </>
  );
}

// A 44px tile with a caption (Library / Many on the opening screen).
function TileSlot({
  label,
  icon,
  onClick,
  disabled,
  primary = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-14 shrink-0 flex-col items-center gap-1 disabled:opacity-60"
    >
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-[10px] border transition-colors",
          primary
            ? "border-gold-light bg-gold-light text-console"
            : "border-primary-foreground/30 bg-console-card text-primary-foreground hover:border-gold-light",
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "text-[10.5px]",
          primary ? "font-semibold text-primary-foreground" : "text-primary-foreground/75",
        )}
      >
        {label}
      </span>
    </button>
  );
}

// The multi-add screen's plain text slots either side of the shutter.
function TextSlot({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 w-14 shrink-0 items-center justify-center text-center text-[12.5px] text-primary-foreground/75 transition-colors hover:text-primary-foreground disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function SourceChip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 flex-1 items-center justify-center rounded-[10px] border border-primary-foreground/30 p-[12px_6px] text-[13px] font-semibold text-primary-foreground transition-colors hover:border-gold-light"
    >
      {children}
    </button>
  );
}
