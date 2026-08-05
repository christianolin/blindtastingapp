import type { DesignationContent } from "@/lib/designations/content";

// Intro band for a classification. Like the overview hero, the imagery sits on
// the page rather than inside a card: it bleeds past the page padding and
// dissolves into the parchment (`mix-blend-multiply` drops the photos' white
// studio/paper grounds), so nothing reads as a pasted-in box.
//
// The source images are small (a few hundred pixels), so they're capped near
// their natural size and anchored to the edges — the fade carries the width,
// not scale.
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
    <section className="relative -mx-6 overflow-hidden sm:-mx-8 sm:min-h-[210px]">
      {hero ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] max-w-[300px] sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.src}
            alt=""
            aria-hidden
            className="size-full object-contain object-right mix-blend-multiply"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background from-0% via-background/45 via-25% to-transparent to-60%" />
        </div>
      ) : null}
      <div className="relative flex items-center gap-5 px-6 py-5 sm:px-8">
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
    </section>
  );
}
