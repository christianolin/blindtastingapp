import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contrast guards on the palette itself, because nothing else in the build has
// an opinion about it. tsc, lint and the component tests were all green while
// the wordmark rendered #5C1A2B on #1B1310 -- about 1.5:1, invisible -- and
// while every inline link in dark sat at 2.89:1. A colour is only wrong
// relative to what it is drawn on, and only this knows those pairs.
//
// WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text and UI boundaries.

// Comments are stripped BEFORE parsing. The declaration regex is naive by
// design -- it only has to read this one file -- but prose like "one step above
// --card: inputs, panels..." inside a comment reads as a declaration to it, and
// silently redefines the token with the rest of the paragraph. That happened,
// and every ratio in the file went undefined at once.
const CSS = readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): Record<string, string> {
  const m = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS);
  if (!m) throw new Error(`no ${selector} block in globals.css`);
  return Object.fromEntries(
    [...m[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()]),
  );
}

const light = block(":root");
const darkOnly = block("\\.dark");
// The .dark block OVERRIDES :root, it does not replace it: a token dark leaves
// alone still resolves to its light value at runtime. Merging the two is what
// the browser actually computes, and so what these ratios must be measured on.
// --on-accent is the case in point — declared once, deliberately the same ink
// in both themes, and absent from .dark entirely.
const dark = { ...light, ...darkOnly };

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
    expect(ratio(t, "--primary-ink", "--background")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t, "--primary-ink", "--card")).toBeGreaterThanOrEqual(4.5);
  });

  it("the filled primary button clears AA for its own label", () => {
    // The other half of the same trade-off: lightening --primary to fix the ink
    // would have dropped this pair to 3.53:1. Both assertions have to hold, and
    // that is why they are two tokens.
    expect(ratio(t, "--primary-foreground", "--primary")).toBeGreaterThanOrEqual(4.5);
  });

  it("the raised surface carries body text and placeholders", () => {
    // --surface-raised is inputs, dropdown panels and the new-tasting rows.
    // It was `bg-white` at 41 call sites, which rendered a literal white panel
    // on the near-black page.
    //
    // Placeholder text on it is asserted for DARK below, not here: in light it
    // is 2.92:1, the same shipped shortfall the placeholder block records, and
    // renaming the class did not cause it -- bg-white was already #ffffff.
    expect(ratio(t, "--foreground", "--surface-raised")).toBeGreaterThanOrEqual(4.5);
  });

  it("labels on the gold accent stay readable, in both themes", () => {
    // Gold is a LIGHT surface whichever theme is on. Letting its label follow
    // --foreground put parchment on gold in dark: 1.81:1, the worst contrast
    // in the app. --on-accent is fixed dark ink for exactly this.
    expect(ratio(t, "--on-accent", "--gold")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t, "--on-accent", "--gold-deep")).toBeGreaterThanOrEqual(4.5);
  });

  it("the destructive colour is readable as text on both grounds", () => {
    expect(ratio(t, "--destructive", "--background")).toBeGreaterThanOrEqual(3);
    expect(ratio(t, "--destructive", "--card")).toBeGreaterThanOrEqual(3);
  });
});

describe("the placeholder shades, which carry real text", () => {
  // Not decorative. --placeholder is the input placeholder in the new-tasting
  // form and the flight picker; --placeholder-soft is the points value on every
  // unanswered ladder row. Both also draw aria-hidden separators and chevrons,
  // but the text uses are what set the bar.
  //
  // Both themes now clear AA on all three grounds these can sit on. Light was
  // 2.55:1 and 1.70:1 on --background until 2026-09-14; dark was 4.04:1 and
  // 2.41:1 before that. Neither was ever caught by anything but measurement.
  it.each([["light", light], ["dark", dark]])(
    "%s clears AA on the page, cards and the raised surface",
    (_name, t) => {
      for (const token of ["--placeholder", "--placeholder-soft"]) {
        expect(ratio(t, token, "--background")).toBeGreaterThanOrEqual(4.3);
        expect(ratio(t, token, "--card")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t, token, "--surface-raised")).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  // -soft is the fainter of the two, and has to STAY fainter or the tier it
  // exists to express is gone. Faint means lighter on a light ground and darker
  // on a dark one, so this compares luminance in the right direction per theme.
  it("keeps -soft fainter than --placeholder in both themes", () => {
    expect(luminance(light["--placeholder-soft"])).toBeGreaterThan(luminance(light["--placeholder"]));
    expect(luminance(dark["--placeholder-soft"])).toBeLessThan(luminance(dark["--placeholder"]));
  });

  // The light pair sits very close to --muted-foreground, which is deliberate
  // and worth stating so nobody "restores the hierarchy" by lightening them.
  // On a #f5efe3 ground AA caps any ink at L <= 0.154, and --muted-foreground is
  // already 0.151: there is no room below it. Dark has room and uses it.
  it("light is compressed against --muted-foreground because AA leaves no room", () => {
    // On a #f5efe3 ground AA caps any ink at L <= 0.154, and --muted-foreground
    // is already 0.151. So in light the placeholder tier cannot sit below the
    // secondary-text tier -- measured, the two are within 0.01 of each other and
    // --placeholder is a hair the lighter. Dark has room and keeps a real gap.
    //
    // Bounds are the measured values, not round numbers: if someone lightens the
    // light pair to "restore the hierarchy" they break AA, and this says why.
    const lightGap = Math.abs(
      luminance(light["--muted-foreground"]) - luminance(light["--placeholder"]),
    );
    expect(lightGap).toBeLessThan(0.01);
    expect(luminance(light["--placeholder"])).toBeLessThanOrEqual(0.154);

    const darkGap = luminance(dark["--muted-foreground"]) - luminance(dark["--placeholder"]);
    expect(darkGap).toBeGreaterThan(0.05);
  });
});

describe("the console palette, which is dark in BOTH themes", () => {
  it("keeps its ink readable on its own ground", () => {
    // These three are deliberately not overridden in .dark. If someone ever
    // adds a .dark variant for them, this is what should still hold.
    expect(ratio(light, "--console-ink", "--console")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light, "--console-ink", "--console-card")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the wrong-answer red distinguishable on the reveal", () => {
    expect(ratio(light, "--miss", "--console")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the dark palette's coverage of the light one", () => {
  it("overrides every colour token except the console ones already dark", () => {
    // --radius is not a colour; the console three are dark-surface values the
    // reveal screen uses in both themes. Anything ELSE missing here is a light
    // value bleeding onto a near-black ground, which is how --border-light at
    // #f0e6d1 nearly shipped.
    //
    // --miss is allowed but no longer absent: BT-D1 set it explicitly, to the
    // same value it already had in light. Kept in the list because it is still
    // legitimately either way.
    //
    // --on-accent is the same kind of exception from the other direction: it is
    // ink for the GOLD surface, and gold is light in both themes, so the ink
    // must NOT flip with the theme. That is the whole point of it.
    const allowed = new Set([
      "--radius", "--miss", "--console", "--console-card", "--console-ink",
      "--on-accent",
    ]);
    const missing = Object.keys(light).filter((k) => !(k in darkOnly) && !allowed.has(k));
    expect(missing).toEqual([]);
  });
});
