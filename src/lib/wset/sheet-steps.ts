// The footer's one step in a sheet that shows one section at a time (the WSET
// note sheet, the admin typical-wine editor): forward while a section lies
// ahead, back from the last one, nothing when there is only one. The tabs in
// the sticky bar still jump anywhere. Pure, no imports, so vitest loads it.

export type SheetStep<Id extends string> = { id: Id; forward: boolean };

export function footerStep<Id extends string>(order: readonly Id[], active: Id): SheetStep<Id> | null {
  const at = order.indexOf(active);
  if (at < order.length - 1) return { id: order[at + 1], forward: true };
  if (at > 0) return { id: order[at - 1], forward: false };
  return null;
}
