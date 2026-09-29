// Pure helpers for fetching a pinned file from GitHub (spec 2026-09-29 §5.1,
// §5.2). A download is identified by a full commit SHA -- never a branch, which
// moves -- and checked against a recorded size and sha256, so a rerun either
// gets the same bytes or stops.
import { sha256hex } from "../wine-map-tiles/lib.mjs";

export const COMMIT_SHA = /^[0-9a-f]{40}$/;

export function githubRawUrl({ owner, repo, commit, path }) {
  if (typeof commit !== "string" || !COMMIT_SHA.test(commit)) {
    throw new Error(`refusing "${commit}": pin a full 40-character commit SHA, never a branch or tag name`);
  }
  if (!path || path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`refusing path "${path}"`);
  }
  return `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${path}`;
}

export function checkPinnedBody(buffer, pin = null) {
  if (buffer.subarray(0, 64).toString("utf8").startsWith("version https://git-lfs")) {
    throw new Error("got a Git LFS pointer, not the file");
  }
  const sha256 = sha256hex(buffer);
  if (pin) {
    if (pin.bytes !== buffer.length) throw new Error(`size ${buffer.length} B, pinned ${pin.bytes} B`);
    if (pin.sha256 !== sha256) throw new Error(`sha256 ${sha256}, pinned ${pin.sha256}`);
  }
  return { bytes: buffer.length, sha256 };
}

export function parseFeatureCollection(buffer) {
  let json;
  try {
    json = JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new Error(`not JSON: ${error.message}`);
  }
  if (json?.type !== "FeatureCollection" || !Array.isArray(json.features) || json.features.length === 0) {
    throw new Error("not a non-empty GeoJSON FeatureCollection");
  }
  return json;
}
