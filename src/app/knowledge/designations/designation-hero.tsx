import type { DesignationContent } from "@/lib/designations/content";

// Intro line for a classification: the artefact (where there is one) blended
// straight onto the parchment beside the text — no frame, no card. The
// atmospheric photo is not here; it's the section backdrop behind everything.
export function DesignationHero({
  inset,
  intro,
}: {
  inset?: DesignationContent["inset"];
  intro?: string;
}) {
  if (!intro && !inset) return null;
  return (
    <div className="flex items-center gap-5">
      {inset ? (
        <figure className="hidden w-[112px] shrink-0 flex-col gap-1.5 sm:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={inset.src}
            alt={inset.alt}
            className="w-full mix-blend-multiply"
          />
          {inset.caption ? (
            <figcaption className="text-[0.65rem] leading-tight text-muted-foreground">
              {inset.caption}
            </figcaption>
          ) : null}
        </figure>
      ) : null}
      {intro ? (
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          {intro}
        </p>
      ) : null}
    </div>
  );
}
