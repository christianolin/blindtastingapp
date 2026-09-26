import { describe, expect, it } from "vitest";
import { isScrollableOverflow, nearestScrollContainer } from "./scroll-container";

type FakeNode = { name: string; overflowY: string; parentElement: FakeNode | null };

function chain(...nodes: [string, string][]): FakeNode {
  // nodes[0] is the element, the last one the root.
  let parent: FakeNode | null = null;
  let node: FakeNode | null = null;
  for (const [name, overflowY] of [...nodes].reverse()) {
    node = { name, overflowY, parentElement: parent };
    parent = node;
  }
  return node as FakeNode;
}

const overflowOf = (n: FakeNode) => n.overflowY;

describe("isScrollableOverflow", () => {
  it("auto and scroll scroll; visible, hidden and clip do not", () => {
    expect(isScrollableOverflow("auto")).toBe(true);
    expect(isScrollableOverflow("scroll")).toBe(true);
    expect(isScrollableOverflow("visible")).toBe(false);
    expect(isScrollableOverflow("hidden")).toBe(false);
    expect(isScrollableOverflow("clip")).toBe(false);
    expect(isScrollableOverflow("")).toBe(false);
  });
});

describe("nearestScrollContainer", () => {
  it("finds the app shell's content column above the room, not the hidden-overflow frame", () => {
    const el = chain(
      ["room", "visible"],
      ["main", "visible"],
      ["column", "auto"],
      ["frame", "hidden"],
      ["body", "visible"],
    );
    expect(nearestScrollContainer(el, overflowOf)?.name).toBe("column");
  });

  it("never returns the element itself", () => {
    const el = chain(["room", "auto"], ["main", "visible"], ["column", "scroll"]);
    expect(nearestScrollContainer(el, overflowOf)?.name).toBe("column");
  });

  it("is null when nothing above scrolls, or with no element", () => {
    expect(nearestScrollContainer(chain(["room", "visible"], ["body", "hidden"]), overflowOf)).toBeNull();
    expect(nearestScrollContainer<FakeNode>(null, overflowOf)).toBeNull();
  });
});
