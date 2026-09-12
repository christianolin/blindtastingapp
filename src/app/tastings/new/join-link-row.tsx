"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getJoinLink } from "./actions";

type LinkState = { url: string; code: string } | "loading" | { error: string };

/**
 * The share link (spec §D.1 #2, create-2): the join URL from getJoinLink
 * (`ensure_join_code` is host-only and returns the same code every time) with
 * a clipboard Copy. One row for both places a host shares it — step 3 of the
 * create sheet and the draft lobby's host controls.
 *
 * `worksUntilStart` adds the hint for tastings whose link stops working at
 * Start: `join_tasting_by_code` refuses every started tasting except an OPEN
 * one, so only an OPEN tasting's link stays good while it runs.
 */
export function JoinLinkRow({
  tastingId,
  worksUntilStart,
  className,
}: {
  tastingId: string;
  worksUntilStart: boolean;
  className?: string;
}) {
  const [link, setLink] = useState<LinkState>("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
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
  }, [tastingId]);

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
        "flex items-center gap-3 rounded-[11px] border border-border bg-white p-[13px_15px]",
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
        {worksUntilStart ? (
          <span className="text-[11.5px] text-muted-foreground">
            Works until you start the tasting.
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        disabled={link === "loading" || "error" in link}
        className="ml-auto min-h-11 shrink-0 rounded-[8px] border border-border bg-background px-[14px] py-[9px] text-[12.5px] font-semibold text-primary transition-colors hover:border-gold hover:bg-white disabled:opacity-60 md:min-h-0"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
