"use client";

export type PyramidBand = {
  key: string;
  label: string;
  count: string;
  color: string;
  textColor?: string;
  /** Short ordinal marker (e.g. "1er") shown ahead of the label. */
  rank?: string;
};

// Shared quality-pyramid: horizontal bands that widen downward with the tier
// label + count set inside each band. Clicking a band calls onSelect(key);
// activeKey highlights the selected band (null = none highlighted).
export function PyramidBands({
  bands,
  activeKey,
  onSelect,
}: {
  bands: PyramidBand[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      {bands.map((b, i) => {
        const width =
          bands.length === 1
            ? 70
            : 46 + (48 * i) / Math.max(bands.length - 1, 1);
        const isActive = activeKey === b.key;
        return (
          <button
            key={b.key}
            type="button"
            onClick={() => onSelect(b.key)}
            style={{
              width: `${width}%`,
              // A narrow top band would otherwise wrap a long tier name onto a
              // second line ("Premier Grand Cru Classé A") — let the band grow
              // past its share of the pyramid rather than break the label.
              minWidth: "fit-content",
              backgroundColor: b.color,
              color: b.textColor ?? "#ffffff",
              outline: isActive ? "2px solid #2b0f18" : "2px solid transparent",
              outlineOffset: "2px",
            }}
            className="flex items-center justify-between gap-3 rounded-md px-4 py-3 font-heading whitespace-nowrap transition-transform hover:-translate-y-px"
          >
            <span className="flex items-center gap-2">
              {b.rank ? (
                <span className="rounded bg-white/15 px-1.5 py-0.5 text-[0.7rem] font-semibold">
                  {b.rank}
                </span>
              ) : null}
              <span className="font-semibold">{b.label}</span>
            </span>
            <span className="text-xs opacity-90">{b.count}</span>
          </button>
        );
      })}
    </div>
  );
}
