import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The laptop candidates column (lg+) is sticky under the app bar. Since the
// region-guess list (addendum R3) opens the top region in place on its typical
// wines — Bordeaux has 7, Bourgogne 15 — the column can be far taller than the
// window, and a sticky box taller than its scroll port shows its foot (regions
// 2-5, "Show all N regions") only once the page has scrolled to its very end.
// So the column is capped to the window below its sticky top and scrolls
// itself (Task 3 review round; a departure from the base spec's §8 "no nested
// scroller", flagged in the plan for the owner). vitest runs without a DOM and
// cannot lay the page out, so this pins the classes that do it.
const SOURCE = readFileSync(fileURLToPath(new URL("./training-room.tsx", import.meta.url)), "utf8");

function columnClasses(): string[] {
  const asides = [...SOURCE.matchAll(/<aside className="([^"]*)"/g)];
  expect(asides).toHaveLength(1);
  return asides[0][1].split(/\s+/);
}

/** The first class's captured number, or null when no class matches. */
function px(classes: string[], pattern: RegExp): number | null {
  for (const c of classes) {
    const m = pattern.exec(c);
    if (m) return Number(m[1]);
  }
  return null;
}

describe("the laptop candidates column", () => {
  it("sticks under the app bar and stops 16 px short of the window's foot", () => {
    const classes = columnClasses();
    expect(classes).toContain("sticky");
    const top = px(classes, /^top-\[(\d+)px\]$/);
    const cap = px(classes, /^max-h-\[calc\(100dvh-(\d+)px\)\]$/);
    expect(top).not.toBeNull();
    expect(cap).not.toBeNull();
    // The app shell's content column is the scroll port and fills the window
    // (h-dvh), so top + height stays at 100dvh - 16px.
    expect((cap ?? 0) - (top ?? 0)).toBe(16);
  });

  it("scrolls itself once its open regions outgrow the window", () => {
    expect(columnClasses()).toContain("overflow-y-auto");
  });
});
