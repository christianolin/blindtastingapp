import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The Overview's subject card shell (Blind tastings / Your ratings / Your
 * cellar): bordered raised-parchment surface, a header with the title, a link
 * pill and the stat row, a body of rows, and the action pinned to the bottom
 * so the three cards' buttons sit on one line. On phones the card is a
 * `flex-1` column so the three fit one screen.
 */
export function SubjectCard({
  title,
  pill,
  stats,
  children,
  action,
  actionInset = false,
  className,
}: {
  title: string;
  pill?: ReactNode;
  stats?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** Draw the action's top rule inside the body padding (the cellar card). */
  actionInset?: boolean;
  className?: string;
}) {
  return (
    <section
      // Only on phones may the card shrink below its content (`min-h-0`) —
      // that is what lets the three share one screen. From `md` up the card
      // keeps its natural height so a long list makes the page scroll instead
      // of being clipped by overflow-hidden.
      className={cn(
        "flex flex-col overflow-hidden rounded-[13px] border border-border-strong bg-card max-md:min-h-0 max-md:flex-1 max-md:rounded-xl",
        className,
      )}
    >
      <header className="border-b border-border p-[16px_18px_14px] max-md:p-[8px_14px_7px]">
        <div className="flex items-center gap-2.5 max-md:gap-2">
          <h2 className="font-heading text-[23px] leading-none font-semibold max-md:text-[18px]">
            {title}
          </h2>
          {pill ? <div className="ml-auto">{pill}</div> : null}
        </div>
        {stats ? <div className="mt-3 max-md:mt-[9px]">{stats}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {action ? (
        <div
          className={cn(
            "mt-auto border-t border-border",
            actionInset
              ? "mx-[18px] pt-[13px] pb-[14px] max-md:mx-[14px] max-md:border-t-0 max-md:pt-1.5 max-md:pb-2"
              : "p-[14px_18px] max-md:border-t-0 max-md:p-[6px_14px_8px]",
          )}
        >
          {action}
        </div>
      ) : null}
    </section>
  );
}

/**
 * One row inside a subject card: optional thumb, a two-line title/meta block,
 * an optional right-hand value, and either inline actions or a chevron. A
 * link when `href` is given (hover tints the row), a plain row otherwise.
 */
export function CardRow({
  href,
  thumb,
  title,
  meta,
  value,
  actions,
  className,
}: {
  href?: string;
  thumb?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const cls = cn(
    "flex items-center gap-2.5 border-b border-border-light p-[12px_18px] text-foreground max-md:gap-[9px] max-md:p-[9px_14px]",
    href && "transition-colors hover:bg-background",
    className,
  );
  const inner = (
    <>
      {thumb}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 max-md:gap-px">
        <span className="truncate text-[13px] leading-[1.3] font-semibold max-md:text-[12.5px] max-md:leading-[1.25]">
          {title}
        </span>
        {meta ? (
          <span className="truncate text-[11.5px] text-muted-foreground max-md:text-[11px]">
            {meta}
          </span>
        ) : null}
      </span>
      {value}
      {actions ??
        (href ? (
          <span className="text-[15px] leading-none text-placeholder" aria-hidden>
            ›
          </span>
        ) : null)}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** A one-line muted note where a list would be (empty states). */
export function CardEmptyRow({ children }: { children: ReactNode }) {
  return (
    <p className="p-[12px_18px] text-[12.5px] text-muted-foreground italic max-md:p-[9px_14px] max-md:text-[11.5px]">
      {children}
    </p>
  );
}
