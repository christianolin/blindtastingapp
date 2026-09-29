// Renders the US-1 forward and revert SQL from their templates and the
// committed spec and pre-image. Pure renderUs1Sql; running the file writes both.
// Usage: node scripts/usa-reference/render-us1-sql.mjs
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { plpgsqlRefArray } from "./us1-queries.mjs";
import { FORWARD_PATH, PREIMAGE_PATH, REVERT_PATH, SPEC_PATH } from "./us1-spec-lib.mjs";

export function renderUs1Sql({ template, spec, preimage }) {
  const specJson = JSON.stringify(spec, null, 2);
  const preJson = JSON.stringify(preimage, null, 2);
  if (specJson.includes("$spec$")) throw new Error("the spec contains $spec$");
  if (preJson.includes("$pre$")) throw new Error("the pre-image contains $pre$");
  // Function replacers: a "$" in the JSON must never act as a replacement pattern.
  return template
    .replace("__US1_REF_QUERIES__", () => plpgsqlRefArray())
    .replace("__US1_SPEC__", () => specJson)
    .replace("__US1_PREIMAGE__", () => preJson);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const spec = JSON.parse(await readFile(SPEC_PATH, "utf8"));
  const preimage = JSON.parse(await readFile(PREIMAGE_PATH, "utf8"));
  for (const [tpl, out] of [["scripts/usa-reference/us1-cleanup.sql.template", FORWARD_PATH], ["scripts/usa-reference/us1-cleanup-revert.sql.template", REVERT_PATH]]) {
    let template;
    try { template = await readFile(tpl, "utf8"); } catch { console.log(`skip ${out} (no ${tpl} yet)`); continue; }
    await writeFile(out, renderUs1Sql({ template: template.replace(/\r\n/g, "\n"), spec, preimage }));
    console.log(`wrote ${out}`);
  }
}
