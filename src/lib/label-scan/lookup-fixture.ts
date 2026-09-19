import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { coerceLookupAnswer, type AppellationLookupOutcome } from "./appellation-lookup-schema";
import { lookupFixtureAllowed } from "./guards";

// The LABEL_LOOKUP_FIXTURE dev switch (owner fix C, 2026-09-19; spec §6.5), the
// follow-up lookup's twin of fixture.ts. Outside production, and only when the
// variable names a JSON file, lookupAppellation replays that recorded structured
// output instead of calling the API. It is checked before the SDK client is
// constructed. A fixture file is exactly a parsed output, `{ "appellation":
// "Castilla y Leon" }` or `{ "appellation": null }`; its replays are kept in
// label_lookups with model "fixture" and zero tokens. A missing file throws:
// loud, and only possible in development.
export async function labelLookupFixture(): Promise<AppellationLookupOutcome | null> {
  if (!lookupFixtureAllowed(process.env)) return null;
  const file = process.env.LABEL_LOOKUP_FIXTURE!;
  // Dev only, so Turbopack need not trace the project for it.
  const raw: unknown = JSON.parse(await readFile(path.resolve(/*turbopackIgnore: true*/ process.cwd(), file), "utf8"));
  return { ok: true, answer: coerceLookupAnswer(raw), model: "fixture", usage: { input_tokens: 0, output_tokens: 0 } };
}
