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
  // `\n\s*\}` rather than `\n\}`: .dark is nested inside @media screen, so its
  // closing brace is indented. The looser form stops at the block's OWN brace
  // rather than running on to the media query's, which it did only harmlessly
  // because nothing sits between the two.
  const m = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`).exec(CSS);
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

/**
 * Composite an rgba() TOKEN over the ground it is drawn on, so the translucent
 * border tokens can be measured instead of skipped. They were skipped, and that
 * hid all five of them sitting between 1.21:1 and 1.95:1 in dark.
 */
function composite(color: string, ground: string): string {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/.exec(color.trim());
  if (!m) return color;
  const a = m[4] === undefined ? 1 : Number(m[4]);
  const g = ground.trim().replace("#", "");
  const gc = [0, 2, 4].map((i) => parseInt(g.slice(i, i + 2), 16));
  const fc = [1, 2, 3].map((i) => Number(m[i]));
  const mix = fc.map((f, i) => Math.round(a * f + (1 - a) * gc[i]));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Relative luminance, WCAG 2.x. */
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

/** A translucent ink composited over its ground, the way the browser paints a
 *  `bg-success/12` chip: straight alpha in sRGB. Hex in, hex out. */
function over(ink: string, alpha: number, ground: string): string {
  const rgb = (hex: string) =>
    [0, 2, 4].map((i) => parseInt(hex.trim().replace("#", "").slice(i, i + 2), 16));
  const [a, b] = [rgb(ink), rgb(ground)];
  return (
    "#" +
    a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("")
  );
}

/** Rounded the way a report would show it, so failures read in familiar units. */
const ratio = (t: Record<string, string>, ink: string, ground: string) =>
  Number(contrast(composite(t[ink], t[ground]), t[ground]).toFixed(2));

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (name, t) => {
  it("body text clears AA on the page and on cards", () => {
    expect(ratio(t, "--foreground", "--background")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t, "--card-foreground", "--card")).toBeGreaterThanOrEqual(4.5);
  });

  it("muted text clears AA on every surface it is drawn on", () => {
    // --background and --card alone are not enough, and that is exactly how
    // #7a6a52 shipped: it passed both while failing --muted at 4.14:1 (the
    // segmented-control chips), --accent at 4.07:1 and --secondary at 3.86:1.
    // A token is only as good as the worst ground it lands on.
    for (const ground of [
      "--background", "--card", "--muted", "--accent", "--secondary", "--surface-raised",
    ]) {
      expect(ratio(t, "--muted-foreground", ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the hover ink lifts rather than sinking, and stays above AA", () => {
    // hover:text-primary/80 composited toward the background, which DARKENS on
    // a dark ground -- backwards for a lift, and 3.75:1. Solid shades instead,
    // and the direction is asserted so nobody reintroduces the translucent form.
    expect(ratio(t, "--primary-ink-hover", "--card")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t, "--primary-ink-hover", "--background")).toBeGreaterThanOrEqual(4.5);
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

  it("the success ink clears AA on every ground it is drawn on, its own chip included", () => {
    // A category you got, "+N" in the standings, the "locked in" line. It was a
    // literal #3f5b42 in the play, standings and results code, which cannot
    // follow the theme: 2.24:1 on the dark card and 2.08:1 on its own 12% chip.
    for (const ground of ["--background", "--card", "--surface-raised"]) {
      expect(ratio(t, "--success", ground)).toBeGreaterThanOrEqual(4.5);
    }
    const chip = over(t["--success"], 0.12, t["--card"]);
    expect(Number(contrast(t["--success"], chip).toFixed(2))).toBeGreaterThanOrEqual(4.5);
  });

  it("the destructive colour clears AA as text, on every ground it lands on", () => {
    // 3:1 was too lenient and let it sit at 3.81 on --card and 3.38 on
    // --surface-raised in dark. This is body text -- the error line under the
    // lobby Start button, the host's reveal refusal -- not a decorative accent,
    // so it takes the 4.5 that text takes.
    for (const ground of ["--background", "--card", "--surface-raised"]) {
      expect(ratio(t, "--destructive", ground)).toBeGreaterThanOrEqual(4.5);
    }
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

  // TIER ORDER, expressed as contrast on the page rather than raw luminance so
  // it reads the same in both themes: secondary text must be STRONGER than a
  // placeholder, never the other way round.
  //
  // In light this held only after --muted-foreground was darkened to clear the
  // chips. Before that the two were within 0.003 of each other in luminance and
  // --placeholder was fractionally the stronger of the pair, which is backwards.
  it.each([["light", light], ["dark", dark]])(
    "%s keeps secondary text stronger than placeholder text",
    (_name, t) => {
      expect(ratio(t, "--muted-foreground", "--background"))
        .toBeGreaterThan(ratio(t, "--placeholder", "--background"));
      expect(ratio(t, "--placeholder", "--background"))
        .toBeGreaterThan(ratio(t, "--placeholder-soft", "--background"));
    },
  );

  // And the light placeholder is at its ceiling, which is why the gap above it
  // is narrow. On a #f5efe3 ground AA caps any ink at L <= 0.154; --placeholder
  // is 0.153. It cannot be made fainter without failing, so anyone wanting more
  // separation has to move --muted-foreground, not this.
  it("light --placeholder sits at the AA ceiling and cannot go lighter", () => {
    expect(luminance(light["--placeholder"])).toBeLessThanOrEqual(0.154);
    expect(luminance(light["--placeholder"])).toBeGreaterThan(0.145);
  });
});

describe("the translucent border tokens, which used to be unmeasurable", () => {
  // luminance() refused rgba(), so ratio() silently skipped these five and the
  // guard had nothing to say about any border in dark. They are composited now.
  it("the input border identifies its field, in BOTH themes", () => {
    // A text field's border is how you know the field is there; WCAG 1.4.11
    // asks 3:1 for what identifies a control. Dark was 1.59:1 and light 1.40:1
    // -- and light was the worse of the two in practice, because the white fill
    // is only 1.07:1 from the page, so neither the fill nor the edge said a
    // field was there.
    for (const t of [light, dark]) {
      for (const ground of ["--background", "--card", "--surface-raised"]) {
        expect(ratio(t, "--input", ground)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("the dark divider scale is a scale, and its default edge clears 3:1", () => {
    // Was 1.24 / 1.49 / 1.95 on --card: a hairline you could not see, on a
    // ground only 1.13:1 from the card itself. --border draws outline buttons
    // and card edges, so it takes the 3:1 a control's shape takes, on the worst
    // of the four grounds it lands on. --border-light stays the quiet step: a
    // decorative rule between list rows is not a control and does not owe 3:1.
    const worst = (token: string) =>
      Math.min(...["--card", "--background", "--surface-raised", "--primary"]
        .map((g) => ratio(dark, token, g)));
    expect(worst("--border")).toBeGreaterThanOrEqual(3);
    expect(worst("--sidebar-border")).toBeGreaterThanOrEqual(3);
    expect(worst("--border-strong")).toBeGreaterThan(worst("--border"));
    expect(worst("--border-light")).toBeLessThan(worst("--border"));
    expect(worst("--border-light")).toBeGreaterThanOrEqual(1.8);
  });

  it("light's divider scale is a scale too, and clears 3:1 where dark does", () => {
    // Light was flatter AND fainter than dark: 1.08 / 1.31 / 1.36 on the page,
    // with --border-strong six hundredths above --border. Both themes now hold
    // the same shape, so a border means the same thing whichever one you are in.
    const worst = (token: string) =>
      Math.min(...["--background", "--card", "--surface-raised"].map((g) => ratio(light, token, g)));
    expect(worst("--border")).toBeGreaterThanOrEqual(3);
    expect(worst("--sidebar-border")).toBeGreaterThanOrEqual(3);
    expect(worst("--border-strong")).toBeGreaterThan(worst("--border"));
    expect(worst("--border-light")).toBeLessThan(worst("--border"));
    expect(worst("--border-light")).toBeGreaterThanOrEqual(1.6);
  });
});

describe("the console palette (the add-wine camera surfaces), which is dark in BOTH themes", () => {
  it("keeps its ink readable on its own ground", () => {
    // These three are deliberately not overridden in .dark. If someone ever
    // adds a .dark variant for them, this is what should still hold.
    expect(ratio(light, "--console-ink", "--console")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light, "--console-ink", "--console-card")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the wrong-answer red distinguishable on the camera surfaces", () => {
    expect(ratio(light, "--miss", "--console")).toBeGreaterThanOrEqual(4.5);
  });

  it("carries readable body ink, in BOTH themes", () => {
    // The bug this token exists for: the add-wine camera screens used
    // text-background, which is parchment in light and #1b1310 in dark --
    // byte-identical to --console. 1.00:1. Those screens rendered as blank
    // slabs. Asserted against BOTH theme objects because the console ground
    // does not flip, so neither may its ink.
    for (const t of [light, dark]) {
      expect(ratio(t, "--console-foreground", "--console")).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t, "--console-foreground", "--console-card")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("never lets --background stand in for the console's ink again", () => {
    // In dark these are the same colour. Any future code that reaches for
    // --background to mean "the light one" on a console (add-wine camera)
    // surface is this bug.
    expect(dark["--background"]).toBe(dark["--console"] ?? light["--console"]);
  });
});

describe("the dark palette's coverage of the light one", () => {
  it("overrides every colour token except the console ones already dark", () => {
    // --radius is not a colour; the console three are dark-surface values the
    // add-wine camera surfaces use in both themes. Anything ELSE missing here
    // is a light value bleeding onto a near-black ground, which is how
    // --border-light at #f0e6d1 nearly shipped.
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
      "--console-foreground", "--on-accent",
    ]);
    const missing = Object.keys(light).filter((k) => !(k in darkOnly) && !allowed.has(k));
    expect(missing).toEqual([]);
  });
});
