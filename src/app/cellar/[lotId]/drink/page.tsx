// Legacy drink route → the Bottles frame's `?lot=…&do=drink` sheet (CC-X2,
// spec D6, §3). See `../page.tsx` for the redirect rationale; `actions.ts`
// (`consumeLot`) is untouched — `DrinkSheet` (CC-U5) still imports it.

import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DrinkLotRedirectPage({
  params,
}: {
  params: Promise<{ lotId: string }>;
}) {
  const { lotId } = await params;
  if (!UUID.test(lotId)) redirect("/cellar");
  redirect(`/cellar?lot=${lotId}&do=drink`);
}
