"use client";

import { useRef, type ReactNode } from "react";
import { Images, Layers, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { glassLabel } from "./format";
import { MultiAddStack } from "./multi-add-stack";
import { itemRowCopy } from "./sheet-state";
import { useCamera } from "./use-camera";
import type { CameraViewProps } from "./types";

const CAMERA_FALLBACK = "Camera not available — use Library or search";

const CHIP_LABEL: Record<CameraViewProps["matrix"]["chips"][number], string> = {
  cellar: "My cellar",
  byhand: "By hand",
};

/**
 * A2 (B2, C2 and D2 use the same view): the sheet's opening view on a device
 * that can scan — a live camera on the dark ground. The shell draws the
 * header; this renders the search field, the viewfinder with its gold
 * brackets, the shutter row (Library · shutter · Scan many, or Library ·
 * shutter · By hand in Many) and the matrix's source chips (or, in Many, the stack above
 * the viewfinder and the gold Done footer). There is no Catalog chip: the
 * search field is the catalog (D4).
 *
 * A shutter capture goes through `useCamera().capture()` (a JPEG Blob) and a
 * Library pick through the hidden file input; either way the shell
 * downscales, uploads and reads it — one label read per photo. Without a
 * camera the viewfinder says so and Library becomes the primary control.
 *
 * Every destination-dependent string and rule comes from `matrix`; the view
 * never tests the destination's kind (spec §G.1 gate 4).
 */
export function CameraView({
  matrix,
  destination,
  multi,
  items,
  addedCount,
  onCapture,
  onLibrary,
  onOpenSearch,
  onChip,
  onMany,
  onDone,
  onItemAction,
}: CameraViewProps) {
  const { status, videoRef, capture } = useCamera(true);
  const libraryRef = useRef<HTMLInputElement>(null);

  const live = status === "live";
  const fallback = status === "unavailable" || status === "denied";
  // "Next bottle · glass N" reads the position a flight destination carries.
  const nextGlass = destination !== null && "position" in destination ? destination.position : null;
  // In Many every bottle is listed (A4). Outside it, only rows that still ask
  // for something — a read left with ← (amendment 20) or a failed photo — so an
  // unfinished bottle is never invisible behind the camera.
  const stackItems = multi
    ? items
    : items.filter((item) => itemRowCopy(item, destination).actions.length > 0);

  const shoot = async () => {
    if (!live) return;
    const blob = await capture();
    if (blob) onCapture(blob);
  };
  const openLibrary = () => libraryRef.current?.click();

  return (
    <div className="flex min-h-full flex-col text-primary-foreground">
      {/* The search field above the camera: the shell unhides the parked
          search view and focuses its input inside this same tap. */}
      <div className="shrink-0 px-4 pb-[10px] md:px-[22px]">
        <Button
          type="button"
          variant="ghost"
          onClick={onOpenSearch}
          className="h-auto min-h-11 w-full justify-start gap-[9px] rounded-[11px] border border-primary-foreground/30 bg-primary-foreground/10 p-[12px_13px] text-left text-[14.5px] font-normal text-primary-foreground/80 hover:border-gold-light hover:bg-primary-foreground/10 hover:text-primary-foreground"
        >
          <Search aria-hidden className="size-4 shrink-0" />
          {matrix.searchPlaceholder}
        </Button>
      </div>

      <MultiAddStack items={stackItems} destination={destination} onItemAction={onItemAction} />

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

      {/* Library picker: no `capture` attribute, so a phone may also choose
          existing photos. Several at once where the matrix allows it. */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple={matrix.upload.multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Picking the same file twice must still fire a change event.
          e.target.value = "";
          if (files.length > 0) onLibrary(files);
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
          <TextSlot onClick={openLibrary}>Library</TextSlot>
        ) : (
          <TileSlot
            label="Library"
            onClick={openLibrary}
            primary={fallback}
            icon={<Images aria-hidden className="size-5" />}
          />
        )}
        <Button
          type="button"
          variant="ghost"
          aria-label="Take a photo of the label"
          onClick={() => void shoot()}
          disabled={!live}
          className={cn(
            "shrink-0 rounded-full border-4 border-primary-foreground p-0 transition-opacity hover:bg-transparent active:opacity-80 disabled:opacity-40",
            multi ? "size-[68px]" : "size-[74px]",
          )}
        >
          <span
            aria-hidden
            className={cn("rounded-full bg-primary-foreground", multi ? "size-[53px]" : "size-[58px]")}
          />
        </Button>
        {multi ? (
          matrix.chips.includes("byhand") ? (
            <TextSlot onClick={() => onChip("byhand")}>By hand</TextSlot>
          ) : (
            <span aria-hidden className="w-14 shrink-0" />
          )
        ) : matrix.showMany ? (
          // Owner, 2026-09-19: "Many" alone was easy to miss — "Scan many".
          <TileSlot label="Scan many" onClick={onMany} icon={<Layers aria-hidden className="size-[17px]" />} />
        ) : (
          // A single-wine destination has no Many; the empty slot keeps the
          // shutter centred.
          <span aria-hidden className="w-16 shrink-0" />
        )}
      </div>

      {multi ? (
        <div className="shrink-0 px-4 pt-[2px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-[18px] md:px-[22px]">
          <Button
            type="button"
            onClick={onDone}
            className="h-auto min-h-11 w-full gap-[9px] rounded-[11px] bg-gold-light p-[15px] text-[16px] font-bold text-console shadow-[0_2px_0_0_rgba(42,33,30,.18)] hover:bg-gold"
          >
            {addedCount === 0
              ? "Done"
              : `Done · ${addedCount} ${addedCount === 1 ? "wine" : "wines"} added`}
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 gap-2 px-4 pt-[2px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-[18px] md:px-[22px]">
          {matrix.chips.map((chip) => (
            <SourceChip key={chip} onClick={() => onChip(chip)}>
              {CHIP_LABEL[chip]}
            </SourceChip>
          ))}
        </div>
      )}
    </div>
  );
}

// Gold corner brackets: 36px / 3px / 8px radius on open; Many draws them a
// touch smaller and closer in (A4).
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

// A 44px tile with a caption (Library / Scan many on the opening screen). The
// slot is 64px so "Scan many" fits on one line at 10.5px.
function TileSlot({
  label,
  icon,
  onClick,
  primary = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="h-auto w-16 shrink-0 flex-col gap-1 rounded-[10px] p-0 hover:bg-transparent"
    >
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-[10px] border transition-colors",
          primary
            ? "border-gold-light bg-gold-light text-console"
            : "border-primary-foreground/30 bg-console-card text-primary-foreground group-hover/button:border-gold-light",
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "text-[10.5px]",
          primary ? "font-semibold text-primary-foreground" : "font-normal text-primary-foreground/75",
        )}
      >
        {label}
      </span>
    </Button>
  );
}

// Many's plain text slots either side of the shutter.
function TextSlot({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="h-auto min-h-11 w-14 shrink-0 px-0 text-center text-[12.5px] font-normal whitespace-normal text-primary-foreground/75 hover:bg-transparent hover:text-primary-foreground"
    >
      {children}
    </Button>
  );
}

function SourceChip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="h-auto min-h-11 flex-1 rounded-[10px] border border-primary-foreground/30 p-[12px_6px] text-[13px] font-semibold text-primary-foreground hover:border-gold-light hover:bg-transparent hover:text-primary-foreground"
    >
      {children}
    </Button>
  );
}
