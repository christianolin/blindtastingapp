// Stage the US-2 DRAFT boundaries (spec 2026-09-29 §8.2). Modelled on
// stage-germany-weinbau.mjs, with one transaction for the whole wave.
//
//   node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us2
//     DEFAULT, dry: begin; the catalog and knowledge migrations applied inside
//     the transaction if they are not recorded live yet; every boundary built
//     and asserted; rollback. Writes nothing, and never touches Storage.
//   node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us2 --check-gate
//     Read-only: prints every reason --stage would refuse right now, and exits
//     1 if there is any. Never uploads, never writes.
//   node --env-file=.env.local scripts/wine-map-sources/stage-usa-ava.mjs --wave us2 --stage
//     THE SITTING ONLY (main session): refuses unless sittingGate() is empty;
//     uploads the four raw UC Davis files (idempotent by sha256); begin;
//     stageWave; commit; warns that the neighbour cache is stale until the
//     promote's refresh.
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { attributionKeyFor, releaseVersion, sha256hex, SUPABASE_URL } from "../wine-map-tiles/lib.mjs";
import { buildReports, loadInputs, reportPath, STATE_FILES } from "./build-usa-tree-reports.mjs";
import { warnIfNeighbourCacheStale } from "./neighbour-cache.mjs";
import { buildUsaTree } from "./usa-tree.mjs";
import {
  loadStageInputs, NE_NAMESPACE, readGateFacts, sittingGate, stageWave, UCD_NAMESPACE, uploadDecision,
} from "./usa-stage-lib.mjs";
import { loadTrees, us2Wave, US2_FILES, US2_VERSIONS } from "../usa-map/us2-wave.mjs";

const argv = process.argv.slice(2);
const waveArg = argv[argv.indexOf("--wave") + 1];
if (!argv.includes("--wave") || waveArg !== "us2") {
  console.error("usage: stage-usa-ava.mjs --wave us2 [--check-gate | --stage]");
  process.exit(2);
}
const STAGE = argv.includes("--stage");
const CHECK_GATE = argv.includes("--check-gate");
if (STAGE && CHECK_GATE) { console.error("--stage and --check-gate are exclusive"); process.exit(2); }
const lf = (s) => s.replace(/\r\n/g, "\n");

// 2. A namespace with no registry entry must fail here, not in a tiles run.
attributionKeyFor(UCD_NAMESPACE);
attributionKeyFor(NE_NAMESPACE);

// 3. The wave.
const wave = us2Wave(await loadTrees());

// 4. Tree equality, offline: the committed reports are what the committed inputs build.
const inputs = await loadInputs();
const rebuilt = buildReports({
  tree: buildUsaTree({ avas: inputs.avas, pairs: inputs.pairs, config: inputs.config }),
  diff: inputs.diff, inputs: inputs.inputs,
});
let treeMatches = true;
for (const slug of Object.values(STATE_FILES)) {
  if (lf(await readFile(reportPath(slug), "utf8")) !== `${JSON.stringify(rebuilt[slug], null, 2)}\n`) {
    treeMatches = false;
    console.error(`TREE DIFFERS: ${reportPath(slug)} is not what the committed inputs build`);
  }
}

// 5-6. Every committed input, pin-checked; the raw files too.
const stageInputs = await loadStageInputs({ wave, readFileFn: readFile, sha256hexFn: sha256hex });
for (const [path, sha] of Object.entries(stageInputs.measurementsInputs)) {
  if (sha256hex(await readFile(path)) !== sha) {
    treeMatches = false;
    console.error(`MEASURED INPUT CHANGED: ${path}`);
  }
}
if (!treeMatches && !STAGE && !CHECK_GATE) throw new Error("the recomputed tree differs from the committed tree reports");
console.log(`wave us2: ${wave.places.length} places; inputs pinned; raw files ${stageInputs.raw.map((r) => r.file).join(", ")} match their pins`);

// 7. Connect.
const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const unquote = (v) => v?.trim().replace(/^["']|["']$/g, "");
const client = new pg.Client({ connectionString: unquote(env.DATABASE_URL), ssl: { rejectUnauthorized: false } });
await client.connect();

const ownerApproval = JSON.parse(await readFile("data/wine-map/place-profiles-usa.json", "utf8"))._provenance?.owner_approval ?? null;
const gateFacts = async () => {
  await client.query("begin read only");
  try {
    return await readGateFacts(client, { versions: US2_VERSIONS, ownerApproval, treeMatches });
  } finally {
    await client.query("rollback");
  }
};

try {
  // 8. The gate, before anything is uploaded or written.
  if (STAGE || CHECK_GATE) {
    const reasons = sittingGate(await gateFacts());
    if (reasons.length) {
      console.error(`REFUSED: --stage must not run now (${reasons.length} reason${reasons.length === 1 ? "" : "s"}):`);
      for (const r of reasons) console.error(`  - ${r}`);
      process.exitCode = 1;
    } else {
      console.log("GATE OPEN: every §8.2 / §17 precondition holds");
    }
    if (CHECK_GATE || reasons.length) process.exit();

    const { createClient } = await import("@supabase/supabase-js");
    const bucket = createClient(SUPABASE_URL, unquote(env.SUPABASE_SERVICE_ROLE_KEY), { auth: { persistSession: false } })
      .storage.from("wine-map-sources");
    for (const r of stageInputs.raw) {
      const { data, error } = await bucket.download(r.objectPath);
      let existingSha = null;
      if (error) {
        const status = String(error.statusCode ?? error.status ?? "");
        if (status !== "404" && status !== "400" && !/not.?found/i.test(error.message ?? "")) throw error;
      } else {
        existingSha = sha256hex(Buffer.from(await data.arrayBuffer()));
      }
      const decision = uploadDecision(existingSha, r.sha256);
      if (decision === "upload") {
        const up = await bucket.upload(r.objectPath, await readFile(r.localPath), { contentType: "application/geo+json", upsert: false });
        if (up.error) throw up.error;
      }
      console.log(`RAW ${decision} storage://wine-map-sources/${r.objectPath}`);
    }
  }

  // 9. One transaction for the whole wave.
  await client.query("begin");
  await client.query("set local statement_timeout = 1800000");

  // 10. Dry: the not-yet-live catalog and knowledge, inside the transaction.
  if (!STAGE) {
    for (const [what, file] of [["catalog", US2_FILES.catalog], ["knowledge", US2_FILES.knowledge]]) {
      const seen = await client.query("select 1 from supabase_migrations.schema_migrations where version = $1", [US2_VERSIONS[what]]);
      if (seen.rowCount > 0) continue;
      let sql;
      try {
        sql = await readFile(file, "utf8");
      } catch {
        throw new Error(`generate the ${what} migration first (plan Task ${what === "catalog" ? 2 : 6})`);
      }
      await client.query(sql);
      console.log(`applied ${file} in-transaction`);
    }
  }

  // 11. Stage.
  const report = await stageWave(client, {
    wave, ...stageInputs,
    revision: releaseVersion(),
    importer: `scripts/wine-map-sources/stage-usa-ava.mjs@${execSync("git rev-parse HEAD").toString().trim()}`,
    label: STAGE ? "STAGED" : "STAGED-DRY",
  });

  // 12. Finish.
  if (!STAGE) {
    await client.query("rollback");
    console.log(`DONE (dry): ${report.length} boundaries built and asserted, persisted nothing.`);
  } else {
    await client.query("commit");
    await warnIfNeighbourCacheStale(client);
    console.log(`STAGE COMPLETE: ${report.length} DRAFT boundaries committed; apply the promote next`);
  }
} catch (e) {
  await client.query("rollback").catch(() => {});
  throw e;
} finally {
  await client.end();
}
