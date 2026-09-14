import { describe, expect, it } from "vitest";
import { createSerialQueue, isTransientMatchError } from "./match-board-queue";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("createSerialQueue (BT-S3, review V2-6-07)", () => {
  it("does not start a later task until an earlier one has settled", async () => {
    const order: string[] = [];
    const enqueue = createSerialQueue();
    let resolveFirst: () => void = () => {};
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    enqueue(async () => {
      order.push("first-start");
      await first;
      order.push("first-end");
    });
    enqueue(async () => {
      order.push("second");
    });

    // Two picks made back to back (the second before the first's reply
    // arrives) must not let the second's call overlap the first's.
    await flush();
    await flush();
    expect(order).toEqual(["first-start"]);

    resolveFirst();
    await flush();
    await flush();
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("runs three tasks strictly in enqueue order", async () => {
    const order: number[] = [];
    const enqueue = createSerialQueue();
    // Each task resolves on its own timer, in a different order than the
    // delays would produce if they ran concurrently (3 is the slowest).
    enqueue(async () => {
      await flush();
      order.push(1);
    });
    enqueue(async () => {
      order.push(2);
    });
    enqueue(async () => {
      order.push(3);
    });
    await flush();
    await flush();
    await flush();
    expect(order).toEqual([1, 2, 3]);
  });

  it("a task that throws does not block the tasks queued after it", async () => {
    const order: string[] = [];
    const enqueue = createSerialQueue();
    enqueue(async () => {
      order.push("first");
      throw new Error("boom");
    });
    enqueue(async () => {
      order.push("second");
    });
    await flush();
    await flush();
    expect(order).toEqual(["first", "second"]);
  });
});

describe("isTransientMatchError (BT-S3, review V2-6-07)", () => {
  it("recognises Postgres's own deadlock and unique-violation text (40P01 / 23505)", () => {
    expect(isTransientMatchError("deadlock detected")).toBe(true);
    expect(isTransientMatchError("Deadlock detected")).toBe(true);
    expect(
      isTransientMatchError(
        'duplicate key value violates unique constraint "guesses_one_open_glass_per_candidate"',
      ),
    ).toBe(true);
    // Leading/trailing whitespace, as a raw PostgrestError message can carry.
    expect(isTransientMatchError("  deadlock detected  ")).toBe(true);
  });

  it("leaves a real refusal sentence alone", () => {
    expect(isTransientMatchError("Glass 2 · locked")).toBe(false);
    expect(isTransientMatchError("That wine has been revealed.")).toBe(false);
    expect(isTransientMatchError("This glass is locked in.")).toBe(false);
    expect(isTransientMatchError("Matching is closed.")).toBe(false);
    expect(isTransientMatchError("That wine is not in your pool.")).toBe(false);
    expect(isTransientMatchError("")).toBe(false);
  });
});
