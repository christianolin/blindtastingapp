import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SOURCE, genArgs, transactionLines } from "./gen-place-profiles-args.mjs";

test("defaults: repo is the cwd, the old source, no write, not bare, the old version and name", () => {
  assert.deepEqual(genArgs([], {}, "/work/repo"), {
    repo: "/work/repo",
    source: DEFAULT_SOURCE,
    write: false,
    bare: false,
    version: "20260915110000",
    name: "place_profiles_iberia",
  });
});

test("BLINDR_REPO wins over the cwd", () => {
  assert.equal(genArgs([], { BLINDR_REPO: "C:/Users/Birchenz/blindtastingapp" }, "/x").repo,
    "C:/Users/Birchenz/blindtastingapp");
});

test("a US run", () => {
  const args = genArgs(
    ["--source", "data/wine-map/place-profiles-usa.json", "--bare", "--write",
      "--version", "20261001104747", "--name", "usa_us2_knowledge"],
    {}, "/r",
  );
  assert.equal(args.source, "data/wine-map/place-profiles-usa.json");
  assert.equal(args.bare, true);
  assert.equal(args.write, true);
  assert.equal(args.version, "20261001104747");
  assert.equal(args.name, "usa_us2_knowledge");
});

test("a flag with no value is an error, not the next flag", () => {
  assert.throws(() => genArgs(["--source", "--bare"], {}, "/r"), /--source needs a value/);
  assert.throws(() => genArgs(["--version"], {}, "/r"), /--version needs a value/);
});

test("--bare emits no transaction statement; the default keeps begin/commit", () => {
  const bare = transactionLines(true);
  for (const line of [...bare.open, ...bare.close]) {
    assert.doesNotMatch(line, /^\s*(begin|commit|rollback)\s*;/i);
  }
  assert.deepEqual(transactionLines(false), { open: ["begin;", ""], close: ["commit;"] });
});
