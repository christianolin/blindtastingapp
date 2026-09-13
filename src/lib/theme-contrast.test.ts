import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contrast guards on the palette itself, because nothing else in the build has
// an opinion about it. tsc, lint and the component tests were all green while
// the wordmark rendered #5C1A2B on #1B1310 -- about 1.5:1, invisible -- and
// while every inline link in dark sat at 2.89:1. A colour is only wrong
// relative to what it is drawn on, and only this knows those pairs.
//
// WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text and UI boundaries.

const CSS = readFileSync("src/app/globals.css", "utf8");

function block(selector: string): Record<string, string> {
  const m = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS);
  if (!m) throw new Error(`no ${selector} block in globals.css`);
  return Object.fromEntries(
    [...m[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()]),
  );
}

const light = block(":root");
const dark = block("\\.dark");

/** Relative luminance, WCAG 2.x. Hex only -- the rgba() tokens are borders. */
function luminance(hex: string): number {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Rounded the way a report would show it, so failures read in familiar units. */
const ratio = (t: Record<string, string>, ink: string, ground: string) =>
  Number(contrast(t[ink], t[ground]).toFixed(2));

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (name, t) => {
  it("body text clears AA on the page and on cards", () => {
    expect(ratio(t, "--foreground", "--background")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t, "--card-foreground", "--card")).toBeGreaterThanOrEqual(4.5);
  });

  it("muted text clears AA, since it is still body copy", () => {
    expect(ratio(t, "--muted-foreground", "--background")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t, "--muted-foreground", "--card")).toBeGreaterThanOrEqual(4.5);
  });

  it("inline links clear AA on both grounds they appear on", () => {
    // The regression this file was written for. --primary was serving as link
    // ink and measured 2.89:1 on --card in dark.
    expect(ratio(t, "--link", "--background")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t, "--link", "--card")).toBeGreaterThanOrEqual(4.5);
  });

  it("the filled primary button clears AA for its own label", () => {
    // The other half of the same trade-off: lightening --primary to fix the ink
    // would have dropped this pair to 3.53:1. Both assertions have to hold, and
    // that is why they are two tokens.
    expect(ratio(t, "--primary-foreground", "--primary")).toBeGreaterThanOrEqual(4.5);
  });

  it("the destructive colour is readable as text on both grounds", () => {
    expect(ratio(t, "--destructive", "--background")).toBeGreaterThanOrEqual(3);
    expect(ratio(t, "--destructive", "--card")).toBeGreaterThanOrEqual(3);
  });
});

describe("the console palette, which is dark in BOTH themes", () => {
  it("keeps its ink readable on its own ground", () => {
    // These four are deliberately not overridden in .dark. If someone ever adds
    // a .dark variant for them, this is what should still hold.
    expect(ratio(light, "--console-ink", "--console")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light, "--console-ink", "--console-card")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the wrong-answer red distinguishable on the reveal", () => {
    expect(ratio(light, "--miss", "--console")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the dark palette's coverage of the light one", () => {
  it("overrides every colour token except the four that are already dark", () => {
    // --radius is not a colour; the console four and --miss are dark-surface
    // values the reveal screen uses in both themes. Anything ELSE missing here
    // is a light value bleeding onto a near-black ground, which is how
    // --border-light at #f0e6d1 nearly shipped.
    const allowed = new Set([
      "--radius", "--miss", "--console", "--console-card", "--console-ink",
    ]);
    const missing = Object.keys(light).filter((k) => !(k in dark) && !allowed.has(k));
    expect(missing).toEqual([]);
  });
});
