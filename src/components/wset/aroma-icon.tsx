import { iconForTerm } from "@/lib/wset/aroma-icons.mjs";

// A small colour icon for an aroma/flavour term pill (a yellow lemon beside
// "lemon"). Decorative — alt="" so the visible term text stays the label — and a
// fixed size so it never shifts layout. Resolves the vendored Twemoji SVG via the
// term->slug map, with a per-family cue for terms that have no clean emoji.
export function AromaIcon({
  term,
  family,
  size = 15,
}: {
  term: string;
  family: string;
  size?: number;
}) {
  const slug = iconForTerm(term, family);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/emoji/${slug}.svg`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      style={{ flexShrink: 0, display: "block" }}
    />
  );
}
