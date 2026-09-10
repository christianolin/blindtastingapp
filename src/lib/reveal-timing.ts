// Timing instrumentation for the progressive reveal.
//
// Two complaints to separate: the host's click not feeling seamless, and
// participants seeing the category land late. Those have different causes —
// the host waits on the server action plus the re-render it triggers, while a
// participant waits on a Realtime event, a debounce, the same re-render, and
// the transfer of the result. One number cannot tell them apart, so this
// measures both ends plus where the server render actually spends its time.
//
// Server timings log unconditionally, one line per phase, so they land in the
// hosting logs without anyone needing devtools open during a real tasting.
// Client timings are gated behind ?debugReveal=1 — the same escape-hatch
// pattern the wine map uses for ?debugFills=off and ?debugClick=1.

const PREFIX = "[reveal-timing]";

/**
 * Time one server-side phase. Logs `<label> <ms>` and returns the result, so
 * it can wrap an existing await without restructuring the call site.
 */
export async function timePhase<T>(
  label: string,
  work: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    const ms = Math.round(performance.now() - started);
    console.log(`${PREFIX} ${label} ${ms}ms`);
  }
}

/**
 * Whether the client should report reveal timings to the console.
 * Off unless ?debugReveal=1 is on the URL, so normal players see nothing.
 */
export function revealDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("debugReveal") === "1";
  } catch {
    return false;
  }
}

/** Report a client-side reveal timing, if the debug flag is on. */
export function logClientTiming(label: string, ms: number): void {
  if (!revealDebugEnabled()) return;
  console.log(`${PREFIX} ${label} ${Math.round(ms)}ms`);
}
