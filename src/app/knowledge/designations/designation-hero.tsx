import type { DesignationContent } from "@/lib/designations/content";

// Intro band for a classification: the artefact framed on the left, the text
// beside it, and an atmospheric photo dissolving into the card on the right —
// the same treatment as the overview hero.
//
// These source images are small (a few hundred pixels), so nothing is stretched
// to fill the band: the hero is capped near its natural size and anchored to
// the right edge, with the fade doing the work instead of scale.
export function DesignationHero({
  hero,
  inset,
  intro,
}: {
  hero?: DesignationContent["hero"];
  inset?: DesignationContent["inset"];
  intro?: string;
}) {
  if (!intro && !hero && !inset) return null;
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      {hero ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] max-w-[320px] sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.src}
            alt=""
            aria-hidden
            className="size-full object-contain object-right mix-blend-multiply"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-card from-0% via-card/50 via-20% to-transparent to-55%" />
        </div>
      ) : null}
      <div className="relative flex items-start gap-4 p-4 sm:p-5">
        {inset ? (
          <figure className="hidden w-[104px] shrink-0 flex-col gap-1.5 sm:flex">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={inset.src}
              alt={inset.alt}
              className="w-full rounded-md border border-border object-cover shadow-sm"
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
    </div>
  );
}
