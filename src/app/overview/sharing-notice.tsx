"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { dismissSharingNotice } from "@/lib/sharing/actions";
import { SHARING_NOTICE, sharingNoticeHiddenKey, type SharingNoticeCopy } from "@/lib/sharing/notice";
import { readFlag, writeFlag } from "@/lib/safe-storage";

const noopSubscribe = () => () => {};
const tabStorage = () => window.sessionStorage;

/**
 * The one-time sharing notice (sharing-defaults spec 2026-09-27 S4, S15,
 * §7.5): a quiet bordered card, first in /overview's <main> at every width.
 * `copy` arrives already chosen by sharingNoticeCopy from the current
 * settings. "Got it" hides it at once; the settings link navigates away.
 * Both stamp dismissed_at through dismissSharingNotice, so it never shows
 * again on any device, and both set a per-tab flag, so a failed write (or a
 * back navigation to a cached page) keeps it hidden for the rest of the visit.
 */
export function SharingNotice({ userId, copy }: { userId: string; copy: SharingNoticeCopy }) {
  const key = sharingNoticeHiddenKey(userId);
  const hiddenThisVisit = useSyncExternalStore(noopSubscribe, () => readFlag(tabStorage, key), () => false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || hiddenThisVisit) return null;

  function remember() {
    writeFlag(tabStorage, key);
    void dismissSharingNotice();
  }

  return (
    <section
      aria-labelledby="sharing-notice-title"
      className="flex flex-col gap-2 rounded-[13px] border border-border bg-card p-[16px_18px]"
    >
      <Eyebrow size="sm">{SHARING_NOTICE.eyebrow}</Eyebrow>
      <h2 id="sharing-notice-title" className="font-heading text-lg leading-snug font-semibold">
        {copy.title}
      </h2>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Link
          href={SHARING_NOTICE.href}
          onClick={remember}
          className="inline-flex min-h-11 items-center rounded-[9px] border border-border bg-background px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted md:pointer-fine:min-h-9"
        >
          {copy.cta}
        </Link>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            remember();
          }}
          className="inline-flex min-h-11 items-center rounded-[9px] px-4 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground md:pointer-fine:min-h-9"
        >
          {SHARING_NOTICE.dismiss}
        </button>
      </div>
    </section>
  );
}
