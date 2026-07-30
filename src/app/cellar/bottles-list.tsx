import Link from "next/link";

export type LotRow = {
  id: string;
  bottleSizeMl: number;
  quantity: number;
  pricePerBottle: number | null;
  currency: string;
  drinkFrom: number | null;
  drinkTo: number | null;
  storageLocation: string | null;
};

export type LotGroup = {
  catalogWineId: string;
  title: string;
  totalQuantity: number;
  lots: LotRow[];
};

function formatSize(ml: number): string {
  if (ml === 375) return "375 ml";
  if (ml === 750) return "750 ml";
  if (ml % 1000 === 0) return `${ml / 1000} L`;
  return `${ml} ml`;
}

function drinkWindow(from: number | null, to: number | null): string | null {
  if (from == null && to == null) return null;
  return `drink ${from ?? "?"}\u2013${to ?? "?"}`;
}

export function BottlesList({
  groups,
  readOnly = false,
}: {
  groups: LotGroup[];
  readOnly?: boolean;
}) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="font-heading text-lg font-medium">Your cellar is empty</p>
        <p className="text-sm text-muted-foreground">
          Add the wines you own to track bottles, drink windows and value.
        </p>
        <Link
          href="/cellar/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Add a wine
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.catalogWineId} className="rounded-xl border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-heading font-medium">{g.title}</h3>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {g.totalQuantity} btl
            </span>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {g.lots.map((lot) => {
              const window = drinkWindow(lot.drinkFrom, lot.drinkTo);
              return (
                <li
                  key={lot.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-muted-foreground">
                    {lot.quantity}
                    {"\u00d7 "}
                    {formatSize(lot.bottleSizeMl)}
                    {window ? ` \u00b7 ${window}` : ""}
                    {lot.storageLocation ? ` \u00b7 ${lot.storageLocation}` : ""}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    {lot.pricePerBottle != null ? (
                      <span className="tabular-nums text-muted-foreground">
                        {lot.pricePerBottle} {lot.currency}
                      </span>
                    ) : null}
                    {!readOnly ? (
                      <>
                        <Link
                          href={`/cellar/${lot.id}/drink`}
                          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Drink
                        </Link>
                        <Link
                          href={`/cellar/${lot.id}/edit`}
                          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Edit
                        </Link>
                      </>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
