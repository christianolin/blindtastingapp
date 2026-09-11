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
