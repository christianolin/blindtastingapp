"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAddWine } from "@/components/add-wine-context";

/**
 * Catalog dedupe (owner, 2026-10-03): `/catalog/new` and `/cellar/new` used to
 * render their own forms, which created catalog wines without ever asking
 * "Already in the catalog?". They are only reached by a typed or bookmarked URL
 * now (the nav opens the sheet), so they open the same add-wine sheet — the one
 * place every new catalog wine is checked — over the list they belong to, the
 * way `/tastings/[id]/wines/new` hands off to the tasting page's sheet.
 */
export function OpenSheetOnLoad({ kind, back, backLabel }: { kind: "catalog" | "cellar"; back: string; backLabel: string }) {
  const { openAddWine } = useAddWine();
  const router = useRouter();
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    openAddWine(kind);
    router.replace(back);
  }, [openAddWine, kind, back, router]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-6">
      <Link href={back} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        {backLabel}
      </Link>
    </div>
  );
}
