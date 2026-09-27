"use client";

import { useCallback, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { X } from "lucide-react";
import { makeT } from "@/lib/wset/i18n";
import { useWsetLang } from "@/lib/wset/wset-lang";
import { footerStep } from "@/lib/wset/sheet-steps";
import { Eyebrow } from "@/components/overview/eyebrow";
import { PHONE_HIT_44 } from "./pill-group";
import { cn } from "@/lib/utils";

// The WSET sheet's frame, shared by the note sheet (WsetSheet) and the admin
// typical-wine editor: the sticky bar (close, title, EN/DA, section tabs), one
// section on screen at a time, the footer (progress, the section step, Save)
// and the discard confirm. Moved out of wset-sheet.tsx unchanged — the note
// sheet's markup is pinned by sheet-markup.test.tsx.

// The bordeaux primary button, as on every other 2026-09 surface: radius 9–11,
// the ink under-shadow, the one allowed hover literal.
export const PRIMARY_BUTTON =
  "bg-primary text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] hover:bg-primary-hover";

/** The Taste & Rate note popup: full-screen on phones, a wide card from sm up
    (the .wset-sheet desktop scale in globals.css enlarges its type to match).
    The admin typical-wine editor opens in the same popup. */
export const SHEET_DIALOG_CLASS =
  "inset-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[92vh] sm:max-h-[92vh] sm:w-[calc(100vw-3rem)] sm:max-w-[1100px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:gap-4 sm:rounded-[16px] lg:max-w-[1400px]";

/** One section on screen at a time, at every breakpoint: the tabs and the
    footer's step switch it. In a dialog (`embedded`) the sections scroll inside
    `scrollRef` and a switch resets that scroll; on a page the new section is
    scrolled in under the bar. */
export function useSheetSteps<Id extends string>(order: readonly Id[], embedded: boolean) {
  const [active, setActive] = useState<Id>(order[0]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const goTo = useCallback(
    (id: Id) => {
      setActive(id);
      // After the hidden card mounts: in the modal just reset the inner
      // scroll; on the page line the card up under the bar.
      requestAnimationFrame(() => {
        if (scrollRef.current && embedded) {
          scrollRef.current.scrollTo({ top: 0 });
        } else {
          document.getElementById(id)?.scrollIntoView();
        }
      });
    },
    [embedded],
  );
  return { active, goTo, step: footerStep(order, active), scrollRef };
}

/** The sheet's root: `.wset-sheet` carries the sheet's scale (globals.css). */
export function SheetFrame({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "wset-sheet min-w-0",
        embedded && "flex min-h-0 flex-1 flex-col",
      )}
      style={{ color: "var(--foreground)" }}
    >
      {children}
    </div>
  );
}

/** The sticky bar: SheetHeaderRow, SheetTabs and an optional strip under them. */
export function SheetBar({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "sticky z-30 mb-4 py-2.5 sm:py-3",
        // Full-bleed on phones so the bar spans the whole screen like a real
        // app header. A modal is a full-screen box with a known p-4, so a
        // plain -mx-4 reaches the edges without any viewport math (the 50vw
        // calc misbehaves inside the fixed, scrolling modal); the note page,
        // whose nesting/padding is unknown, uses the viewport calc.
        // In the modal the bar must own the very top: the dialog's p-4 left
        // a gap the content scrolled past, so the "sticky" header looked
        // detached. Negative margins cancel that padding on every side and
        // the top corners take over the dialog's own radius.
        embedded
          ? "-mx-4 -mt-4 px-4 sm:rounded-t-[16px] sm:px-6"
          : "max-sm:mx-[calc(50%-50vw)] max-sm:px-4 sm:px-1",
      )}
      style={{
        // On the page the bar tucks under the app header, overlapping its
        // 1 px border: --app-header-h is the header's height at each width
        // (globals.css; 53 px on phones, 57 px from md). From 1024 px the whole
        // sheet is zoomed (.wset-sheet, --wset-zoom) and zoom scales this
        // offset too — a bare 56 stuck at ~64 px and left a strip the form
        // showed through (owner, 2026-09-27) — so it is divided back out.
        top: embedded ? 0 : "calc((var(--app-header-h, 57px) - 1px) / var(--wset-zoom, 1))",
        // Solid in both places so nothing ghosts through: card-cream in the
        // modal, the page background on the page (it was a 94% blur, which
        // let the form show through the bar as it scrolled under it).
        background: embedded ? "var(--card)" : "var(--background)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {children}
    </div>
  );
}

/** The bar's first line. Desktop: eyebrow + title … EN/DA · Close · trailing.
    Phones: ✕ · title over the progress … EN/DA · trailing. Without `onClose`
    there is no ✕ and no Close. */
export function SheetHeaderRow({
  eyebrow,
  title,
  titleRef,
  onClose,
  progress,
  trailing,
}: {
  eyebrow: string;
  title: string;
  /** Makes the title focusable (tabIndex -1) and hands it over: the training
      room moves keyboard focus there as a session opens. */
  titleRef?: Ref<HTMLParagraphElement>;
  onClose?: () => void;
  progress: { done: number; total: number };
  /** After Close: the note sheet's ⋯ menu. */
  trailing?: ReactNode;
}) {
  const { lang, setLang } = useWsetLang();
  const t = makeT(lang);
  const { done, total } = progress;
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {onClose ? (
        <button
          type="button"
          aria-label={t("close")}
          onClick={onClose}
          className="-ml-2.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted sm:hidden"
        >
          <X aria-hidden className="size-5" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <Eyebrow size="sm" className="block max-sm:hidden">
          {eyebrow}
        </Eyebrow>
        <p
          ref={titleRef}
          tabIndex={titleRef ? -1 : undefined}
          className="font-heading text-[16px] leading-[1.2] font-semibold text-foreground outline-none max-sm:line-clamp-2 sm:mt-0.5 sm:truncate sm:text-[17px]"
        >
          {title}
        </p>
        {/* Phones carry the progress in the bar; desktop keeps it in the
            footer, beside Save. */}
        <div className="mt-1 flex items-center gap-2 sm:hidden">
          <span aria-hidden className="h-[5px] max-w-[120px] flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full bg-primary" style={{ width: `${donePct}%` }} />
          </span>
          <span className="text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
            {t("assessed_short", { done, total })}
          </span>
        </div>
      </div>
      {/* EN/DA toggle — mirrors the map's; the sheet language is shared and
          persisted, so it also drives the read-only archetype view. */}
      <div className="flex shrink-0 items-center rounded-md border border-border p-0.5 text-[11px]">
        {(["en", "da"] as const).map((lng) => (
          <button
            key={lng}
            type="button"
            onClick={() => setLang(lng)}
            aria-pressed={lang === lng}
            className={cn(PHONE_HIT_44, "rounded px-1.5 py-0.5 font-medium max-sm:min-w-9 max-sm:py-1")}
            style={{
              background: lang === lng ? "var(--primary)" : "transparent",
              color: lang === lng ? "var(--primary-foreground)" : "var(--muted-foreground)",
            }}
          >
            {lng.toUpperCase()}
          </button>
        ))}
      </div>
      {onClose ? (
        // Always "Close": a clean sheet exits, a dirty one asks first (the
        // same path Escape and the modal backdrop take).
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-[8px] border border-border bg-card px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground hover:bg-muted max-sm:hidden"
        >
          {t("close")}
        </button>
      ) : null}
      {trailing}
    </div>
  );
}

export type SheetTab = { id: string; label: string; done: number; total: number };

// Phones get one grid column per tab. Four is the note sheet; five (the
// editor's Wine + I–IV) sets the name a size smaller so "Appearance" fits a
// 360px screen.
const TAB_GRID: Record<number, string> = {
  4: "mt-2 gap-1 max-sm:grid max-sm:grid-cols-4 sm:flex sm:gap-2",
  5: "mt-2 gap-1 max-sm:grid max-sm:grid-cols-5 sm:flex sm:gap-2",
};

/** Section tabs: one section on screen at a time; each tab carries its count
    (✓ once complete). Phones get a grid of 44px targets. */
export function SheetTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly SheetTab[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const dense = tabs.length > 4;
  return (
    <div className={TAB_GRID[tabs.length] ?? TAB_GRID[5]}>
      {tabs.map((s) => {
        const on = s.id === active;
        const complete = s.total > 0 && s.done >= s.total;
        const nameColour = on ? "var(--primary-foreground)" : "var(--foreground)";
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(s.id)}
            className="rounded-[10px] px-0.5 py-[5px] max-sm:min-h-11 sm:inline-flex sm:items-baseline sm:gap-1.5 sm:px-3 sm:py-1.5"
            style={{
              border: "none",
              cursor: "pointer",
              background: on ? "var(--primary)" : "var(--accent)",
            }}
          >
            <span
              className={dense ? "block text-[10px] sm:inline sm:text-[11px]" : "block sm:inline"}
              style={dense ? { fontWeight: 600, color: nameColour } : { fontSize: 11, fontWeight: 600, color: nameColour }}
            >
              {s.label}
            </span>
            <span
              className="block sm:inline"
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: on ? "var(--primary-foreground)" : complete ? "var(--gold-dark)" : "var(--muted-foreground)",
              }}
            >
              {complete ? "✓" : `${s.done}/${s.total}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The sections' column, with the note page's optional lg+ column beside it.
    `column: null` (and always in a dialog): single column. In a dialog the
    sections scroll here, between the pinned bar and footer. */
export function SheetBody({
  embedded,
  column,
  scrollRef,
  children,
}: {
  embedded: boolean;
  column: ReactNode | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const showColumn = !embedded && column !== null;
  return (
    <div
      ref={scrollRef}
      className={cn(
        // grid-cols-1 (=minmax(0,1fr)) so the single column can't be
        // inflated past the container by a card's intrinsic content width —
        // the section boxes stay within the modal's padding on phones.
        "grid grid-cols-1 items-start gap-6",
        showColumn && "lg:grid-cols-[264px_minmax(0,1fr)]",
        // The modal scrolls HERE, between the anchored header and footer.
        embedded && "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4",
      )}
    >
      {showColumn ? (
        <aside className="sticky top-[114px] hidden flex-col gap-4 lg:flex">{column}</aside>
      ) : null}

      <div className="min-w-0" style={{ display: "flex", flexDirection: "column", gap: "var(--wset-gap,18px)" }}>
        {children}
      </div>
    </div>
  );
}

/** The footer: `progress` (desktop) beside the actions. In a dialog it is the
    popup's last row, pinned while the sections scroll; on a page it sticks to
    the viewport bottom. `notice` (a save error) takes a full-width line above,
    at every width. */
export function SheetFooter({
  embedded,
  progress,
  notice,
  children,
}: {
  embedded: boolean;
  progress: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-[9px] sm:gap-3",
        notice ? "flex-wrap" : undefined,
        embedded
          ? "-mx-4 -mb-4 border-t border-border bg-card px-4 pt-[11px] pb-[max(11px,env(safe-area-inset-bottom))] sm:rounded-b-[16px] sm:px-6 sm:py-3"
          : "sticky bottom-0 z-30 mt-6 border-t border-border py-[11px] max-sm:mx-[calc(50%-50vw)] max-sm:px-4 max-sm:pb-[max(11px,env(safe-area-inset-bottom))] sm:px-1 sm:py-3",
      )}
      style={
        embedded
          ? undefined
          : { background: "color-mix(in srgb, var(--background) 94%, transparent)", backdropFilter: "blur(8px)" }
      }
    >
      {notice ? <div className="basis-full">{notice}</div> : null}
      {progress}
      <div className="flex flex-1 items-center gap-[9px] sm:ml-auto sm:flex-none">{children}</div>
    </div>
  );
}

/** Desktop progress: the count set in Cormorant, a caption, an optional line under it. */
export function SheetFooterProgress({ done, caption, note }: { done: number; caption: string; note?: string | null }) {
  return (
    <div className="min-w-0 max-sm:hidden">
      <div className="flex items-baseline gap-[7px]">
        <span className="font-heading text-[22px] leading-none font-semibold text-primary tabular-nums">{done}</span>
        <span className="text-[11.5px] text-muted-foreground">{caption}</span>
      </div>
      {note ? <p className="mt-1 text-[10.5px] leading-[1.45] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** The footer's one step: "Next: Nose →" (phones "Nose →"), or "← Palate" back from the last section. */
export function SheetStepButton({
  section,
  forward,
  onClick,
}: {
  section: string;
  forward: boolean;
  onClick: () => void;
}) {
  const { lang } = useWsetLang();
  const t = makeT(lang);
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-[10px] border border-border bg-background p-[13px] text-[13.5px] font-semibold whitespace-nowrap text-primary hover:bg-muted max-sm:flex-1 sm:min-h-0 sm:rounded-[9px] sm:px-[15px] sm:py-[10px] sm:text-[13px]"
    >
      {forward ? (
        <>
          <span className="sm:hidden">{t("next_section_short", { section })}</span>
          <span className="max-sm:hidden">{t("next_section", { section })}</span>
        </>
      ) : (
        t("prev_section", { section })
      )}
    </button>
  );
}

/** Save: bordeaux, gold with ink once saved (6.5:1, like every bg-gold button). */
export function SheetSaveButton({
  label,
  onClick,
  disabled,
  saved,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  saved: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-h-11 rounded-[10px] p-[13px] text-[14px] font-semibold whitespace-nowrap shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors disabled:opacity-70 max-sm:flex-1 sm:min-h-0 sm:rounded-[9px] sm:px-[19px] sm:py-[11px] sm:text-[13.5px]",
        // Ink on the gold "Saved" fill (6.5:1), like every bg-gold button
        // in the app; parchment is only for text on bordeaux.
        saved ? "bg-gold text-foreground hover:bg-gold-deep" : PRIMARY_BUTTON,
      )}
    >
      {label}
    </button>
  );
}

/** "Discard …?" over the sheet: Keep editing, or Discard. A backdrop tap keeps editing. */
export function DiscardConfirm({
  title,
  body,
  keepLabel,
  discardLabel,
  onKeep,
  onDiscard,
}: {
  title: string;
  body: string;
  keepLabel: string;
  discardLabel: string;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onKeep}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "color-mix(in srgb, var(--foreground) 45%, transparent)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 12px 40px rgba(42,33,30,0.25)",
        }}
      >
        <h3 className="font-heading" style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>
          {title}
        </h3>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: 18 }}>
          {body}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={onKeep}
            className="rounded-[9px] border border-border bg-transparent px-4 py-[9px] text-[13px] font-semibold text-foreground hover:bg-muted max-sm:min-h-11"
          >
            {keepLabel}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className={cn("rounded-[9px] px-4 py-[9px] text-[13px] font-semibold max-sm:min-h-11", PRIMARY_BUTTON)}
          >
            {discardLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
