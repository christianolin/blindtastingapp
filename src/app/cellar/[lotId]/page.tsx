// Legacy lot route → the Bottles frame's `?lot=` sheet (CC-X2, spec D6, §3).
//
// The lot sheet is a client sheet over `/cellar` now; this route reads
// nothing and does no auth check of its own — `/cellar`'s own page redirects
// a signed-out visitor to `/login`, so this stays a pure redirect. A `lotId`
// that is not a UUID redirects to plain `/cellar` instead of forwarding an
// arbitrary string into the frame's query parser.

import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LotRedirectPage({
  params,
}: {
  params: Promise<{ lotId: string }>;
}) {
  const { lotId } = await params;
  if (!UUID.test(lotId)) redirect("/cellar");
  redirect(`/cellar?lot=${lotId}`);
}
