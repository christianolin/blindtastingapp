import { notFound } from "next/navigation";
import { RecordGlass } from "../../record/record-glass";
import { RecordView } from "../../record/record-view";

// S13c (spec §11.3 items 18-19; BT-R5). Two renderings of the same data live
// at this one route, picked by CSS breakpoint alone — no client state: a
// phone (`<lg`) gets RecordGlass's own full page; a laptop (`lg:` and up)
// gets the plain record list with this glass expanded in place
// (`record-view.tsx`'s `expandedGlass`), which is "RecordView expands a
// laptop row in place with layout='inline'" from the spec. Both branches
// apply the exact same "revealed glasses only" gate (record-glass.tsx,
// record-view.tsx), so an invalid or never-revealed glass number 404s
// regardless of which branch a given viewport renders.
export default async function GlassResultPage({
  params,
}: {
  params: Promise<{ id: string; glass: string }>;
}) {
  const { id: tastingId, glass } = await params;
  const glassNumber = Number(glass);
  if (!Number.isInteger(glassNumber) || glassNumber < 1) notFound();

  return (
    <>
      <div className="lg:hidden">
        <RecordGlass tastingId={tastingId} glass={glassNumber} layout="page" />
      </div>
      <div className="hidden lg:block">
        <RecordView tastingId={tastingId} expandedGlass={glassNumber} />
      </div>
    </>
  );
}
