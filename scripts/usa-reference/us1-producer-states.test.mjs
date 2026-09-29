// scripts/usa-reference/us1-producer-states.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const load = async (p) => JSON.parse(await readFile(p, "utf8"));

test("the research covers exactly the 45 Walla Walla Valley producers, by id and name", async () => {
  const draft = await load("data/usa-reference/us1-cleanup-draft.json");
  const expected = draft.steps["7_pseudo_regions"]["Walla Walla Valley"].producers.map((p) => [p.id, p.name]).sort();
  const file = await load("data/usa-reference/us1-producer-states.json");
  assert.equal(expected.length, 45);
  assert.deepEqual(file.producers.map((p) => [p.id, p.name]).sort(), expected);
});

test("each producer has a state (WA, OR or null) and one citable source", async () => {
  const { producers } = await load("data/usa-reference/us1-producer-states.json");
  for (const p of producers) {
    assert.ok(["WA", "OR", null].includes(p.state), `${p.name}: state ${p.state}`);
    assert.match(p.source_url ?? "", /^https:\/\/(?!www\.google\.|google\.|bing\.com|duckduckgo\.com)/, `${p.name}: a real https source, not a search page`);
    assert.ok(typeof p.source === "string" && p.source.length > 5, `${p.name}: source`);
    // Washington ZIPs run 98001-99403 (Lullaby moved to Port Townsend, WA 98368).
    if (p.state === "WA") assert.match(p.winery_address, /\bWA\s+9[89]\d{3}\b/, `${p.name}: a WA address`);
    if (p.state === "OR") assert.match(p.winery_address, /\bOR\s+97\d{3}\b/, `${p.name}: an OR address`);
    if (p.state === null) assert.ok(typeof p.note === "string" && p.note.length > 10, `${p.name}: why null`);
    assert.ok(!/[<>…]/.test(JSON.stringify(p)), `${p.name}: placeholder text`);
  }
});
