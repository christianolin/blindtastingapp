import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/overview/eyebrow";
import { SHARED_NOTES_COPY } from "@/lib/notes/shared-notes-view";
import type { NoteReadSection } from "@/lib/notes/note-read";

export type NoteReadViewProps = {
  wineId: string;
  wineTitle: string;
  author: { id: string; name: string; avatarUrl: string | null };
  /** "Tasted 27 Sep 2026". */
  tastedLine: string;
  /** "Blind", "Training", or none. */
  badge: string | null;
  /** "91 · Outstanding", or "Not scored". */
  score: string;
  sections: NoteReadSection[];
};

/**
 * Someone else's note, read-only (sharing-defaults spec 2026-09-27 S17,
 * §7.4): the wine, who tasted it and when, the score, and the note's composed
 * prose section by section. A server component — nothing but these strings
 * reaches the browser. It never shows the tasting, the glass, or any edit,
 * delete or share control.
 */
export function NoteReadView({ wineId, wineTitle, author, tastedLine, badge, score, sections }: NoteReadViewProps) {
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <Eyebrow size="lg">{SHARED_NOTES_COPY.readEyebrow}</Eyebrow>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          <Link href={`/catalog/${wineId}`} className="hover:underline">
            {wineTitle}
          </Link>
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <Link
            href={`/u/${author.id}`}
            className="inline-flex min-h-11 items-center gap-2 font-medium text-foreground hover:underline md:pointer-fine:min-h-0"
          >
            {author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={author.avatarUrl} alt="" className="size-6 rounded-full object-cover ring-1 ring-border" />
            ) : (
              <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-secondary text-[11px]">
                {author.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            {author.name}
          </Link>
          <span>· {tastedLine}</span>
          {badge ? (
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {badge}
            </Badge>
          ) : null}
        </p>
      </header>

      <p className="font-heading text-2xl font-semibold tabular-nums">{score}</p>

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">{SHARED_NOTES_COPY.nothingRecorded}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {sections.map((section) => (
            <section key={section.caption}>
              <h2>
                <Eyebrow>{section.caption}</Eyebrow>
              </h2>
              <p className="mt-1 font-heading text-[15px] leading-relaxed italic">{section.prose}</p>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
