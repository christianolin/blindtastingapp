// The place tree is an 811 KB RPC; on a flaky phone network it fails. These pin
// what the explorer does about it: one automatic retry after a pause, then a
// visible failure with a manual Retry — never a silent `tree = []` that reads
// exactly like "still loading".
import { describe, expect, it } from "vitest";
import {
  INITIAL_TREE_LOAD,
  TREE_AUTO_RETRY_MS,
  treeFetchDelay,
  treeLoadReducer,
  type TreeLoad,
  type TreeLoadEvent,
} from "./tree-load";

function run(events: TreeLoadEvent["type"][], from: TreeLoad = INITIAL_TREE_LOAD): TreeLoad {
  return events.reduce((s, type) => treeLoadReducer(s, { type } as TreeLoadEvent), from);
}

describe("treeLoadReducer", () => {
  it("starts loading, on the first attempt, with no delay", () => {
    expect(INITIAL_TREE_LOAD).toEqual({ state: "loading", attempt: 0 });
    expect(treeFetchDelay(INITIAL_TREE_LOAD.attempt)).toBe(0);
  });

  it("loading → ready", () => {
    expect(run(["resolved"])).toEqual({ state: "ready", attempt: 0 });
  });

  it("retries exactly once automatically, after TREE_AUTO_RETRY_MS", () => {
    const afterFirstFailure = run(["rejected"]);
    expect(afterFirstFailure).toEqual({ state: "loading", attempt: 1 });
    expect(TREE_AUTO_RETRY_MS).toBe(2000);
    expect(treeFetchDelay(afterFirstFailure.attempt)).toBe(TREE_AUTO_RETRY_MS);
    // ...and the retry succeeding is an ordinary ready.
    expect(run(["rejected", "resolved"])).toEqual({ state: "ready", attempt: 1 });
  });

  it("fails once the automatic retry has failed too", () => {
    expect(run(["rejected", "rejected"])).toEqual({ state: "failed", attempt: 1 });
  });

  it("a manual retry from failed loads again at once, and a second failure stays failed", () => {
    const retried = run(["rejected", "rejected", "retry"]);
    expect(retried).toEqual({ state: "loading", attempt: 2 });
    expect(treeFetchDelay(retried.attempt)).toBe(0);
    expect(run(["rejected", "rejected", "retry", "rejected"])).toEqual({
      state: "failed",
      attempt: 2,
    });
    expect(run(["rejected", "rejected", "retry", "resolved"])).toEqual({
      state: "ready",
      attempt: 2,
    });
  });

  it("ignores a retry that is not from failed (a double tap, or while ready)", () => {
    const loading = run(["rejected"]);
    expect(treeLoadReducer(loading, { type: "retry" })).toBe(loading);
    const ready = run(["resolved"]);
    expect(treeLoadReducer(ready, { type: "retry" })).toBe(ready);
  });

  it("never lets a stale rejection undo a success", () => {
    const ready = run(["resolved"]);
    expect(treeLoadReducer(ready, { type: "rejected" })).toBe(ready);
    expect(treeLoadReducer(ready, { type: "resolved" })).toBe(ready);
  });
});
