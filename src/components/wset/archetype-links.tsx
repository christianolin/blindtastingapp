// The foot of a typical wine's reference sheet outside the room (training-room-map
// spec RM10, §6.1): "Practise blind in the training room →" always, and "See it
// on the wine map" where the caller asks for it and the wine has a place (the
// Library's modal — the explorer's own modal passes nothing, the viewer is
// already on the map). Both same tab: the Library is not a session. The
// practise link never names the wine — a link that pre-selected it would
// defeat a blind session. Pure (no hooks, no portal) so the markup test
// renders it; ArchetypeModal and /knowledge/archetypes/[id] both use it.
import Link from "next/link";
import { TRAINING_COPY, placeHref } from "@/lib/training/copy";

const LINK =
  "inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring md:pointer-fine:min-h-0";

export function ArchetypeLinks({ placeKey, mapLink = false }: { placeKey: string | null; mapLink?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border-light pt-3">
      <Link href="/taste/training" className={LINK}>
        {TRAINING_COPY.practiseBlind}
      </Link>
      {mapLink && placeKey ? (
        <Link href={placeHref(placeKey)} className={LINK}>
          {TRAINING_COPY.seeOnMap}
        </Link>
      ) : null}
    </div>
  );
}
