import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

// Numbered pagination with prev/next. `hrefFor(page)` builds each link so the
// caller owns the URL shape (?page= etc.).
function pageList(page: number, count: number): (number | "ellipsis")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out: (number | "ellipsis")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(count - 1, page + 1);
  if (from > 2) out.push("ellipsis");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < count - 1) out.push("ellipsis");
  out.push(count);
  return out;
}

const cell =
  "flex size-9 items-center justify-center rounded-md text-sm transition-colors";

export function Pagination({
  page,
  pageCount,
  hrefFor,
  className,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav
      data-slot="pagination"
      className={cn("flex items-center justify-center gap-1", className)}
    >
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} aria-label="Previous" className={cn(cell, "hover:bg-muted")}>
          <ChevronLeft className="size-4" />
        </Link>
      ) : (
        <span className={cn(cell, "text-muted-foreground/40")}>
          <ChevronLeft className="size-4" />
        </span>
      )}
      {pageList(page, pageCount).map((p, i) =>
        p === "ellipsis" ? (
          <span key={`gap-${i}`} className={cn(cell, "text-muted-foreground")}>
            …
          </span>
        ) : (
          <Link
            key={p}
            href={hrefFor(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              cell,
              p === page
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            {p}
          </Link>
        ),
      )}
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} aria-label="Next" className={cn(cell, "hover:bg-muted")}>
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className={cn(cell, "text-muted-foreground/40")}>
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}
