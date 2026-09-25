"use client";

// The first-run tour sheet (spec docs/superpowers/specs/2026-09-25-first-run-tour-design.md
// D3, D5, D8). One base-ui Dialog: a bottom sheet on phones (rounded top,
// drag-handle pill, at most 88dvh — the field-picker idiom) and a centred
// 480 px card from `md`. TourProvider mounts it only while the tour is open,
// so every open starts at step 1. The steps, the copy and the footer come
// from src/lib/first-run/tour.ts; this file only lays them out.
//
// Dismissal (D2): Skip tour, Done, Later, "Set up my profile", the X and
// Escape all call `onFinish`. An outside tap does nothing
// (`disablePointerDismissal`): the tour shows once per account, and a stray
// tap on the dimmed page should not use that once up.
//
// Focus (D8): moves to Next on a fine pointer only. On touch nothing moves on
// open — the Popover rule (src/components/ui/popover.tsx): a just-opened popup
// taking focus on a phone yanked the page. base-ui's default "first tabbable"
// would have been Skip tour, one Enter away from ending the tour.
//
// Tokens only, so the portal follows `.dark` like every other surface.
import { useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { Boxes, GraduationCap, Sparkles, UserRound, Users, Wine } from "lucide-react";
import { useCanScan } from "@/components/add-wine/use-can-scan";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  FRIEND_REQUESTS_LIVE,
  TOUR_COPY,
  TOUR_SETUP_HREF,
  clampStep,
  tourFooter,
  tourStepLabel,
  tourSteps,
  type TourStepId,
} from "@/lib/first-run/tour";
import { cn } from "@/lib/utils";

// The sidebar's pillar icons where a step is a pillar (app-sidebar.tsx ICONS).
const STEP_ICONS: Record<TourStepId, ComponentType<{ className?: string }>> = {
  welcome: Sparkles,
  taste: Wine,
  cellar: Boxes,
  learn: GraduationCap,
  community: Users,
  profile: UserRound,
};

// 44 px tap targets on touch, the control's own height on a laptop pointer
// (delete-account-section.tsx's TAP).
const TAP = "min-h-11 md:pointer-fine:min-h-0";

// Below md: a sheet from the bottom, overriding DialogContent's centred
// defaults the way note-saved-sheet.tsx does (tailwind-merge drops the
// defaults these replace).
const PHONE =
  "top-auto bottom-0 left-0 flex max-h-[88dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-[22px_22px_0_0] bg-card p-0 text-foreground ring-0 sm:max-w-none max-md:data-open:zoom-in-100 max-md:data-open:slide-in-from-bottom-8";

// md and up: a centred 480 px card.
const CARD =
  "md:top-1/2 md:bottom-auto md:left-1/2 md:max-h-[80vh] md:w-[480px] md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:ring-1 md:ring-foreground/10 md:shadow-[0_30px_60px_-28px_color-mix(in_srgb,var(--foreground)_50%,transparent)]";

function finePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
}

export function TourSheet({
  profileBare,
  onFinish,
}: {
  profileBare: boolean;
  /** Every way the tour ends (D2). The parent stamps the flag and unmounts this. */
  onFinish: () => void;
}) {
  // `null` until detection resolves: the catalog wording until then (D5 step 3).
  const canScan = useCanScan() === true;
  const steps = tourSteps({ canScan, profileBare, friendRequestsLive: FRIEND_REQUESTS_LIVE });
  const [index, setIndex] = useState(0);
  // The list can shrink under an open sheet (a refresh that fills the profile).
  const at = clampStep(index, steps.length);
  const step = steps[at];
  const footer = tourFooter(steps, at);
  const Icon = STEP_ICONS[step.id];
  const nextRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(next) => {
        // The X (close-press) and Escape (escape-key).
        if (!next) onFinish();
      }}
    >
      <DialogContent
        initialFocus={() => (finePointer() ? (nextRef.current ?? true) : false)}
        finalFocus={false}
        className={cn(PHONE, CARD)}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-3 pb-5 md:gap-4 md:px-7 md:pt-7 md:pb-6">
          <span aria-hidden className="h-1 w-[38px] shrink-0 self-center rounded-full bg-border md:hidden" />
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <Icon className="size-5" />
          </span>
          <DialogTitle className="text-[22px] leading-tight font-semibold md:text-[26px]">
            {step.title}
          </DialogTitle>
          <DialogDescription
            render={<div />}
            className="flex flex-col gap-2 text-[14px] leading-relaxed text-muted-foreground md:text-[14.5px]"
          >
            {step.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </DialogDescription>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-background px-5 pt-3 pb-[max(18px,env(safe-area-inset-bottom))] md:px-7 md:pb-4">
          <div className="flex min-h-11 items-center gap-3 md:pointer-fine:min-h-8">
            <div aria-hidden className="flex items-center gap-1.5">
              {steps.map((s, i) => (
                <span
                  key={s.id}
                  className={cn(
                    "h-1.5 rounded-full transition-[width,background-color] duration-200",
                    i === at ? "w-4 bg-primary dark:bg-primary-ink" : "w-1.5 bg-border-strong",
                  )}
                />
              ))}
            </div>
            <span className="sr-only" aria-live="polite">
              {tourStepLabel(at + 1, steps.length)}: {step.title}
            </span>
            {footer.skip ? (
              <button
                type="button"
                onClick={onFinish}
                className={cn(
                  "ml-auto inline-flex items-center rounded-md px-1 text-[12.5px] font-semibold text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  TAP,
                )}
              >
                {TOUR_COPY.skip}
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {footer.back ? (
              <Button type="button" variant="outline" className={TAP} onClick={() => setIndex(at - 1)}>
                {TOUR_COPY.back}
              </Button>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {footer.primary === "next" ? (
                <Button ref={nextRef} type="button" className={cn(TAP, "px-4")} onClick={() => setIndex(at + 1)}>
                  {TOUR_COPY.next}
                </Button>
              ) : footer.primary === "done" ? (
                <Button type="button" className={cn(TAP, "px-4")} onClick={onFinish}>
                  {TOUR_COPY.done}
                </Button>
              ) : (
                <>
                  <Button type="button" variant="ghost" className={TAP} onClick={onFinish}>
                    {TOUR_COPY.later}
                  </Button>
                  {/* Button renders a Link here, so nativeButton={false}
                      (CLAUDE.md, Base UI). The click stamps the flag; the
                      Link navigates. */}
                  <Button
                    render={<Link href={TOUR_SETUP_HREF} />}
                    nativeButton={false}
                    className={cn(TAP, "px-4")}
                    onClick={onFinish}
                  >
                    {TOUR_COPY.setUp}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
