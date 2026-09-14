"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { LINK_WORKS_UNTIL_END } from "@/lib/lobby-copy";
import { getJoinLink } from "./actions";

type LinkState = { url: string; code: string } | "loading" | { error: string };

/**
 * The share link (spec §D.1 #2, create-2): the join URL from getJoinLink
 * (`ensure_join_code` is host-only and returns the same code every time) with
 * a clipboard Copy. One row for both places a host shares it — step 3 of the
 * create sheet and the draft lobby's host controls.
 *
 * `showExpiryHint` shows the hint that the link works until the tasting ends
 * (B4/Q6: `join_tasting_by_code` now refuses only CLOSED, so every tasting's
 * link stays good for as long as the tasting itself does — the hint is no
 * longer conditional on mode, just occasionally redundant with context
 * already on screen). Defaults to true.
 *
 * `active` holds the fetch back until the row is really shown. The lobby's
 * host menu is a keep-mounted popover, so its row mounts with the page while
 * the menu is still closed; fetching on mount there would call
 * `ensure_join_code` (a write, the first time) on every host page view.
 */
export function JoinLinkRow({
  tastingId,
  showExpiryHint = true,
  active = true,
  className,
}: {
  tastingId: string;
  showExpiryHint?: boolean;
  /** Fetch the link only once this is true, and keep it true after that.
      Defaults to fetching on mount (step 3 of the create sheet). */
  active?: boolean;
  className?: string;
}) {
  const [link, setLink] = useState<LinkState>("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    getJoinLink(tastingId)
      .then((r) => {
        if (!cancelled) setLink(r);
      })
      .catch(() => {
        if (!cancelled) setLink({ error: "Couldn't create a join link." });
      });
    return () => {
      cancelled = true;
    };
  }, [tastingId, active]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    if (typeof link !== "object" || !("url" in link)) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused (insecure context, permissions) —
      // the link is still on screen to copy by hand.
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[11px] border border-input bg-card p-[13px_15px]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-[2px]">
        <span className="text-[13.5px] font-semibold">Or share a link</span>
        <span className="truncate font-mono text-[12px] text-muted-foreground">
          {link === "loading"
            ? "Making a link…"
            : "error" in link
              ? link.error
              : link.url.replace(/^https?:\/\//, "")}
        </span>
        {showExpiryHint ? (
          <span className="text-[11.5px] text-muted-foreground">
            {LINK_WORKS_UNTIL_END}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        disabled={link === "loading" || "error" in link}
        className="ml-auto min-h-11 shrink-0 rounded-[8px] border border-border bg-background px-[14px] py-[9px] text-[12.5px] font-semibold text-primary transition-colors hover:border-gold hover:bg-card disabled:opacity-60 md:pointer-fine:min-h-0"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
