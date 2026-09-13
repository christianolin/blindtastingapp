import { cn } from "@/lib/utils";
import { getCurrentUser, getTastingRow } from "@/lib/tasting-request-cache";
import { START_CAPTION } from "@/lib/lobby-copy";
import { HostControls } from "./host-controls";

// Start's presentation (spec §3.3 item 7, LOBBY-14, LOBBY-26, XCUT-21):
// HostControls carries the form, its pending/result state and where Start
// lands; this wraps it in the gold button and caption on laptops, and in a
// bottom-pinned bar on phones. Host-only — self-fetches like every other
// lobby card, so callers mount it unconditionally.
//
// HostControls' own submit Button is restyled through the wrapper
// (`[&_button[type=submit]]`) rather than a fork of the shared control —
// the same technique by-hand-form.tsx's `PICKER` const uses on a combobox
// trigger — so host-controls.tsx needs no styling change here, only BT-L2's
// one deletion of its now-dead running-menu prop.
const GOLD_START = cn(
  "[&_button[type=submit]]:border-gold-deep [&_button[type=submit]]:bg-gold",
  "[&_button[type=submit]]:text-foreground [&_button[type=submit]]:shadow-[0_2px_0_0_rgba(42,33,30,.18)]",
  "[&_button[type=submit]]:hover:bg-gold-deep",
  "[&_button[type=submit]]:active:shadow-[0_1px_0_0_rgba(42,33,30,.18)]",
);

export async function StartBar({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element | null> {
  const [user, tasting] = await Promise.all([getCurrentUser(), getTastingRow(tastingId)]);
  if (!user || !tasting) return null;
  if (tasting.host_id !== user.id) return null;

  const controls = (
    <HostControls
      tastingId={tastingId}
      status={tasting.status}
      // All three, so Start can decide where it lands (reveal-5): only a LIVE
      // blind host-provides host goes to the console.
      timingMode={tasting.timing_mode}
      revealMode={tasting.reveal_mode}
      wineSource={tasting.wine_source}
      surface="start"
    />
  );

  return (
    <>
      {/* Laptop: inline, below the Wines card. */}
      <div className={cn("hidden flex-col gap-2 lg:flex", GOLD_START)}>
        {controls}
        {tasting.status === "DRAFT" ? (
          <p className="text-xs text-muted-foreground">{START_CAPTION}</p>
        ) : null}
      </div>

      {/* Phone: pinned to the bottom, reachable one-handed (LOBBY-26). Only
          while DRAFT — once started, HostControls itself renders nothing on
          a fresh load, so an empty bar would otherwise linger. */}
      {tasting.status === "DRAFT" ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card p-3",
            "pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden",
            GOLD_START,
          )}
        >
          {controls}
        </div>
      ) : null}
    </>
  );
}
