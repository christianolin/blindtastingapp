import assert from "node:assert/strict";
import test from "node:test";
import { checkPinnedBody, githubRawUrl, parseFeatureCollection } from "./pinned-fetch.mjs";

const SHA = `355f7da${"0".repeat(31)}ab`; // 40 lowercase hex characters

test("a raw URL needs a full commit SHA, never a branch or a short SHA", () => {
  assert.equal(
    githubRawUrl({ owner: "UCDavisLibrary", repo: "ava", commit: SHA, path: "avas_by_state/CA_avas.geojson" }),
    `https://raw.githubusercontent.com/UCDavisLibrary/ava/${SHA}/avas_by_state/CA_avas.geojson`,
  );
  for (const commit of ["master", "main", "355f7da", "HEAD", "", undefined, SHA.toUpperCase()]) {
    assert.throws(() => githubRawUrl({ owner: "o", repo: "r", commit, path: "a.json" }), /40-character commit SHA/, String(commit));
  }
  assert.throws(() => githubRawUrl({ owner: "o", repo: "r", commit: SHA, path: "../x" }), /refusing path/);
  assert.throws(() => githubRawUrl({ owner: "o", repo: "r", commit: SHA, path: "/etc/x" }), /refusing path/);
});

test("a body must match its pin in size and sha256", () => {
  const body = Buffer.from("abc");
  const good = { bytes: 3, sha256: "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD" };
  assert.deepEqual(checkPinnedBody(body), good);
  assert.deepEqual(checkPinnedBody(body, good), good);
  assert.throws(() => checkPinnedBody(Buffer.from("abd"), good), /sha256/);
  assert.throws(() => checkPinnedBody(Buffer.from("abcd"), good), /size 4 B, pinned 3 B/);
});

test("a Git LFS pointer is refused", () => {
  const pointer = Buffer.from("version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 16129799\n");
  assert.throws(() => checkPinnedBody(pointer), /Git LFS pointer/);
});

test("only a non-empty FeatureCollection parses", () => {
  assert.equal(parseFeatureCollection(Buffer.from('{"type":"FeatureCollection","features":[{"type":"Feature"}]}')).features.length, 1);
  assert.throws(() => parseFeatureCollection(Buffer.from("<html>rate limited</html>")), /not JSON/);
  assert.throws(() => parseFeatureCollection(Buffer.from('{"type":"FeatureCollection","features":[]}')), /non-empty/);
  assert.throws(() => parseFeatureCollection(Buffer.from('{"type":"Feature"}')), /non-empty/);
});
