import Link from "next/link";
import { Eyebrow } from "@/components/overview/eyebrow";
import type { ProfileTastingRow } from "@/lib/profile/profile-view-math";

/**
 * `/u/[id]`'s tastings section (spec §2.5): a laptop table at `xl` and up,
 * phone/tablet cards below it, newest first. The only control on either shape
 * is the row's own name link — no hover-revealed actions (R8).
 */
export function ProfileTastings({
  rows,
  footer,
}: {
  rows: ProfileTastingRow[];
  footer: string;
}) {
  return (
    <section aria-labelledby="profile-tastings" className="flex flex-col gap-3">
      <h2 id="profile-tastings">
        <Eyebrow size="lg">Tastings</Eyebrow>
      </h2>

      {/* Laptop table (xl and up) */}
      <div className="hidden overflow-hidden rounded-xl border border-border xl:block">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Tastings, newest first</caption>
          <colgroup>
            <col />
            <col className="w-[11rem]" />
            <col className="w-[8rem]" />
            <col className="w-[5rem]" />
            <col className="w-[9rem]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Tasting</th>
              <th className="px-4 py-3 font-medium">Host</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 text-right font-medium">Wines</th>
              <th className="px-4 py-3 text-right font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-2">
                  <Link href={row.href} className="flex min-h-11 min-w-0 flex-col justify-center">
                    <span className="block truncate font-medium">{row.name}</span>
                    {row.modeNote ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.modeNote}
                      </span>
                    ) : null}
                  </Link>
                </td>
                <td className="truncate px-4 py-2 text-muted-foreground">{row.host}</td>
                <td className="px-4 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                  {row.date}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{row.wines}</td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums">{row.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone and tablet cards (below xl) */}
      <div className="flex flex-col gap-2 xl:hidden">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={row.href}
            className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/30"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{row.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {row.phoneMeta}
              </span>
            </span>
            <span className="shrink-0 text-right text-sm">
              <span className="font-semibold tabular-nums">{row.result}</span>
              <span className="block text-xs text-muted-foreground">{row.phoneBottom}</span>
            </span>
          </Link>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{footer}</p>
    </section>
  );
}
