import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { TRAINING_COPY, coverageLine } from "@/lib/training/copy";
import {
  coverageCountries,
  readTrainingGrapes,
  readTrainingHistory,
  readTrainingPool,
  readTrainingTally,
} from "@/lib/training/pool";
import type { AromaTerm } from "@/lib/wset/types";
import { TrainingRoom } from "./training-room";

export const metadata = { title: `${TRAINING_COPY.appBarTitle} · Blindr` };

// The training room (training-room spec §3, §8): a pillar page — the app bar,
// then one client component with the landing, a session and the result. The
// pool, the grapes (Your call's "Other grape…"), the aroma lexicon, the first
// history page and the tally are read here, as the viewer; nothing about a
// session is on the server before its reveal.
export default async function TrainingRoomPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [candidates, grapes, termRes, history, tally] = await Promise.all([
    readTrainingPool(supabase),
    readTrainingGrapes(supabase),
    supabase
      .from("wset_aroma_terms")
      .select("id, family, origin, group_name, term, sort_order")
      .order("sort_order"),
    readTrainingHistory(supabase, user.id),
    readTrainingTally(supabase, user.id),
  ]);
  const terms: AromaTerm[] = (termRes.data ?? []).map((t) => ({
    id: t.id,
    family: t.family,
    origin: t.origin,
    groupName: t.group_name,
    term: t.term,
    sortOrder: t.sort_order,
  }));

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader title={TRAINING_COPY.appBarTitle} />
      <main className="flex w-full max-w-[1500px] flex-1 flex-col p-[14px] md:p-8">
        <TrainingRoom
          userId={user.id}
          candidates={candidates}
          grapes={grapes}
          terms={terms}
          history={history}
          tally={tally}
          coverage={coverageLine(coverageCountries(candidates), candidates.length)}
        />
      </main>
    </div>
  );
}
