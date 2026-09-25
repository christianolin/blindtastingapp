"use client";

// "Show the tour again" (first-run tour spec D2), on /profile/edit's Getting
// started card. Clears profiles.tour_seen_at, then opens the tour from
// TourProvider's state and sends the person to /overview, where it shows.
// TourProvider lives in the root layout, which a soft navigation does not
// re-render, so the cleared column alone would not reopen it this visit. It
// reopens even if the write failed: the person asked to see it, and their
// next dismissal stamps it again.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTourReplay } from "@/components/first-run/tour-provider";
import { Button } from "@/components/ui/button";
import { resetTour } from "@/lib/first-run/actions";
import { TOUR_COPY, TOUR_REPLAY_HREF } from "@/lib/first-run/tour";

export function ShowTourAgainButton() {
  const replay = useTourReplay();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      className="min-h-11 md:pointer-fine:min-h-0"
      onClick={() =>
        startTransition(async () => {
          await resetTour().catch(() => false);
          replay();
          router.push(TOUR_REPLAY_HREF);
        })
      }
    >
      {TOUR_COPY.showAgain}
    </Button>
  );
}
