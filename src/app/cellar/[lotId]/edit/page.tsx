// Legacy edit route → the Bottles frame's `?lot=…&do=edit` sheet (CC-X2,
// spec D6, §3). See `../page.tsx` for the redirect rationale. The old
// `EditLotForm` and the curator retail-price editor (`WinePriceField`,
// D13) are deleted with this route — `LotSheet`'s own edit mode (CC-U4)
// replaces both.

import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditLotRedirectPage({
  params,
}: {
  params: Promise<{ lotId: string }>;
}) {
  const { lotId } = await params;
  if (!UUID.test(lotId)) redirect("/cellar");
  redirect(`/cellar?lot=${lotId}&do=edit`);
}
