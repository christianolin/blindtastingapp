// The "live now" dot: an alert-red core with a duplicate behind it that
// scales out and fades (dropped under prefers-reduced-motion, dot kept).
export function LiveDot({ size = 7 }: { size?: number }) {
  const dim = { width: size, height: size };
  return (
    <span className="relative inline-flex shrink-0" style={dim} aria-hidden>
      <span className="animate-live-ping absolute inset-0 rounded-full bg-live" />
      <span className="relative rounded-full bg-live" style={dim} />
    </span>
  );
}

// A running tasting nobody is gathered around right now (self-paced, or a
// paused LIVE one): LiveDot's size without the ping, in gold on the bordeaux
// ground (entry-4). Shared by the Overview banner and the header's
// active-tasting strip.
export function StillDot({ size = 7 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 rounded-full bg-gold-light"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
