import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fixtureAllowed } from "./guards";
import { coerceLabelRead } from "./label-read-schema";
import type { LabelReadOutcome } from "./extract";

// The LABEL_READ_FIXTURE dev switch (spec §A.6, D1). Outside production, and only
// when the variable names a JSON file, readLabel replays that recorded LabelRead
// instead of calling the API. It is checked before the SDK client is constructed.
// A fixture file is exactly a stored `label_reads.read`; its reads are kept with
// model "fixture" and zero tokens. A missing file throws: loud, and only possible
// in development.
export async function labelReadFixture(): Promise<LabelReadOutcome | null> {
  // fixtureAllowed(env) = env.NODE_ENV !== "production" && Boolean(env.LABEL_READ_FIXTURE)
  if (!fixtureAllowed(process.env)) return null;
  const file = process.env.LABEL_READ_FIXTURE!;
  const read = coerceLabelRead(JSON.parse(await readFile(path.resolve(process.cwd(), file), "utf8")));
  const usage = { input_tokens: 0, output_tokens: 0 };
  return read.isWineLabel
    ? { ok: true, read, model: "fixture", usage }
    : { ok: false, reason: "not-a-label", read, model: "fixture", usage };
}
